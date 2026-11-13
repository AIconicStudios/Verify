# Verify

Scan a bag, shoe, garment, watch or piece of jewelry with your phone camera and get an AI authenticity assessment.

The app walks you through the close-ups an authenticator would ask for (logo stamp, stitching, hardware, serial tag…), sends the photos to Claude, and returns a verdict — **likely authentic**, **likely counterfeit** or **inconclusive** — with a confidence score, the individual checks, red flags, and which extra photos would help. Past scans are kept on the device.

> The result is an assessment from photos, not a certificate. High-grade counterfeits can pass visual checks; confirm expensive purchases with the brand or a professional authenticator.

## Run

Requires Node 22+ and an Anthropic API key.

```bash
npm install
cp .env.example .env   # then put your key in ANTHROPIC_API_KEY
npm start
```

Open http://localhost:3000.

**On a phone:** browsers only allow camera access over HTTPS (or on `localhost`). Deploy the app to any Node host with HTTPS, or tunnel your local server (e.g. `npx localtunnel --port 3000`). Without a camera, the Upload button still works.

## Layout

- `server.js` — Express server; `POST /api/analyze` validates the photos and calls Claude with a structured-output schema.
- `public/` — the web app (no build step): `index.html`, `styles.css`, `app.js`.

Each scan is one Claude API call with up to 8 images. The endpoint is rate-limited to 20 scans per hour per IP; put real auth in front of it before exposing it publicly.
