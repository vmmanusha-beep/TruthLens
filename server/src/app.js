import cors from 'cors';
import express from 'express';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { createAnalysisRoutes } from './routes/analysis.routes.js';
import healthRoutes from './routes/health.routes.js';

export function createApp({ AnalysisReportModel } = {}) {
  const app = express();
  const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);

      const error = new Error('Origin is not allowed by CORS.');
      error.statusCode = 403;
      return callback(error);
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRoutes);
  app.use('/api/analysis', createAnalysisRoutes({ AnalysisReportModel }));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

const app = createApp();

export default app;