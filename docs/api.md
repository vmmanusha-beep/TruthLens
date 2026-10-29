# TruthLens API

Base URL: `http://localhost:5000/api`

## `GET /health`

Returns the API status and MongoDB connection status. It returns HTTP 200 only when MongoDB is connected; otherwise it returns HTTP 503 with a degraded status.

## `POST /analysis`

Accepts `multipart/form-data` with one file field named `image`. Supported image contents are JPEG, PNG, and WebP; the maximum file size is 20 MiB.

The server validates the file signature and decodes the image before creating a report. Client-provided MIME type and filename extension are checked as indicators only; detected content determines the stored format. The original image is processed in memory and is not saved.

Successful requests return HTTP 201 and a `report` containing:

- A sanitized filename, detected MIME type and format, file size, and image dimensions
- SHA-256 calculated from the received bytes
- Metadata findings for EXIF presence and selected allowlisted technical indicators (orientation, color space, flash, resolution); GPS, capture timestamps, device identifiers, and arbitrary EXIF strings are not stored
- File-signature, decoder, declared-MIME, and filename-extension checks
- Analysis type `basic_forensic`, status `completed`, and analysis timestamp
- ELA method, quality, status, and limitation in `report.elaAnalysis` (no visualization bytes are stored in MongoDB)

The response also includes a sibling `ela` object. JPEG uploads are decoded, re-encoded at JPEG quality 90, decoded again, and compared using per-channel absolute RGB differences. The raw differences are kept separate from display enhancement. For display, the server finds each pixel's maximum RGB difference, builds a histogram from nonzero pixels, uses the 99th percentile as one global scale, maps that value linearly to 255, and clips larger values. The response includes the normalization description and measured threshold. The contrast-enhanced PNG has a maximum edge of 1200 pixels, is returned as `ela.visualizationDataUrl`, and is not persisted. JPEGs over 25 megapixels receive `ela.status: "unavailable"` to bound processing cost.

PNG and WebP uploads still receive the basic report, but `ela.status` is `unavailable` and the visualization is `null`. They are not converted to JPEG because that would not be equivalent to JPEG-specific ELA.

`completed` means the listed basic checks ran. The contrast-enhanced ELA image is experimental. Contrast enhancement changes visualization only, not the evidential strength of ELA. Bright or uneven areas can result from compression history, resaving, image content, or other causes; they are not proof of manipulation or authenticity. This endpoint does not produce an authenticity verdict and is not AI-powered manipulation detection. Missing EXIF metadata alone does not indicate manipulation.

Errors use JSON with an `error` message and a stable `code` where applicable. Oversized files return HTTP 413, unsupported content returns HTTP 415, and malformed image data returns HTTP 400.