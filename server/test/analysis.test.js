import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { normalizeElaDifferencesForDisplay } from '../src/services/image-analysis.service.js';

let pngBuffer;
let jpegBuffer;
let webpBuffer;
let reports;
let app;

before(async () => {
  pngBuffer = await sharp({
    create: {
      width: 2,
      height: 3,
      channels: 3,
      background: { r: 32, g: 96, b: 160 },
    },
  }).png().toBuffer();
  jpegBuffer = await sharp(pngBuffer).jpeg().toBuffer();
  webpBuffer = await sharp(pngBuffer).webp().toBuffer();

  reports = [];
  app = createApp({
    AnalysisReportModel: {
      async create(report) {
        const savedReport = { ...report, _id: `test-${reports.length + 1}` };
        reports.push(savedReport);
        return savedReport;
      },
    },
  });
});

after(() => {
  reports.length = 0;
});

test('stores a basic report from validated image bytes and server hash', async () => {
  const response = await request(app)
    .post('/api/analysis')
    .attach('image', pngBuffer, { filename: 'sample.png', contentType: 'image/png' });

  assert.equal(response.status, 201);
  assert.equal(response.body.report.filename, 'sample.png');
  assert.equal(response.body.report.detectedFormat, 'PNG');
  assert.deepEqual(response.body.report.dimensions, { width: 2, height: 3 });
  assert.equal(response.body.report.fileSize, pngBuffer.length);
  assert.equal(response.body.report.sha256, createHash('sha256').update(pngBuffer).digest('hex'));
  assert.equal(response.body.report.analysisType, 'basic_forensic');
  assert.equal(response.body.report.status, 'completed');
  assert.ok(response.body.report.analysisTimestamp);
  assert.equal(response.body.ela.status, 'unavailable');
  assert.equal(response.body.report.elaAnalysis.status, 'unavailable');
  assert.match(response.body.message, /not AI-powered manipulation detection/i);
  assert.equal(reports.length, 1);
});

test('returns a PNG ELA visualization for JPEG without persisting it', async () => {
  const width = 64;
  const height = 64;
  const texture = Buffer.alloc(width * height * 3);
  for (let index = 0; index < texture.length; index += 1) {
    texture[index] = (index * 73 + Math.floor(index / 7) * 29) % 256;
  }
  const texturedJpeg = await sharp(texture, {
    raw: { width, height, channels: 3 },
  }).jpeg({ quality: 100 }).toBuffer();
  const response = await request(app)
    .post('/api/analysis')
    .attach('image', texturedJpeg, { filename: 'sample.jpg', contentType: 'image/jpeg' });

  assert.equal(response.status, 201);
  assert.equal(response.body.ela.status, 'completed');
  assert.equal(response.body.ela.method, 'jpeg_recompression_ela');
  assert.equal(response.body.ela.jpegQuality, 90);
  assert.equal(response.body.ela.normalizationPercentileValue > 0, true);
  assert.match(response.body.ela.normalization, /99th percentile of nonzero/);
  assert.match(response.body.ela.visualizationDataUrl, /^data:image\/png;base64,/);
  const visualization = Buffer.from(response.body.ela.visualizationDataUrl.split(',')[1], 'base64');
  const visualizationMetadata = await sharp(visualization).metadata();
  assert.equal(visualizationMetadata.format, 'png');
  assert.equal(visualizationMetadata.width, width);
  assert.equal(visualizationMetadata.height, height);
  const visualizationPixels = await sharp(visualization).removeAlpha().raw().toBuffer();
  assert.ok(visualizationPixels.some((pixel) => pixel > 0), 'ELA visualization should contain measured pixel differences');
  assert.equal(response.body.report.elaAnalysis.status, 'completed');
  assert.equal(Object.hasOwn(response.body.report, 'elaVisualization'), false);
  assert.equal(Object.hasOwn(reports.at(-1), 'ela'), false);
});

test('detects JPEG and WebP from their actual bytes', async () => {
  for (const [buffer, filename, contentType, detectedFormat] of [
    [jpegBuffer, 'sample.jpg', 'image/jpeg', 'JPEG'],
    [webpBuffer, 'sample.webp', 'image/webp', 'WebP'],
  ]) {
    const response = await request(app)
      .post('/api/analysis')
      .attach('image', buffer, { filename, contentType });

    assert.equal(response.status, 201);
    assert.equal(response.body.report.detectedFormat, detectedFormat);
    if (detectedFormat === 'WebP') {
      assert.equal(response.body.ela.status, 'unavailable');
      assert.equal(response.body.ela.visualizationDataUrl, null);
    }
  }
});

test('does not convert PNG to JPEG for ELA', async () => {
  const response = await request(app)
    .post('/api/analysis')
    .attach('image', pngBuffer, { filename: 'sample.png', contentType: 'image/png' });

  assert.equal(response.status, 201);
  assert.equal(response.body.ela.status, 'unavailable');
  assert.equal(response.body.ela.visualizationDataUrl, null);
  assert.match(response.body.ela.message, /PNG and WebP are not converted/);
});

test('returns selected technical EXIF indicators without raw EXIF data', async () => {
  const exifJpeg = await sharp(pngBuffer).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const response = await request(app)
    .post('/api/analysis')
    .attach('image', exifJpeg, { filename: 'oriented.jpg', contentType: 'image/jpeg' });

  assert.equal(response.status, 201);
  assert.ok(response.body.report.metadataFindings.some((finding) => finding.code === 'exif_metadata'));
  assert.ok(response.body.report.metadataFindings.some((finding) => (
    finding.code === 'exif_orientation' && finding.message.includes('Rotate 90 CW')
  )));
  assert.equal(Object.hasOwn(response.body.report, 'exif'), false);
  assert.equal(JSON.stringify(response.body.report).includes('GPSLatitude'), false);
});

test('uses detected bytes and records a filename and MIME mismatch', async () => {
  const response = await request(app)
    .post('/api/analysis')
    .attach('image', pngBuffer, { filename: 'spoofed.jpg', contentType: 'image/jpeg' });

  assert.equal(response.status, 201);
  assert.equal(response.body.report.mimeType, 'image/png');
  assert.equal(response.body.report.detectedFormat, 'PNG');
  assert.equal(response.body.report.forensicChecks.find((check) => check.code === 'declared_mime_type').status, 'inconsistent');
  assert.equal(response.body.report.forensicChecks.find((check) => check.code === 'filename_extension').status, 'inconsistent');
});

test('rejects unsupported content even when its filename looks like an image', async () => {
  const response = await request(app)
    .post('/api/analysis')
    .attach('image', Buffer.from('not an image'), { filename: 'fake.png', contentType: 'image/png' });

  assert.equal(response.status, 415);
  assert.equal(response.body.code, 'UNSUPPORTED_IMAGE_FORMAT');
});

test('rejects a supported signature that cannot be decoded', async () => {
  const truncatedPng = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const response = await request(app)
    .post('/api/analysis')
    .attach('image', truncatedPng, { filename: 'truncated.png', contentType: 'image/png' });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'MALFORMED_IMAGE');
});

test('rejects corrupted pixel data even when the image header is valid', async () => {
  const corruptedPng = Buffer.from(pngBuffer);
  corruptedPng[62] ^= 0xff;
  const response = await request(app)
    .post('/api/analysis')
    .attach('image', corruptedPng, { filename: 'corrupted.png', contentType: 'image/png' });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'MALFORMED_IMAGE');
});

test('rejects files exceeding 20 MB', async () => {
  const oversizedImage = Buffer.alloc((20 * 1024 * 1024) + 1, 0);
  const response = await request(app)
    .post('/api/analysis')
    .attach('image', oversizedImage, { filename: 'large.png', contentType: 'image/png' });

  assert.equal(response.status, 413);
  assert.equal(response.body.code, 'LIMIT_FILE_SIZE');
});

test('requires a file in the image field', async () => {
  const response = await request(app).post('/api/analysis');

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'IMAGE_REQUIRED');
});

test('normalizes uniform JPEGs without failing when differences are absent', async () => {
  const uniform = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 128, g: 128, b: 128 } },
  }).jpeg({ quality: 90 }).toBuffer();
  const response = await request(app)
    .post('/api/analysis')
    .attach('image', uniform, { filename: 'uniform.jpg', contentType: 'image/jpeg' });

  assert.equal(response.status, 201);
  assert.equal(response.body.ela.status, 'completed');
  assert.ok(response.body.ela.normalizationPercentileValue >= 0);
  assert.ok(response.body.ela.normalizationPercentileValue <= 255);
});

test('normalizes an ordinary photographic gradient into a visible range', async () => {
  const width = 96;
  const height = 72;
  const photo = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      photo[offset] = (x * 3 + y) % 256;
      photo[offset + 1] = (y * 4 + Math.floor(x / 2)) % 256;
      photo[offset + 2] = (x + y * 2) % 256;
    }
  }
  const jpeg = await sharp(photo, { raw: { width, height, channels: 3 } }).jpeg({ quality: 96 }).toBuffer();
  const response = await request(app)
    .post('/api/analysis')
    .attach('image', jpeg, { filename: 'gradient-photo.jpg', contentType: 'image/jpeg' });

  assert.equal(response.status, 201);
  assert.equal(response.body.ela.status, 'completed');
  assert.ok(response.body.ela.normalizationPercentileValue > 0);
  const visualization = Buffer.from(response.body.ela.visualizationDataUrl.split(',')[1], 'base64');
  const pixels = await sharp(visualization).removeAlpha().raw().toBuffer();
  assert.ok(pixels.some((pixel) => pixel > 200), 'normalized visualization should expose differences');
});

test('keeps zero differences black and clips a small number of extreme outliers', () => {
  const noDifferences = normalizeElaDifferencesForDisplay(Buffer.alloc(3 * 4));
  assert.equal(noDifferences.normalizationPercentileValue, 0);
  assert.deepEqual(noDifferences.visualization, Buffer.alloc(3 * 4));

  const differences = Buffer.alloc(3 * 100);
  for (let pixel = 0; pixel < 99; pixel += 1) {
    differences.fill(2, pixel * 3, pixel * 3 + 3);
  }
  differences.fill(240, 99 * 3, 100 * 3);

  const normalized = normalizeElaDifferencesForDisplay(differences);
  assert.equal(normalized.normalizationPercentileValue, 2);
  assert.deepEqual(normalized.visualization.subarray(0, 3), Buffer.from([255, 255, 255]));
  assert.deepEqual(normalized.visualization.subarray(99 * 3), Buffer.from([255, 255, 255]));
});