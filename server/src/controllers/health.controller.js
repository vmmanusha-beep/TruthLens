import mongoose from 'mongoose';

const databaseStates = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export function getHealth(_request, response) {
  const hasConnectionString = Boolean(
    process.env.MONGODB_URI && process.env.MONGODB_URI !== 'your_mongodb_connection_string_here',
  );
  const database = hasConnectionString
    ? databaseStates[mongoose.connection.readyState] || 'unknown'
    : 'not_configured';
  const isHealthy = database === 'connected';

  return response.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    service: 'truthlens-api',
    database,
    timestamp: new Date().toISOString(),
  });
}