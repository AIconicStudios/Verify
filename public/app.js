import { BRAND_NAMES, findBrand, checklistFor, checkSerial, checkScannedCode } from "./brands.js";

const MAX_PHOTOS = 8;
const MAX_EDGE = 1568; // larger images add upload time without adding detail the model can use
const HISTORY_KEY = "verify.history";

// Guided shot lists: the close-ups an authenticator would ask for, per category.
const CATEGORIES = {
  bag: { name: "Bag", shots: [
    ["Whole bag, front", "Flat light, whole bag in frame"],
    ["Logo or brand stamp", "Get close; letters must be sharp"],
    ["Stitching close-up", "A handle base or corner seam"],
    ["Hardware", "Zipper pull, clasp or buckle engraving"],
    ["Serial / date code tag", "Usually inside, on a leather tab"],
    ["Interior lining", "Open the bag and show the lining"],
  ] },
  shoes: { name: "Shoes", shots: [
    ["Side profile", "One shoe, outer side"],
    ["Size tag inside", "The label under the tongue or on the lining"],
    ["Logo close-up", "Tongue, heel tab or side logo"],
    ["Sole", "Whole outsole, tread pattern visible"],
    ["Stitching and toe box", "From above, close"],
    ["Insole", "Printed logo on the footbed"],
  ] },
  clothing: { name: "Clothing", shots: [
    ["Whole garment, front", "Laid flat"],
    ["Neck label", "Brand label, close and sharp"],
    ["Care / wash tag", "All lines of text readable"],
    ["Logo or print", "Embroidery or print close-up"],
    ["Stitching", "A hem or seam, inside out"],
    ["Buttons, zips or hardware", "Any engraved branding"],
  ] },
  watch: { name: "Watch", shots: [
    ["Dial, straight on", "Avoid glare on the crystal"],
    ["Case back", "Engravings readable"],
    ["Crown and case side", "Logo on the crown"],
    ["Clasp or buckle", "Stamps and engraving"],
    ["Serial / reference numbers", "Between the lugs or on the case back"],
    ["Bracelet or strap", "Links and end pieces"],
  ] },
  jewelry: { name: "Jewelry", shots: [
    ["Whole piece", "On a plain background"],
    ["Hallmarks and stamps", "Metal purity and maker's marks"],
    ["Logo or signature", "Engraved brand name"],
    ["Clasp or closure", "Close-up"],
    ["Serial number", "If the piece has one"],
  ] },
  accessory: { name: "Accessory", shots: [
    ["Whole item", "Front, flat light"],
    ["Logo or brand stamp", "Close and sharp"],
    ["Stitching or edges", "A corner or edge close-up"],
    ["Hardware", "Buckle, snap or zipper"],
    ["Serial or label", "Any code, tag or label"],
  ] },
  other: { name: "Other", shots: [
    ["Whole item", "Front, flat light"],
    ["Logo or branding", "Close and sharp"],
    ["Labels or serial numbers", "Any tag, code or label"],
    ["Construction details", "Seams, joints or finish"],
  ] },
};

const VERDICTS = {
  likely_authentic: { label: "Likely authentic", tone: "t-good" },
  likely_counterfeit: { label: "Likely counterfeit", tone: "t-bad" },
  inconclusive: { label: "Inconclusive", tone: "t-warn" },
};
const MARKS = { pass: "✓", fail: "✕", unclear: "?", not_visible: "–" };

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const state = {
  category: "bag", brand: null, photos: [], step: 0, stream: null, screen: "home",
  scanMode: "code", thumb: null,
  evidence: { code: null, serial: null, answers: {} }, // gathered by the free on-device check
};

// ---------- Navigation ----------
const BACK = { setup: "home", check: "setup", scan: "check", inspect: "check", capture: "setup", result: "home" };
// Screens with a live camera, and the elements each one uses.
const CAMERAS = {
  capture: { video: "video", error: "cam-error", shutter: "shutter" },
  scan: { video: "scan-video", error: "scan-error", shutter: "scan-shutter" },
};

function show(screen) {
  for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== screen;
  state.screen = screen;
  $("back").hidden = !BACK[screen];
  stopCamera();
  if (CAMERAS[screen]) startCamera();
  if (screen === "home") renderHistory();
  if (screen === "check") renderHub();
  // Keep one browser-history entry while away from home, so the phone's back
  // button steps back through the app instead of closing it.
  if (screen !== "home" && !history.state?.inApp) history.pushState({ inApp: true }, "");
  if (screen === "home" && history.state?.inApp) history.back();
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 6000);
}

// ---------- Setup ----------
function renderCategories() {
  $("categories").replaceChildren(...Object.entries(CATEGORIES).map(([key, cat]) => {
    const chip = el("button", "chip", cat.name);
    chip.type = "button";
    chip.setAttribute("role", "radio");
    chip.setAttribute("aria-checked", String(key === state.category));
    chip.onclick = () => { state.category = key; renderCategories(); };
    return chip;
  }));
}

// ---------- Camera ----------
async function startCamera() {
  const screen = state.screen;
  const cam = CAMERAS[screen];
  $(cam.error).hidden = true;
  $(cam.shutter).disabled = false;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false,
    });
    if (state.screen !== screen) return stream.getTracks().forEach((t) => t.stop()); // user left during the permission prompt
    state.stream = stream;
    $(cam.video).srcObject = stream;
    await $(cam.video).play();
    if (screen === "scan" && state.scanMode === "code") watchForCode();
  } catch (err) {
    if (state.screen !== screen) return;
    $(cam.shutter).disabled = true;
    $(cam.error).hidden = false;
    $(cam.error).textContent = err.name === "NotAllowedError"
      ? "Camera access was blocked. Allow it in your browser settings, or use Upload to pick a photo."
      : "No camera available here. Use Upload to pick a photo instead.";
  }
}

function stopCamera() {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
  for (const cam of Object.values(CAMERAS)) $(cam.video).srcObject = null;
}

function toCanvas(source, width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toJpeg(source, width, height, maxEdge = MAX_EDGE, quality = 0.85) {
  return toCanvas(source, width, height, maxEdge).toDataURL("image/jpeg", quality);
}

function shots() { return CATEGORIES[state.category].shots; }

function addPhoto(dataUrl) {
  if (state.photos.length >= MAX_PHOTOS) return toast(`You can add up to ${MAX_PHOTOS} photos.`);
  const guide = shots()[state.step];
  state.photos.push({ label: guide ? guide[0] : "Extra detail", dataUrl });
  state.step++;
  renderCapture();
}

function renderCapture() {
  const list = shots();
  const guide = list[state.step];
  $("shot-count").textContent = guide ? `Shot ${state.step + 1} of ${list.length}` : "All suggested shots done";
  $("shot-label").textContent = guide ? guide[0] : "Add any other detail";
  $("shot-tip").textContent = guide ? guide[1] : "Or tap Analyze below";
  $("skip").disabled = !guide;

  $("thumbs").replaceChildren(...state.photos.map((photo, i) => {
    const li = el("li");
    const img = el("img");
    img.src = photo.dataUrl;
    img.alt = photo.label;
    const remove = el("button", "", "×");
    remove.setAttribute("aria-label", `Remove photo: ${photo.label}`);
    remove.onclick = () => { state.photos.splice(i, 1); renderCapture(); };
    li.append(img, remove);
    return li;
  }));

  const n = state.photos.length;
  $("analyze").disabled = n === 0;
  $("analyze").textContent = n ? `Analyze ${n} photo${n > 1 ? "s" : ""}` : "Analyze";
}

// ---------- Analyze ----------
async function analyze() {
  const photos = state.photos;
  show("loading");
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: state.category,
        brand: $("brand").value,
        notes: $("notes").value,
        images: photos,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Analysis failed. Please try again.");

    const img = new Image();
    img.src = photos[0].dataUrl;
    await img.decode();
    saveScan({ id: Date.now(), date: new Date().toISOString(), thumb: toJpeg(img, img.width, img.height, 160, 0.7), result: data });
    renderResult(data);
    show("result");
  } catch (err) {
    show("capture"); // photos are kept so the user can retry
    toast(err instanceof TypeError ? "Could not reach the server. Check your connection." : err.message);
  }
}

function section(title, items, cls, renderItem) {
  if (!items?.length) return [];
  const ul = el("ul", `list ${cls}`);
  ul.append(...items.map(renderItem));
  return [el("h2", "", title), ul];
}

function safeLink(link) {
  if (!link || !/^https:\/\//.test(link.href || "")) return null;
  const a = el("a", "", link.text || link.href);
  a.href = link.href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

function renderResult(r) {
  const v = VERDICTS[r.verdict] || VERDICTS.inconclusive;
  const card = el("div", `verdict ${v.tone}`);
  const meterLabel = el("div", "meter-label");
  meterLabel.append(el("span", "", r.meterLabel || "Confidence in this verdict"), el("span", "", r.meterText || `${r.confidence}%`));
  const meter = el("div", "meter");
  const fill = el("i");
  fill.style.width = `${r.confidence}%`;
  meter.append(fill);
  card.append(
    el("div", "label", r.label || v.label),
    el("div", "item", [r.item?.brand, r.item?.name].filter(Boolean).join(" · ")),
    meterLabel, meter,
    el("p", "", r.summary),
  );

  $("result-body").replaceChildren(
    card,
    ...section("Red flags", r.red_flags, "flags", (t) => el("li", "", t)),
    ...section("What was checked", r.checks, "", (c) => {
      const li = el("li", `check ${c.result}`);
      li.append(el("span", "mark", MARKS[c.result] || "?"), el("span", "", c.name));
      if (c.detail) li.append(el("span", "detail", c.detail));
      const link = safeLink(c.link);
      if (link) li.append(link);
      return li;
    }),
    ...section(r.moreTitle || "Photos that would help", r.more_photos, "", (t) => el("li", "", t)),
    ...section("What to do next", r.next_steps, "", (t) => el("li", "", t)),
  );
}

// ---------- History (kept on this device only) ----------
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}

function saveScan(scan) {
  let history = [scan, ...loadHistory()].slice(0, 50);
  // Storage can be full or unavailable (private mode); drop oldest scans until it fits.
  while (history.length) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); return; } catch { history = history.slice(0, -1); }
  }
}

function renderHistory() {
  const history = loadHistory();
  $("history-empty").hidden = history.length > 0;
  $("history").replaceChildren(...history.map((scan) => {
    const v = VERDICTS[scan.result.verdict] || VERDICTS.inconclusive;
    const li = el("li");
    const btn = el("button");
    const img = el("img");
    img.src = scan.thumb;
    img.alt = "";
    const who = el("div", "who");
    who.append(
      el("b", "", [scan.result.item?.brand, scan.result.item?.name].filter(Boolean).join(" · ") || "Item"),
      el("span", "", new Date(scan.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })),
    );
    btn.append(img, who, el("span", `pill ${v.tone}`, scan.result.label || v.label));
    btn.onclick = () => { renderResult(scan.result); show("result"); };
    li.append(btn);
    return li;
  }));
}

// ---------- Free on-device check ----------
const TONES = { pass: "t-good", fail: "t-bad", unclear: "t-warn" };
const ANSWERS = [["pass", "Looks right"], ["fail", "Looks wrong"], ["unclear", "Can't tell"]];

function checklist() { return checklistFor(state.brand, state.category); }

function setStep(id, check, idleText) {
  $(id).className = `step ${check ? TONES[check.result] : ""}`;
  $(`${id}-status`).textContent = check ? check.detail : idleText;
}

function renderHub() {
  const { code, serial, answers } = state.evidence;
  const typed = $("brand").value.trim();
  const kind = CATEGORIES[state.category].name.toLowerCase();
  $("check-intro").textContent = state.brand
    ? `Checking a ${state.brand.name} item (${kind}) against ${state.brand.name}-specific rules.`
    : typed
      ? `There are no ${typed}-specific rules yet, so general ${kind} checks apply.`
      : `No brand given, so general ${kind} checks apply.`;

  setStep("step-code", code, "On the item's label, tag or box");
  const codeInfo = state.brand?.code;
  $("step-serial-title").textContent = codeInfo ? `Read the ${codeInfo.label.toLowerCase()}` : "Read the serial number or label code";
  setStep("step-serial", serial, codeInfo?.where || "On a tag, label or stamp inside the item");

  const total = checklist().length;
  const given = Object.values(answers);
  const wrong = given.filter((a) => a === "fail").length;
  $("step-inspect").className = `step ${given.length ? (wrong ? "t-bad" : "t-good") : ""}`;
  $("step-inspect-status").textContent = given.length
    ? `${given.length} of ${total} points answered${wrong ? `, ${wrong} look wrong` : ""}`
    : `${total} things to look at closely`;

  $("finish").disabled = !(code || serial || given.length);
}

function openScanner(mode) {
  state.scanMode = mode;
  const isCode = mode === "code";
  const codeInfo = state.brand?.code;
  $("scan-title").textContent = isCode ? "Point at a QR code or barcode" : `Photograph the ${(codeInfo?.label || "serial or code").toLowerCase()}`;
  $("scan-tip").textContent = isCode ? "It is read automatically" : (codeInfo?.where || "Fill the frame, keep it sharp and well lit");
  $("scan-shutter").hidden = isCode;
  $("serial-form").hidden = isCode;
  $("serial-label").textContent = codeInfo?.label || "Serial or code";
  $("serial-input").value = "";
  $("serial-use").disabled = true;
  $("scan-status").textContent = "";
  show("scan");
}

const loaded = {};
function loadScript(src) {
  return (loaded[src] ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => { delete loaded[src]; reject(new Error(`Could not load ${src}`)); };
    document.head.append(script);
  }));
}

let nativeDetector;
async function detectCode(source, width, height) {
  // The browser's built-in detector reads barcodes as well as QR codes, where it exists.
  if ("BarcodeDetector" in window) {
    try {
      const found = await (nativeDetector ??= new BarcodeDetector()).detect(source);
      if (found[0]?.rawValue) return found[0].rawValue;
    } catch { /* fall through to the QR decoder */ }
  }
  await loadScript("vendor/jsQR.js");
  const canvas = toCanvas(source, width, height, 1000);
  const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  return window.jsQR(pixels.data, canvas.width, canvas.height)?.data || null;
}

async function watchForCode() {
  const video = $("scan-video");
  while (state.screen === "scan" && state.scanMode === "code" && state.stream) {
    if (video.videoWidth) {
      try {
        const value = await detectCode(video, video.videoWidth, video.videoHeight);
        if (value && state.screen === "scan") return acceptCode(value, video, video.videoWidth, video.videoHeight);
      } catch (err) {
        $("scan-status").textContent = "The code reader could not start. Use Upload, or skip this step.";
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

function acceptCode(value, source, width, height) {
  state.thumb ??= toJpeg(source, width, height, 160, 0.7);
  state.evidence.code = { name: "QR code / barcode", ...checkScannedCode(value, state.brand) };
  navigator.vibrate?.(80);
  show("check");
}

let ocrWorker;
async function readText(canvas) {
  await loadScript("vendor/tesseract/tesseract.min.js");
  const at = (p) => new URL(p, location.href).href;
  ocrWorker ??= window.Tesseract.createWorker("eng", 1, {
    workerPath: at("vendor/tesseract/worker.min.js"),
    corePath: at("vendor/tesseract"),
    langPath: at("vendor/tesseract"),
  });
  try {
    const worker = await ocrWorker;
    return (await worker.recognize(canvas)).data.text;
  } catch (err) {
    ocrWorker = null;
    throw err;
  }
}

async function scanText(source, width, height) {
  const canvas = toCanvas(source, width, height, 1600);
  state.thumb ??= toJpeg(canvas, canvas.width, canvas.height, 160, 0.7);
  $("scan-status").textContent = "Reading the text… the first time takes a few seconds.";
  $("scan-shutter").disabled = true;
  try {
    const text = await readText(canvas);
    // Keep only code-like words (they contain a digit); drop brand names and slogans.
    const codes = (text.toUpperCase().match(/[A-Z0-9][A-Z0-9-]{2,}/g) || []).filter((t) => /\d/.test(t));
    if (codes.length) {
      $("serial-input").value = codes.join(" ");
      $("serial-use").disabled = false;
      $("scan-status").textContent = "Compare this with the item and fix any wrong characters before checking.";
    } else {
      $("scan-status").textContent = "No code could be read. Move closer with better light, or type it in below.";
    }
  } catch {
    $("scan-status").textContent = "Text reading is not available on this device. Type the code in below.";
  } finally {
    $("scan-shutter").disabled = !state.stream;
  }
}

function renderChecklist() {
  $("checklist").replaceChildren(...checklist().map((text, i) => {
    const li = el("li", "", text);
    const row = el("div", "answers");
    row.append(...ANSWERS.map(([value, label]) => {
      const btn = el("button", TONES[value], label);
      btn.type = "button";
      btn.setAttribute("aria-pressed", String(state.evidence.answers[i] === value));
      btn.onclick = () => {
        if (state.evidence.answers[i] === value) delete state.evidence.answers[i];
        else state.evidence.answers[i] = value;
        renderChecklist();
      };
      return btn;
    }));
    li.append(row);
    return li;
  }));
}

function buildResult() {
  const { code, serial, answers } = state.evidence;
  const list = checklist();
  const said = { pass: "You marked this as looking right.", fail: "You marked this as looking wrong.", unclear: "You could not tell." };
  const checks = [code, serial].filter(Boolean);
  list.forEach((text, i) => { if (answers[i]) checks.push({ name: text, result: answers[i], detail: said[answers[i]] }); });

  const fails = checks.filter((c) => c.result === "fail");
  const passes = checks.filter((c) => c.result === "pass");
  const codeFailed = [code, serial].some((c) => c?.result === "fail");
  const unchecked = [
    ...(code ? [] : ["Scan a QR code or barcode, if the item has one"]),
    ...(serial ? [] : ["Read the serial number or label code"]),
    ...list.filter((_, i) => !answers[i]),
  ];

  let verdict, label, summary, next;
  if (codeFailed || fails.length >= 2) {
    verdict = "likely_counterfeit"; label = "Red flags found";
    summary = codeFailed
      ? "A code on this item does not match what the brand uses. That is one of the most reliable signs of a counterfeit."
      : `${fails.length} details look wrong. Genuine items rarely miss more than one of these points.`;
    next = ["Do not buy it, or ask for a refund, unless the seller can explain every red flag.", "If you already paid, open a counterfeit claim with the marketplace or your payment provider."];
  } else if (fails.length === 1) {
    verdict = "inconclusive"; label = "One red flag";
    summary = "One detail looks wrong. That can be wear or a production quirk, but it deserves a second look before you trust the item.";
    next = ["Re-check the flagged detail against photos on the brand's official site.", "Complete the remaining steps for a firmer answer."];
  } else if (passes.length >= 4) {
    verdict = "likely_authentic"; label = "No red flags found";
    summary = `${passes.length} checks passed and nothing looks wrong. This rules out ordinary fakes; the best counterfeits can still pass these checks.`;
    next = ["Buying second-hand? Still ask for the receipt and pay through a platform with buyer protection.", "For a high-value item, a professional authentication service gives a written opinion."];
  } else {
    verdict = "inconclusive"; label = "Not enough checked";
    summary = "Nothing looks wrong so far, but too few checks were completed to say more.";
    next = ["Complete the remaining steps.", "Ask the seller for sharp photos of the codes and labels if you cannot inspect the item yourself."];
  }

  return {
    item: { brand: state.brand?.name || $("brand").value.trim() || "Unbranded", name: CATEGORIES[state.category].name, category: state.category },
    verdict, label, summary,
    confidence: checks.length ? Math.round((passes.length / checks.length) * 100) : 0,
    meterLabel: "Checks passed", meterText: `${passes.length} of ${checks.length}`,
    checks,
    red_flags: fails.map((c) => (c === code || c === serial ? c.detail : c.name)),
    more_photos: unchecked, moreTitle: "Not checked yet",
    next_steps: next,
  };
}

// ---------- Wiring ----------
function newScan() {
  state.photos = [];
  state.step = 0;
  state.thumb = null;
  state.evidence = { code: null, serial: null, answers: {} };
  $("brand").value = "";
  $("notes").value = "";
  renderCategories();
  show("setup");
}

$("start").onclick = newScan;
$("again").onclick = newScan;
$("back").onclick = () => show(BACK[state.screen] || "home");

$("to-check").onclick = () => {
  const brand = findBrand($("brand").value);
  if (brand !== state.brand) state.evidence = { code: null, serial: null, answers: {} }; // rules differ per brand
  state.brand = brand;
  show("check");
};
$("step-code").onclick = () => openScanner("code");
$("step-serial").onclick = () => openScanner("text");
$("step-inspect").onclick = () => { renderChecklist(); show("inspect"); };
$("inspect-done").onclick = () => show("check");
$("finish").onclick = () => {
  const result = buildResult();
  saveScan({ id: Date.now(), date: new Date().toISOString(), thumb: state.thumb || "icon.svg", result });
  renderResult(result);
  show("result");
};

$("scan-shutter").onclick = () => {
  const video = $("scan-video");
  if (video.videoWidth) scanText(video, video.videoWidth, video.videoHeight);
};
$("scan-file").onchange = async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    const bitmap = await createImageBitmap(file);
    if (state.scanMode === "text") return await scanText(bitmap, bitmap.width, bitmap.height);
    const value = await detectCode(bitmap, bitmap.width, bitmap.height);
    if (value) acceptCode(value, bitmap, bitmap.width, bitmap.height);
    else toast("No QR code or barcode found in that photo.");
  } catch {
    toast(`Could not read ${file.name}.`);
  }
};
$("serial-input").oninput = () => { $("serial-use").disabled = !$("serial-input").value.trim(); };
$("serial-form").onsubmit = (event) => {
  event.preventDefault();
  const text = $("serial-input").value.trim();
  if (!text) return;
  state.evidence.serial = { name: state.brand?.code?.label || "Serial / code", ...checkSerial(text, state.brand) };
  show("check");
};

$("brand-list").replaceChildren(...BRAND_NAMES.map((name) => { const o = el("option"); o.value = name; return o; }));
// The paid AI photo analysis is only offered when the server has a key for it.
fetch("api/config").then((r) => r.json()).then((c) => { $("ai-option").hidden = !c.ai; }).catch(() => {});

$("to-capture").onclick = () => { state.step = Math.min(state.step, shots().length); renderCapture(); show("capture"); };
$("skip").onclick = () => { state.step++; renderCapture(); };
$("analyze").onclick = analyze;

$("shutter").onclick = () => {
  const video = $("video");
  if (!video.videoWidth) return;
  addPhoto(toJpeg(video, video.videoWidth, video.videoHeight));
};

$("file").onchange = async (event) => {
  for (const file of event.target.files) {
    if (state.photos.length >= MAX_PHOTOS) { toast(`You can add up to ${MAX_PHOTOS} photos.`); break; }
    try {
      const bitmap = await createImageBitmap(file);
      addPhoto(toJpeg(bitmap, bitmap.width, bitmap.height));
      bitmap.close();
    } catch {
      toast(`Could not read ${file.name}.`);
    }
  }
  event.target.value = "";
};

window.addEventListener("popstate", () => {
  if (state.screen !== "home") show(BACK[state.screen] || "home");
});

// Release the camera when the app is backgrounded; reopen when it returns.
document.addEventListener("visibilitychange", () => {
  if (!CAMERAS[state.screen]) return;
  if (document.hidden) stopCamera(); else startCamera();
});

show("home");
