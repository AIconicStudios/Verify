// Brand knowledge used by the free, on-device check: official web domains (for QR
// codes), serial / code formats, and the details worth inspecting by eye.
//
// A code check returns { result: "pass" | "fail" | "unclear", detail, link? }.
// A matching format never proves an item is genuine (counterfeiters copy real
// codes); a format the brand has never used is strong evidence of a fake.

const clean = (text) => text.toUpperCase().replace(/[^A-Z0-9-]/g, "");
const search = (brand, code) => ({
  href: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${brand} ${code}`)}`,
  text: `Search images for ${code}`,
});

function louisVuittonDateCode(text) {
  const code = clean(text).replace(/-/g, "");
  if (/^\d{3,4}[A-Z]{2}$/.test(code)) {
    return { result: "pass", detail: `${code} fits the 1980s layout: year and month digits followed by two factory letters.` };
  }
  if (/^\d{3,4}$/.test(code)) {
    return { result: "unclear", detail: `${code} could be an early-1980s date code (digits only). That layout is too simple to tell much.` };
  }
  const m = /^([A-Z]{2})(\d)(\d)(\d)(\d)$/.exec(code);
  if (!m) {
    return { result: "fail", detail: `"${code}" does not fit any Louis Vuitton date code layout (two factory letters and four digits, e.g. SD1028). Re-read the stamp; if it really says this, treat it as a red flag.` };
  }
  const first = Number(m[2] + m[4]); // 1st and 3rd digits: month (1990-2006) or week (2007-2021)
  const year = Number(m[3] + m[5]);  // 2nd and 4th digits: year
  const asMonth = first >= 1 && first <= 12 && (year >= 90 || year <= 6);
  const asWeek = first >= 1 && first <= 53 && year >= 7 && year <= 21;
  if (asWeek) {
    return { result: "pass", detail: `${code} reads as factory ${m[1]}, week ${first} of 20${String(year).padStart(2, "0")}. Check the bag's style existed that year and that the "made in" stamp matches the factory country.` };
  }
  if (asMonth) {
    const fullYear = year >= 90 ? 1900 + year : 2000 + year;
    return { result: "pass", detail: `${code} reads as factory ${m[1]}, month ${first} of ${fullYear}. Check the bag's style existed that year and that the "made in" stamp matches the factory country.` };
  }
  return { result: "fail", detail: `${code} has the right shape but the digits do not form a real date (month/week ${first}, year ${String(year).padStart(2, "0")}). Louis Vuitton stopped using date codes in early 2021.` };
}

function gucciSerial(text) {
  if (/[A-Za-z]/.test(text)) {
    return { result: "fail", detail: "Gucci serial numbers contain digits only. Letters on the serial tag are a red flag (re-read it to rule out a scanning mistake)." };
  }
  const groups = text.match(/\d+/g) || [];
  const digits = groups.join("");
  if (groups.length === 2 && digits.length >= 10 && digits.length <= 13) {
    return { result: "pass", detail: `Two rows of digits (style ${groups[0]}, supplier ${groups[1]}), which is the layout Gucci uses.`, link: search("Gucci", groups[0]) };
  }
  if (digits.length >= 10 && digits.length <= 13) {
    return { result: "pass", detail: `${digits.length} digits, a normal length for a Gucci serial. On the tag they should sit in two rows.` };
  }
  return { result: "unclear", detail: `Gucci serials are usually 10 to 13 digits in two rows; this has ${digits.length}. Older and small items vary.` };
}

function chanelSerial(text) {
  const code = clean(text).replace(/-/g, "");
  if (/^\d{6}$/.test(code)) return { result: "pass", detail: "6 digits: the format Chanel used around 1984 to 1986." };
  if (/^\d{7}$/.test(code)) return { result: "pass", detail: "7 digits: the format Chanel used from about 1986 to 2004. The authenticity card should carry the same number." };
  if (/^\d{8}$/.test(code)) {
    const series = Number(code.slice(0, 2));
    return series >= 10 && series <= 31
      ? { result: "pass", detail: `8 digits starting ${series}: fits Chanel's 2005 to 2021 series. The authenticity card should carry the same number.` }
      : { result: "fail", detail: `8-digit Chanel serials start with 10 to 31; this one starts with ${code.slice(0, 2)}.` };
  }
  if (/^[A-Z0-9]{8}$/.test(code)) return { result: "pass", detail: "8 letters and digits: fits the metal plate Chanel has used since 2021 (these bags have no sticker or card)." };
  return { result: "fail", detail: `"${code}" does not fit any Chanel serial format (6, 7 or 8 digits on a sticker, or 8 characters on a metal plate).` };
}

function nikeStyleCode(text) {
  const m = /[A-Z0-9]{6}-\d{3}/.exec(text.toUpperCase().replace(/\s/g, ""));
  if (!m) return { result: "fail", detail: "Nike style codes look like CW2288-111: six characters, a dash, three digits. Nothing on this label fits." };
  return { result: "pass", detail: `${m[0]} is a correctly formed Nike style code. Now search it: the results must show this exact shoe and colour, and the box label must carry the same code.`, link: search("Nike", m[0]) };
}

function adidasArticle(text) {
  const m = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6}\b/.exec(text.toUpperCase());
  if (!m) return { result: "unclear", detail: "Adidas article numbers are six letters and digits, like GZ5541. None found here." };
  return { result: "pass", detail: `${m[0]} is a correctly formed Adidas article number. Search it: the results must show this exact shoe and colour.`, link: search("Adidas", m[0]) };
}

function certilogo(text) {
  const digits = text.replace(/\D/g, "");
  return digits.length === 12
    ? { result: "pass", detail: `${digits} is a correctly formed 12-digit Certilogo code. Enter it on certilogo.com for the brand's own answer.`, link: { href: "https://www.certilogo.com", text: "Verify on certilogo.com" } }
    : { result: "fail", detail: `Certilogo codes are exactly 12 digits; this has ${digits.length}.` };
}

function monclerCode(text) {
  return { result: "unclear", detail: `Moncler checks its own codes. Enter ${clean(text)} on code.moncler.com for a definite answer.`, link: { href: "https://code.moncler.com", text: "Verify on code.moncler.com" } };
}

export const BRANDS = [
  {
    name: "Gucci", aliases: ["gucci"], domains: ["gucci.com"],
    code: { label: "Serial number", where: "Inside the bag, on the back of the small leather tab", check: gucciSerial },
    checklist: {
      bag: [
        "The front of the inside leather tab reads ® on top, GUCCI in the middle and 'made in italy' in lowercase below, all crisply stamped",
        "The back of that tab has the serial in two rows of digits, with no letters",
        "The GG pattern is symmetrical left to right and lines up across the seams",
        "Stitching is even, straight and the same length throughout",
        "Hardware feels heavy and its GUCCI engraving is sharp, not shallow or blurry",
      ],
    },
  },
  {
    name: "Louis Vuitton", aliases: ["louis vuitton", "lv", "vuitton"], domains: ["louisvuitton.com"],
    code: { label: "Date code", where: "Stamped on a leather tab or directly on the lining, inside a pocket or along a seam. Items made after early 2021 have a chip instead and no code", check: louisVuittonDateCode },
    checklist: {
      bag: [
        "The monogram is symmetrical left to right. On one-piece styles such as the Speedy, upside-down logos on the back are normal",
        "The heat stamp has very round O's, an L with a short foot, and the two T's almost touching",
        "Stitching is mustard yellow, slightly angled, and the same count on matching parts (e.g. both handle tabs)",
        "Natural leather trim is pale beige when new and darkens to honey with use; edge paint is deep burgundy, not bright red",
        "Hardware engraving is crisp and centred",
      ],
    },
  },
  {
    name: "Chanel", aliases: ["chanel"], domains: ["chanel.com"],
    code: { label: "Serial number", where: "On a sticker inside the bag (before 2021) or a small metal plate (2021 on)", check: chanelSerial },
    checklist: {
      bag: [
        "Quilting lines continue unbroken across the back pocket and the flap",
        "On the CC logo, the right C overlaps the left at the top and the left overlaps the right at the bottom",
        "Stitching is dense: around ten or more stitches along each side of a quilted diamond",
        "The interior brand stamp is the same colour as the hardware (gold with gold, silver with silver)",
        "The serial sticker matches the number on the authenticity card (bags before 2021)",
      ],
    },
  },
  {
    name: "Prada", aliases: ["prada"], domains: ["prada.com"],
    checklist: {
      bag: [
        "On the triangle logo, the R in PRADA has a small notch where its leg meets the loop, and the leg kicks outward",
        "The triangle plaque is firmly attached and its colour matches the bag",
        "The lining is printed or woven with PRADA in repeating lines, every other line upside down",
        "Zips are stamped on the back with a maker such as Lampo, riri, Opti, Ipi or YKK",
        "Stitching is even and slightly angled",
      ],
    },
  },
  {
    name: "Nike", aliases: ["nike", "jordan", "air jordan"], domains: ["nike.com"],
    code: { label: "Style code", where: "On the size tag inside the shoe and on the box label, e.g. CW2288-111", check: nikeStyleCode },
    checklist: {
      shoes: [
        "The style code on the inside size tag is identical to the one on the box label",
        "Size, country and barcode number on the tag also match the box label",
        "The swoosh has the same shape, size and position on both shoes",
        "Stitching is even with no loose threads; no glue stains around the sole",
        "Print on the size tag is sharp and evenly spaced, not thick or fuzzy",
      ],
    },
  },
  {
    name: "Adidas", aliases: ["adidas", "yeezy"], domains: ["adidas.com"],
    code: { label: "Article number", where: "On the size tag inside the shoe and on the box label, e.g. GZ5541", check: adidasArticle },
    checklist: {
      shoes: [
        "The long serial on the bottom line of the size tag is different on the left and right shoe (identical serials are a red flag)",
        "The article number on the size tag matches the box label",
        "Logos are sharp and identically placed on both shoes",
        "Stitching is even; no glue stains around the sole",
      ],
    },
  },
  {
    name: "Rolex", aliases: ["rolex"], domains: ["rolex.com"],
    checklist: {
      watch: [
        "The seconds hand glides smoothly instead of ticking once per second",
        "The date bubble magnifies strongly, so the date nearly fills the window",
        "The case back is plain solid metal (clear or heavily engraved backs are rare on Rolex)",
        "The watch feels heavy for its size, and the crown logo on the winding crown is crisp",
        "Dial printing is perfectly sharp under zoom, with evenly spaced letters",
      ],
    },
  },
  {
    name: "Moncler", aliases: ["moncler"], domains: ["moncler.com"],
    code: { label: "Code on the inner label", where: "On the certilogo / QR label sewn inside the garment", check: monclerCode },
    checklist: {
      clothing: [
        "The inside label has a QR code and a code you can verify on code.moncler.com",
        "The logo patch is neatly stitched with clean, even lettering",
        "The cartoon wash label inside is sharply printed",
        "Zips and snaps are engraved with clean branding",
      ],
    },
  },
  {
    name: "Stone Island", aliases: ["stone island", "stoneisland"], domains: ["stoneisland.com"],
    code: { label: "Certilogo code", where: "12 digits on the Certilogo label sewn inside the garment", check: certilogo },
    checklist: {
      clothing: [
        "The inside Certilogo label has a 12-digit code that verifies on certilogo.com",
        "The compass badge embroidery is dense and clean, with a neat border",
        "The badge buttons are engraved with the brand name",
        "The wash label includes an art number and is sharply printed",
      ],
    },
  },
];

// Official sites of other brands, so a scanned QR code can be judged for any of them.
const MORE_DOMAINS = {
  "Hermès": ["hermes.com"], Dior: ["dior.com"], Burberry: ["burberry.com"], Balenciaga: ["balenciaga.com"],
  "Saint Laurent": ["ysl.com"], Fendi: ["fendi.com"], Versace: ["versace.com"], "Bottega Veneta": ["bottegaveneta.com"],
  Celine: ["celine.com"], Loewe: ["loewe.com"], Valentino: ["valentino.com"], Givenchy: ["givenchy.com"],
  "Dolce & Gabbana": ["dolcegabbana.com"], Cartier: ["cartier.com"], Omega: ["omegawatches.com"], Tiffany: ["tiffany.com"],
  "Canada Goose": ["canadagoose.com"], "The North Face": ["thenorthface.com"], "New Balance": ["newbalance.com"],
  "Ralph Lauren": ["ralphlauren.com"], Certilogo: ["certilogo.com"],
};

export const BRAND_NAMES = [...BRANDS.map((b) => b.name), ...Object.keys(MORE_DOMAINS).filter((n) => n !== "Certilogo")].sort();

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9 ]/g, "").trim();

export function findBrand(typed) {
  const name = norm(typed || "");
  if (!name) return null;
  return BRANDS.find((b) => b.aliases.includes(name)) || null;
}

// Details worth checking on any item of a category, whatever the brand.
export const GENERIC_CHECKLIST = {
  bag: [
    "The logo matches the brand's official one exactly: same font, spacing and spelling",
    "Stitching is straight, even and tight, with no loose threads or glue",
    "Hardware is heavy, cleanly engraved and not peeling or discoloured",
    "Patterns are symmetrical and line up across seams",
    "The lining is neatly fitted and labels inside are crisply stamped or stitched",
    "The price and the seller are believable for this brand",
  ],
  shoes: [
    "Codes on the inside size tag match the box label exactly",
    "Logos are the same shape and position on both shoes",
    "Stitching is even with no glue stains around the sole",
    "Print on the size tag and insole is sharp, not fuzzy",
    "The price and the seller are believable for this brand",
  ],
  clothing: [
    "The neck label is neatly stitched on all sides with sharp, correctly spelled lettering",
    "The care label is sharply printed and lists material and country",
    "Embroidery or print is dense and clean, with no joined-up letters",
    "Seams are straight and finished inside; patterns line up at seams",
    "Buttons and zips carry clean branding",
    "The price and the seller are believable for this brand",
  ],
  watch: [
    "Dial printing is perfectly sharp under zoom, with evenly spaced letters",
    "Hands, markers and date sit perfectly centred and aligned",
    "Engravings on the case back and clasp are deep and clean",
    "The watch feels heavy and the crown winds smoothly",
    "Serial and reference numbers match the papers or card",
    "The price and the seller are believable for this brand",
  ],
  jewelry: [
    "Metal hallmarks (e.g. 750, 925) and the maker's mark are present and crisply struck",
    "The brand signature is evenly engraved, not shallow or wobbly",
    "Stones are set evenly and securely",
    "Clasps close firmly and are finished as well as the front",
    "The price and the seller are believable for this brand",
  ],
  accessory: [
    "The logo matches the brand's official one exactly: same font, spacing and spelling",
    "Stitching and edges are even and cleanly finished",
    "Hardware is heavy and cleanly engraved",
    "Labels, stamps and codes are sharp and correctly spelled",
    "The price and the seller are believable for this brand",
  ],
  other: [
    "The logo matches the brand's official one exactly: same font, spacing and spelling",
    "Materials and finish feel as good as the price suggests",
    "Labels, stamps and codes are sharp and correctly spelled",
    "Packaging and paperwork are well printed and consistent with the item",
    "The price and the seller are believable for this brand",
  ],
};

export function checklistFor(brand, category) {
  return brand?.checklist?.[category] || GENERIC_CHECKLIST[category] || GENERIC_CHECKLIST.other;
}

export function checkSerial(text, brand) {
  if (brand?.code) return brand.code.check(text);
  return { result: "unclear", detail: `Recorded "${text.trim()}". There is no known format to test for this brand, so compare it with the box, card or receipt: every copy must be identical.` };
}

const ALL_DOMAINS = [
  ...BRANDS.map((b) => ({ name: b.name, domains: b.domains, key: norm(b.name).replace(/ /g, "") })),
  ...Object.entries(MORE_DOMAINS).map(([name, domains]) => ({ name, domains, key: norm(name).replace(/ /g, "") })),
];

// Judge what a scanned QR code or barcode contains.
export function checkScannedCode(raw, brand) {
  const value = raw.trim();
  let url = null;
  try { if (/^https?:\/\//i.test(value)) url = new URL(value); } catch { /* not a URL */ }

  if (!url) {
    if (/^\d{8,14}$/.test(value)) {
      return { result: "unclear", detail: `Barcode ${value}. The same number must be printed on the box label and the item's tag; a mismatch is a red flag.`, link: { href: `https://www.google.com/search?q=${value}`, text: "Search this barcode" } };
    }
    return { result: "unclear", detail: `The code contains "${value.slice(0, 80)}", which is not a web link, so it cannot be tied to the brand.` };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const official = ALL_DOMAINS.find((b) => b.domains.some((d) => host === d || host.endsWith(`.${d}`)));
  if (official) {
    const mismatch = brand && official.name !== brand.name && official.name !== "Certilogo";
    if (mismatch) return { result: "fail", detail: `The code links to ${official.name}'s site (${host}), not ${brand.name}'s.` };
    return { result: "pass", detail: `The code links to the official ${official.name} site (${host}). Open it and confirm the page shows this exact product. A copied code can still link to a real site.`, link: { href: url.href, text: `Open ${host}` } };
  }
  const squashed = host.replace(/[^a-z0-9]/g, "");
  const imitated = ALL_DOMAINS.find((b) => squashed.includes(b.key));
  if (imitated) {
    return { result: "fail", detail: `The code links to ${host}, which uses the ${imitated.name} name but is not the brand's official site (${imitated.domains[0]}). Do not enter any details there.` };
  }
  if (brand) return { result: "unclear", detail: `The code links to ${host}, which is not ${brand.name}'s own site (${brand.domains[0]}). Brands sometimes use partner services, but be careful what you enter there.` };
  return { result: "unclear", detail: `The code links to ${host}. Check that this is the brand's real website before trusting it.` };
}
