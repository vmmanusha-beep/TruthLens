import { Router } from 'express';
import { createAnalysisController } from '../controllers/analysis.controller.js';
import imageUpload from '../middleware/image-upload.js';

export function createAnalysisRoutes({ AnalysisReportModel } = {}) {
  const router = Router();

  router.post('/', imageUpload, createAnalysisController(AnalysisReportModel));

  return router;
}