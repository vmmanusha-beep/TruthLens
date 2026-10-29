import mongoose from 'mongoose';

const metadataFindingSchema = new mongoose.Schema({
  code: { type: String, required: true },
  status: { type: String, enum: ['present', 'not_found', 'unavailable'], required: true },
  message: { type: String, required: true },
}, { _id: false });

const forensicCheckSchema = new mongoose.Schema({
  code: { type: String, required: true },
  status: { type: String, enum: ['consistent', 'inconsistent', 'not_assessed'], required: true },
  message: { type: String, required: true },
}, { _id: false });

const elaAnalysisSchema = new mongoose.Schema({
  method: { type: String, enum: ['jpeg_recompression_ela'], required: true },
  jpegQuality: { type: Number, min: 1, max: 100, required: true },
  normalization: { type: String, required: true, maxlength: 300 },
  normalizationPercentileValue: { type: Number, min: 0, max: 255, default: null },
  status: { type: String, enum: ['completed', 'unavailable', 'failed'], required: true },
  limitation: { type: String, required: true, maxlength: 500 },
}, { _id: false });

const analysisReportSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255,
  },
  mimeType: {
    type: String,
    required: true,
    enum: ['image/jpeg', 'image/png', 'image/webp'],
  },
  detectedFormat: {
    type: String,
    required: true,
    enum: ['JPEG', 'PNG', 'WebP'],
  },
  dimensions: {
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
  },
  fileSize: {
    type: Number,
    required: true,
    min: 1,
    max: 20 * 1024 * 1024,
  },
  sha256: {
    type: String,
    required: true,
    lowercase: true,
    match: /^[a-f0-9]{64}$/,
  },
  metadataFindings: {
    type: [metadataFindingSchema],
    default: [],
  },
  forensicChecks: {
    type: [forensicCheckSchema],
    default: [],
  },
  elaAnalysis: {
    type: elaAnalysisSchema,
    required: true,
  },
  analysisType: {
    type: String,
    enum: ['basic_forensic'],
    default: 'basic_forensic',
  },
  analysisTimestamp: {
    type: Date,
    required: true,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['not_run', 'pending', 'completed'],
    default: 'not_run',
  },
}, {
  timestamps: true,
  versionKey: false,
});

const AnalysisReport = mongoose.model('AnalysisReport', analysisReportSchema);

export default AnalysisReport;