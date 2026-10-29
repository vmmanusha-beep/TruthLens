# TruthLens

TruthLens is a final-year project exploring digital image authenticity. The frontend can preview and inspect images locally, or explicitly send a selected image to the backend for basic file-forensics checks. This is not AI-powered manipulation detection and does not produce an authenticity verdict.

## Project structure

- `src/` contains the existing React page, entry point, and styles.
- The root `package.json` contains the Vite frontend scripts and dependencies.
- `server/src/` contains the Express app, database connection, health and analysis routes/controllers, upload middleware, image-inspection service, and Mongoose model.
- `server/test/` contains API tests that use an in-memory report model and do not write to MongoDB.
- `docs/api.md` documents the current API.
- `server/.env.example` lists backend settings without real credentials.

## Requirements

Install the current Node.js LTS release, which includes npm. MongoDB is separate from Node.js: either install and run MongoDB Community Server locally, or create a MongoDB Atlas cluster. A MongoDB URI is not included in this project.

## Run in VS Code

Open the `TruthLens` folder in VS Code, then choose **Terminal → New Terminal**. Check Node.js with `node -v` and `npm -v`.

Start the frontend in the first terminal:

```powershell
npm install
npm run dev
```

Open the Vite URL printed in that terminal, commonly `http://localhost:5173`.

Open a second VS Code terminal for the backend:

```powershell
cd server
npm install
Copy-Item .env.example .env
```

Open `server/.env` and set `MONGODB_URI` to your own connection string. For a local MongoDB Community Server, it commonly looks like `mongodb://127.0.0.1:27017/truthlens`. For Atlas, paste the connection string from your cluster and replace its username, password, and database name. Keep the real URI only in `server/.env`; do not commit it or share it. The root `.gitignore` excludes that file.

Then start the API:

```powershell
npm run dev
```

The health endpoint is `http://localhost:5000/api/health`. It reports a connected database only when Mongoose is connected. Stop either development server with `Ctrl+C` in its terminal.

## Test the image-analysis endpoint

With the backend running in its terminal, run the tests from a third terminal:

```powershell
cd server
npm test
```

The tests generate small images and use a fake report model, so they do not depend on Atlas. To try the endpoint with a local image, use PowerShell:

```powershell
curl.exe -F "image=@C:\path\to\image.jpg" http://localhost:5000/api/analysis
```

The React workspace also has a file picker: select an image, wait for its local preview, then select **Analyze Media** to send it for basic checks.

## Analysis limitations

- `POST /api/analysis` accepts one JPEG, PNG, or WebP image up to 20 MiB in the `image` multipart field.
- The backend validates file signatures, decodes image properties, calculates SHA-256 from the received bytes, and saves a basic report in MongoDB. The original image is held in memory during the request and is not stored.
- GPS, capture timestamps, device make/model, and arbitrary EXIF strings are not saved. The report records EXIF presence and selected allowlisted technical indicators such as orientation, color space, flash, and resolution when available.
- JPEG reports also include an experimental contrast-enhanced ELA visualization: the decoded image is recompressed at quality 90 and per-channel absolute RGB differences are computed separately from display enhancement. For display, the 99th percentile of nonzero per-pixel maximum channel differences maps linearly to 255; larger values are clipped. The PNG has a maximum edge of 1200 pixels, and images over 25 megapixels skip ELA to limit processing cost. Contrast enhancement changes visualization only, not ELA's evidential strength.
- PNG and WebP still receive basic file checks, but JPEG-specific ELA is marked unavailable; these images are not converted to JPEG for ELA.
- Filename and MIME mismatches are observable indicators, not proof of manipulation. Missing metadata is not proof of manipulation; passing checks is not proof of authenticity.
- Bright or uneven ELA regions can have many causes and are not proof of manipulation or authenticity. Reports use `analysisType: basic_forensic` and `status: completed` to mean the implemented checks ran. No AI detection, authenticity score, or verdict is produced.
- The ELA PNG is sent in the API response for display and is not saved in MongoDB; the report stores only its method, quality, status, and limitation.
- For endpoint details and error codes, see [docs/api.md](docs/api.md).