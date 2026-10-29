import mongoose from 'mongoose';

function sanitizeConnectionError(error, connectionUri) {
  let message = error instanceof Error ? error.message : String(error);
  message = message.replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '[MongoDB URI redacted]');

  try {
    const { username, password } = new URL(connectionUri);
    for (const credential of [username, password]) {
      if (!credential) continue;

      const decodedCredential = decodeURIComponent(credential);
      for (const value of new Set([credential, decodedCredential])) {
        if (value) message = message.split(value).join('[redacted]');
      }
    }
  } catch {
    return message;
  }

  return message;
}

export async function connectToDatabase() {
  const { MONGODB_URI } = process.env;

  if (!MONGODB_URI || MONGODB_URI === 'your_mongodb_connection_string_here') {
    console.warn('[database] MONGODB_URI is not configured; starting without a database connection.');
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.info('[database] MongoDB connection established.');
  } catch (error) {
    const isDevelopment = process.env.NODE_ENV === 'development'
      || process.env.npm_lifecycle_event === 'dev';

    if (isDevelopment) {
      console.error(`[database] MongoDB connection failed: ${sanitizeConnectionError(error, MONGODB_URI)}`);
    } else {
      console.error('[database] MongoDB connection failed. Check MONGODB_URI and database availability.');
    }
  }
}