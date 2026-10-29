import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import exifr from 'exifr';
import sharp from 'sharp';

const supportedFormats = new Map([
  ['image/jpeg', { name: 'JPEG', sharpFormat: 'jpeg', extensions: ['.jpg', '.jpeg'] }],
  ['image/png', { name: 'PNG', sharpFormat: 'png', extensions: ['.png'] }],
  ['image/webp', { name: 'WebP', sharpFormat: 'webp', extensions: ['.webp'] }],
]);
const orientationLabels = new Set([
  'Horizontal (normal)',
  'Mirror horizontal',
  'Rotate 180',
  'Mirror vertical',
  'Mirror horizontal and rotate 270 CW',
  'Rotate 90 CW',
  'Mirror horizontal and rotate 90 CW',
  'Rotate 270 CW',
]);
const ELA_JPEG_QUALITY = 90;
const ELA_MAX_PIXELS = 25_000_000;
const ELA_NORMALIZATION = 'For display only: the 99th percentile of nonzero per-pixel maximum absolute RGB differences is mapped linearly to 255; larger differences are clipped.';
const ELA_LIMITATION = 'Contrast enhancement changes visualization only, not the evidential strength of ELA. Bright or uneven regions can have many causes and are not proof of manipulation or authenticity.';

function createAnalysisError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function safeFilename(filename) {
  return String(filename || 'unnamed-image')
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 255) || 'unnamed-image';
}

function getMetadataFindings(exifStatus, exif = {}) {
  if (exifStatus === 'present') {
    const findings = [{
      code: 'exif_metadata',
      status: 'present',
      message: 'Readable EXIF metadata is present. Only selected non-sensitive technical indicators are retained.',
    }];

    const allowedFields = [
      ['Orientation', 'orientation'],
      ['ColorSpace', 'color space'],
      ['Flash', 'flash'],
      ['ResolutionUnit', 'resolution unit'],
      ['XResolution', 'horizontal resolution'],
      ['YResolution', 'vertical resolution'],
    ];

    for (const [field, label] of allowedFields) {
      const value = exif[field];
      const isNumericIndicator = typeof value === 'number' && Number.isFinite(value);
      const isKnownOrientation = field === 'Orientation' && orientationLabels.has(value);
      if (!isNumericIndicator && !isKnownOrientation) continue;

      findings.push({
        code: `exif_${field.toLowerCase()}`,
        status: 'present',
        message: `EXIF ${label}: ${value}.`,
      });
    }

    return findings;
  }

  if (exifStatus === 'unavailable') {
    return [{
      code: 'exif_metadata',
      status: 'unavailable',
      message: 'EXIF metadata could not be read safely.',
    }];
  }

  return [{
    code: 'exif_metadata',
    status: 'not_found',
    message: 'No readable EXIF metadata was found; absence alone is not evidence of manipulation.',
  }];
}

function unavailableEla(status, message) {
  return {
    method: 'jpeg_recompression_ela',
    jpegQuality: ELA_JPEG_QUALITY,
    normalization: ELA_NORMALIZATION,
    normalizationPercentileValue: null,
    status,
    limitation: ELA_LIMITATION,
    message,
    visualizationDataUrl: null,
  };
}

export function normalizeElaDifferencesForDisplay(differences) {
  if (differences.length % 3 !== 0) {
    throw new RangeError('ELA RGB difference data must contain complete pixels.');
  }

  const pixelCount = differences.length / 3;
  const histogram = new Uint32Array(256);
  let nonzeroPixelCount = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 3;
    const maximumChannelDifference = Math.max(
      differences[offset],
      differences[offset + 1],
      differences[offset + 2],
    );
    if (maximumChannelDifference === 0) continue;
    histogram[maximumChannelDifference] += 1;
    nonzeroPixelCount += 1;
  }

  if (nonzeroPixelCount === 0) {
    return {
      visualization: Buffer.alloc(differences.length),
      normalizationPercentileValue: 0,
    };
  }

  const percentileRank = Math.ceil(nonzeroPixelCount * 0.99);
  let cumulativePixels = 0;
  let normalizationPercentileValue = 255;
  for (let value = 1; value < histogram.length; value += 1) {
    cumulativePixels += histogram[value];
    if (cumulativePixels >= percentileRank) {
      normalizationPercentileValue = value;
      break;
    }
  }

  const scale = 255 / normalizationPercentileValue;
  const visualization = Buffer.allocUnsafe(differences.length);
  for (let index = 0; index < differences.length; index += 1) {
    visualization[index] = Math.min(255, Math.round(differences[index] * scale));
  }

  return { visualization, normalizationPercentileValue };
}

async function decodeRgb(buffer) {
  return sharp(buffer, {
    failOn: 'error',
    limitInputPixels: ELA_MAX_PIXELS,
    animated: false,
  })
    .rotate()
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function createElaResult(buffer, format, dimensions) {
  if (format.name !== 'JPEG') {
    return unavailableEla(
      'unavailable',
      'Error Level Analysis is available only for JPEG files; PNG and WebP are not converted for this method.',
    );
  }

  if (dimensions.width * dimensions.height > ELA_MAX_PIXELS) {
    return unavailableEla('unavailable', 'This image exceeds the 25-megapixel limit for the ELA prototype.');
  }

  try {
    const original = await decodeRgb(buffer);
    const recompressedBuffer = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: ELA_MAX_PIXELS,
      animated: false,
    })
      .rotate()
      .toColourspace('srgb')
      .jpeg({ quality: ELA_JPEG_QUALITY })
      .toBuffer();
    const recompressed = await decodeRgb(recompressedBuffer);

    if (
      original.info.width !== recompressed.info.width
      || original.info.height !== recompressed.info.height
      || original.info.channels !== 3
      || recompressed.info.channels !== 3
    ) {
      throw new Error('ELA image dimensions or channels did not match.');
    }

    const differences = Buffer.allocUnsafe(original.data.length);
    for (let index = 0; index < original.data.length; index += 1) {
      differences[index] = Math.abs(original.data[index] - recompressed.data[index]);
    }
    const {
      visualization: displayDifferences,
      normalizationPercentileValue,
    } = normalizeElaDifferencesForDisplay(differences);

    const visualization = await sharp(displayDifferences, {
      raw: {
        width: original.info.width,
        height: original.info.height,
        channels: 3,
      },
    })
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();

    return {
      method: 'jpeg_recompression_ela',
      jpegQuality: ELA_JPEG_QUALITY,
      normalization: ELA_NORMALIZATION,
      normalizationPercentileValue,
      status: 'completed',
      limitation: ELA_LIMITATION,
      message: 'The raw RGB differences were preserved; only this visualization was contrast-normalized.',
      visualizationDataUrl: `data:image/png;base64,${visualization.toString('base64')}`,
    };
  } catch {
    return unavailableEla('failed', 'ELA could not be generated for this image. Basic file checks are still available.');
  }
}

export async function inspectImage(file) {
  if (!file?.buffer?.length) {
    throw createAnalysisError(400, 'IMAGE_REQUIRED', 'Attach one image in the "image" form field.');
  }

  let detectedType;
  try {
    detectedType = await fileTypeFromBuffer(file.buffer);
  } catch {
    throw createAnalysisError(400, 'MALFORMED_IMAGE', 'The uploaded file signature could not be read.');
  }
  const format = detectedType && supportedFormats.get(detectedType.mime);

  if (!format) {
    throw createAnalysisError(415, 'UNSUPPORTED_IMAGE_FORMAT', 'Only JPEG, PNG, and WebP image contents are supported.');
  }

  let imageMetadata;
  try {
    const image = sharp(file.buffer, {
      failOn: 'error',
      limitInputPixels: 100_000_000,
      animated: false,
    });
    imageMetadata = await image.metadata();
    await image.stats();
  } catch {
    throw createAnalysisError(400, 'MALFORMED_IMAGE', 'The uploaded file has a supported signature but could not be decoded as an image.');
  }

  if (imageMetadata.format !== format.sharpFormat || !imageMetadata.width || !imageMetadata.height) {
    throw createAnalysisError(400, 'MALFORMED_IMAGE', 'The image signature and decoded image properties are inconsistent.');
  }

  let exifStatus = 'not_found';
  let exif = {};
  try {
    exif = await exifr.parse(file.buffer, {
      tiff: true,
      exif: true,
      gps: false,
      iptc: false,
      xmp: false,
      icc: false,
      jfif: false,
      ihdr: false,
    });
    if (exif && Object.keys(exif).length > 0) exifStatus = 'present';
  } catch {
    exifStatus = 'unavailable';
  }

  const filename = safeFilename(file.originalname);
  const declaredMimeType = file.mimetype || '';
  const filenameExtension = path.extname(filename).toLowerCase();
  const extensionMatches = format.extensions.includes(filenameExtension);
  const mimeMatches = declaredMimeType === detectedType.mime;

  const dimensions = {
    width: imageMetadata.width,
    height: imageMetadata.height,
  };
  const ela = await createElaResult(file.buffer, format, dimensions);

  return {
    report: {
      filename,
      mimeType: detectedType.mime,
      detectedFormat: format.name,
      dimensions,
      fileSize: file.buffer.length,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
      metadataFindings: getMetadataFindings(exifStatus, exif),
      forensicChecks: [
      {
        code: 'signature_format',
        status: 'consistent',
        message: `The file signature identifies ${format.name}.`,
      },
      {
        code: 'decoder_format',
        status: 'consistent',
        message: 'The image decoder agrees with the detected file format.',
      },
      {
        code: 'declared_mime_type',
        status: !declaredMimeType || declaredMimeType === 'application/octet-stream'
          ? 'not_assessed'
          : mimeMatches ? 'consistent' : 'inconsistent',
        message: !declaredMimeType || declaredMimeType === 'application/octet-stream'
          ? 'The upload did not provide a specific MIME type.'
          : mimeMatches
            ? 'The declared MIME type matches the detected file format.'
            : 'The declared MIME type does not match the detected file format; detected bytes were used.',
      },
      {
        code: 'filename_extension',
        status: filenameExtension
          ? extensionMatches ? 'consistent' : 'inconsistent'
          : 'not_assessed',
        message: !filenameExtension
          ? 'The filename has no extension to compare.'
          : extensionMatches
            ? 'The filename extension matches the detected file format.'
            : 'The filename extension does not match the detected file format; detected bytes were used.',
      },
      ],
      analysisType: 'basic_forensic',
      analysisTimestamp: new Date(),
      elaAnalysis: {
        method: ela.method,
        jpegQuality: ela.jpegQuality,
        normalization: ela.normalization,
        normalizationPercentileValue: ela.normalizationPercentileValue,
        status: ela.status,
        limitation: ela.limitation,
      },
      status: 'completed',
    },
    ela,
  };
}