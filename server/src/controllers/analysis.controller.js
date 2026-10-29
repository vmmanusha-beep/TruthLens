import AnalysisReport from '../models/analysis-report.model.js';
import { inspectImage } from '../services/image-analysis.service.js';

export function createAnalysisController(AnalysisReportModel = AnalysisReport) {
  return async function analyzeImage(request, response, next) {
    try {
      const { report: reportData, ela } = await inspectImage(request.file);
      const report = await AnalysisReportModel.create(reportData);

      return response.status(201).json({
        message: 'Basic forensic checks completed. This is not AI-powered manipulation detection.',
        report,
        ela,
      });
    } catch (error) {
      return next(error);
    }
  };
}