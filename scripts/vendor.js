// Copies the on-device scanning libraries (QR decoding and text recognition)
// from node_modules into public/vendor so the app can be served as static files.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = (...p) => path.join(root, "node_modules", ...p);
const out = path.join(root, "public", "vendor");
mkdirSync(path.join(out, "tesseract"), { recursive: true });

cpSync(from("jsqr", "dist", "jsQR.js"), path.join(out, "jsQR.js"));
for (const file of ["tesseract.min.js", "worker.min.js"]) {
  cpSync(from("tesseract.js", "dist", file), path.join(out, "tesseract", file));
}
// Only the LSTM builds are used; the browser picks the fastest one it supports.
for (const file of readdirSync(from("tesseract.js-core"))) {
  if (/^tesseract-core.*lstm\.wasm\.js$/.test(file)) {
    cpSync(from("tesseract.js-core", file), path.join(out, "tesseract", file));
  }
}
cpSync(from("@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"), path.join(out, "tesseract", "eng.traineddata.gz"));
console.log("Scanning libraries copied to public/vendor");
