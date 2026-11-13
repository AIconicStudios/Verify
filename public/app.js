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

const state = { category: "bag", photos: [], step: 0, stream: null, screen: "home" };

// ---------- Navigation ----------
const BACK = { setup: "home", capture: "setup", result: "home" };

function show(screen) {
  for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== screen;
  state.screen = screen;
  $("back").hidden = !BACK[screen];
  if (screen === "capture") startCamera(); else stopCamera();
  if (screen === "home") renderHistory();
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
  $("cam-error").hidden = true;
  $("shutter").disabled = false;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false,
    });
    if (state.screen !== "capture") return stopCamera(); // user left while the permission prompt was open
    $("video").srcObject = state.stream;
    await $("video").play();
  } catch (err) {
    $("shutter").disabled = true;
    $("cam-error").hidden = false;
    $("cam-error").textContent = err.name === "NotAllowedError"
      ? "Camera access was blocked. Allow it in your browser settings, or use Upload to pick photos."
      : "No camera available here. Use Upload to pick photos instead.";
  }
}

function stopCamera() {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
  $("video").srcObject = null;
}

function toJpeg(source, width, height, maxEdge = MAX_EDGE, quality = 0.85) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
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

function renderResult(r) {
  const v = VERDICTS[r.verdict] || VERDICTS.inconclusive;
  const card = el("div", `verdict ${v.tone}`);
  const meterLabel = el("div", "meter-label");
  meterLabel.append(el("span", "", "Confidence in this verdict"), el("span", "", `${r.confidence}%`));
  const meter = el("div", "meter");
  const fill = el("i");
  fill.style.width = `${r.confidence}%`;
  meter.append(fill);
  card.append(
    el("div", "label", v.label),
    el("div", "item", [r.item?.brand, r.item?.name].filter(Boolean).join(" · ")),
    meterLabel, meter,
    el("p", "", r.summary),
  );

  $("result-body").replaceChildren(
    card,
    ...section("Red flags", r.red_flags, "flags", (t) => el("li", "", t)),
    ...section("What was checked", r.checks, "", (c) => {
      const li = el("li", `check ${c.result}`);
      li.append(el("span", "mark", MARKS[c.result] || "?"), el("span", "", c.name), el("span", "detail", c.detail));
      return li;
    }),
    ...section("Photos that would help", r.more_photos, "", (t) => el("li", "", t)),
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
    btn.append(img, who, el("span", `pill ${v.tone}`, v.label));
    btn.onclick = () => { renderResult(scan.result); show("result"); };
    li.append(btn);
    return li;
  }));
}

// ---------- Wiring ----------
function newScan() {
  state.photos = [];
  state.step = 0;
  $("brand").value = "";
  $("notes").value = "";
  renderCategories();
  show("setup");
}

$("start").onclick = newScan;
$("again").onclick = newScan;
$("back").onclick = () => show(BACK[state.screen] || "home");
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

// Release the camera when the app is backgrounded; reopen when it returns.
document.addEventListener("visibilitychange", () => {
  if (state.screen !== "capture") return;
  if (document.hidden) stopCamera(); else startCamera();
});

show("home");
