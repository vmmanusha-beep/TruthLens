import multer from 'multer';

export function errorHandler(error, _request, response, _next) {
  if (error instanceof multer.MulterError) {
    const isTooLarge = error.code === 'LIMIT_FILE_SIZE';
    const statusCode = isTooLarge ? 413 : 400;

    return response.status(statusCode).json({
      error: isTooLarge
        ? 'Image exceeds the 20 MB upload limit.'
        : 'Upload one image using the "image" form field.',
      code: error.code,
    });
  }

  const statusCode = Number.isInteger(error.statusCode)
    ? error.statusCode
    : Number.isInteger(error.status)
      ? error.status
      : 500;

  if (statusCode >= 500) console.error(error);

  return response.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error.' : error.message,
    ...(error.code && statusCode < 500 ? { code: error.code } : {}),
  });
}