# Verify

Scan a bag, shoe, garment, watch or piece of jewelry with your phone and check it for signs of a counterfeit. Free, with no account, no API key and no scan limit: every check runs on the phone itself.

## What it checks

1. **QR code or barcode** — point the camera at the item's label, tag or box. The app reads the code and tells you whether it links to the brand's official website, to another brand, or to a lookalike site (a common trick on fakes).
2. **Serial number / label code** — photograph the serial tag and the app reads the text, then tests it against the brand's known format: Louis Vuitton date codes, Gucci and Chanel serials, Nike style codes, Adidas article numbers, Certilogo codes. You can also type the code in.
3. **Guided inspection** — a short brand-specific list of details to look at (stamp fonts, stitching, hardware, pattern alignment…), each answered *looks right*, *looks wrong* or *can't tell*.

The result is **No red flags found**, **One red flag**, **Red flags found** or **Not enough checked**, with every check listed. Past scans are kept on the device.

Brand-specific rules exist for Gucci, Louis Vuitton, Chanel, Prada, Nike / Jordan, Adidas / Yeezy, Rolex, Moncler and Stone Island; any other brand gets general checks for its category. Rules live in `public/brands.js` and are easy to extend.

> This is a screening, not a certificate. It catches ordinary fakes; the best counterfeits copy real codes and can pass every check. Confirm expensive purchases with the brand or a professional authenticator.

## Run

Requires Node 22+.

```bash
npm install
npm start
```

Open http://localhost:3000.

**On a phone:** browsers only allow camera access over HTTPS (or on `localhost`), so host the app somewhere with HTTPS. After `npm install`, the `public/` folder is a complete static site, so any free static host works; no server is needed for the free checks. Without a camera, the Upload button still works.

## Optional: AI photo analysis

If the server is started with an `ANTHROPIC_API_KEY` (see `.env.example`), the app also offers a paid mode that sends photos to Claude for a visual assessment. Without a key that option is hidden and nothing leaves the phone.

## Layout

- `public/app.js` — screens, camera, QR/barcode and text reading, scoring, history.
- `public/brands.js` — brand domains, code formats and inspection checklists.
- `scripts/vendor.js` — copies the scanning libraries (jsQR, Tesseract.js) into `public/vendor`.
- `server.js` — static file server plus the optional `/api/analyze` endpoint.
