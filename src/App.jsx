import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  ClipboardList,
  FileImage,
  Fingerprint,
  Focus,
  ImagePlus,
  LoaderCircle,
  Menu,
  ScanSearch,
  Shield,
  X,
} from 'lucide-react';
import ConnectionStatus from './components/ConnectionStatus.jsx';
import { analyzeImage } from './lib/api.js';
import { detectAIImage } from './services/aiDetection';

const plannedModules = [
  {
    number: '01',
    icon: Focus,
    title: 'Image forensics',
    description:
      'Explore visual inconsistencies and manipulation cues with image-analysis methods built for the project.',
    tag: 'PLANNED MODULE',
    tone: 'violet',
  },
  {
    number: '02',
    icon: Fingerprint,
    title: 'Context & provenance',
    description:
      'Give metadata and file context a place alongside visual evidence, not in place of it.',
    tag: 'PLANNED MODULE',
    tone: 'cyan',
  },
  {
    number: '03',
    icon: Shield,
    title: 'Evidence, not verdicts',
    description:
      'Present findings with clear limitations so people can review the signals behind an assessment.',
    tag: 'PROJECT PRINCIPLE',
    tone: 'lime',
  },
];

const supportedFormats = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
};

const extensionMimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function getSupportedMimeType(file) {
  const mimeType = file.type.toLowerCase();
  if (Object.hasOwn(supportedFormats, mimeType)) return mimeType;
  if (mimeType === 'image/jpg') return 'image/jpeg';

  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!mimeType || mimeType === 'application/octet-stream') {
    return extensionMimeTypes[extension] || '';
  }
  return '';
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewStatus, setPreviewStatus] = useState('empty');
  const [previewDimensions, setPreviewDimensions] = useState(null);
  const [fileHash, setFileHash] = useState('');
  const [hashStatus, setHashStatus] = useState('idle');
  const [analysisStatus, setAnalysisStatus] = useState('idle');
  const [analysisReport, setAnalysisReport] = useState(null);
  const [elaResult, setElaResult] = useState(null);
  const [analysisError, setAnalysisError] = useState('');
  const [aiDetectionResult, setAiDetectionResult] = useState(null);
  const [aiDetectionError, setAiDetectionError] = useState('');
  const [message, setMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef(null);
  const analysisRequestRef = useRef(0);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  useEffect(() => {
    if (!selectedFile) return undefined;

    let isActive = true;
    if (!globalThis.crypto?.subtle || typeof selectedFile.arrayBuffer !== 'function') {
      setHashStatus('unavailable');
      return () => { isActive = false; };
    }

    setHashStatus('loading');
    selectedFile.arrayBuffer()
      .then((buffer) => globalThis.crypto.subtle.digest('SHA-256', buffer))
      .then((digest) => {
        if (!isActive) return;
        const hexDigest = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        setFileHash(hexDigest);
        setHashStatus('ready');
      })
      .catch(() => {
        if (isActive) setHashStatus('error');
      });

    return () => { isActive = false; };
  }, [selectedFile]);

  function chooseFile(file) {
    if (!file) return;
    if (!getSupportedMimeType(file)) {
      setMessage('Unsupported file type. Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setMessage('This prototype accepts images up to 20 MB. Your current preview was kept.');
      return;
    }

    setMessage('');
    setPreviewDimensions(null);
    setPreviewStatus('loading');
    setFileHash('');
    setHashStatus('loading');
    analysisRequestRef.current += 1;
    setAnalysisStatus('idle');
    setAnalysisReport(null);
    setElaResult(null);
    setAnalysisError('');
    setSelectedFile(file);
  }

  function handleFileChange(event) {
    chooseFile(event.target.files[0]);
    event.target.value = '';
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    chooseFile(event.dataTransfer.files[0]);
  }

  async function runAnalysis() {
  if (!selectedFile || previewStatus !== 'ready' || analysisStatus === 'loading') return;

  const requestId = analysisRequestRef.current + 1;
  analysisRequestRef.current = requestId;

  setAnalysisStatus('loading');
  setAnalysisReport(null);
  setElaResult(null);
  setAnalysisError('');
  setAiDetectionResult(null);
  setAiDetectionError('');

  const [basicResult, aiResult] = await Promise.allSettled([
    analyzeImage(selectedFile),
    detectAIImage(selectedFile),
  ]);

  if (requestId !== analysisRequestRef.current) return;

  if (basicResult.status === 'fulfilled') {
    setAnalysisReport(basicResult.value.report);
    setElaResult(basicResult.value.ela || null);
    setAnalysisStatus('success');
  } else {
    setAnalysisError(
      basicResult.reason?.message || 'Basic forensic analysis failed.'
    );
    setAnalysisStatus('error');
  }

  if (aiResult.status === 'fulfilled') {
    setAiDetectionResult(aiResult.value);
  } else {
    setAiDetectionError(
      aiResult.reason?.message || 'AI detection could not be completed.'
    );
  }
}

    function clearSelection() {
    analysisRequestRef.current += 1;
    setSelectedFile(null);
    setPreviewDimensions(null);
    setPreviewStatus('empty');
    setFileHash('');
    setHashStatus('idle');
    setAnalysisStatus('idle');
    setAnalysisReport(null);
    setElaResult(null);
    setAnalysisError('');
    setMessage('');
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#home" aria-label="TruthLens home">
          <span className="brand-mark"><ScanSearch size={19} strokeWidth={2} /></span>
          <span>TRUTH<span className="brand-accent">LENS</span></span>
        </a>

        <ConnectionStatus />

        <button
          className="menu-toggle icon-button"
          type="button"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <nav id="main-navigation" className={menuOpen ? 'navigation navigation-open' : 'navigation'} aria-label="Main navigation">
          <a href="#approach" onClick={() => setMenuOpen(false)}>Our approach</a>
          <a href="#workspace" onClick={() => setMenuOpen(false)}>Workspace</a>
          <a className="nav-cta" href="#workspace" onClick={() => setMenuOpen(false)}>
            Try the prototype <ArrowRight size={15} />
          </a>
        </nav>
      </header>

      <section className="hero page-shell" id="home">
        <div className="hero-copy enter-up">
          <div className="eyebrow"><span className="eyebrow-line" /> DIGITAL CONTENT INTEGRITY LAB</div>
          <h1>Look closer.<br /><span>Question the image.</span></h1>
          <p className="hero-description">
            TruthLens is a student-built research prototype exploring how image forensics can help people examine digital content with more context and care.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#workspace">
              Explore the prototype <ArrowDown size={16} />
            </a>
            <a className="text-link" href="#approach">How we think about evidence <ArrowRight size={15} /></a>
          </div>
          <div className="prototype-note">
            <span className="status-dot" />
            <span>IMAGE FORENSICS + AI RESEARCH</span>
<span className="note-divider" />
<span className="note-muted">Experimental AI detection · no guaranteed verdict</span>
          </div>
        </div>
        <div className="hero-visual enter-up" aria-label="Illustrative image preview">
          <div className="visual-topline">
            <span><span className="live-dot" /> VISUAL RESEARCH / 001</span>
            <span className="visual-topline-right">DEMO ASSET</span>
          </div>
          <div className="image-frame">
            <img
              src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=85"
              alt="Illustrative landscape photograph; it has not been analyzed."
            />
            <div className="image-wash" />
            <div className="image-corner corner-tl" />
            <div className="image-corner corner-br" />
            <div className="scan-line" />
            <div className="image-label"><span className="label-square" /> ILLUSTRATIVE MEDIA · NOT ANALYZED</div>
            <div className="image-coordinates">37° 46' 49.2" N<br />122° 25' 09.8" W</div>
          </div>
          <div className="visual-footer">
            <span>NO DETECTION RESULTS</span>
            <span className="visual-footer-id">TL—PROTO—001</span>
          </div>
          <div className="visual-index">A / 01</div>
        </div>
        <div className="hero-side-label">RESEARCH IN PROGRESS <span>—</span> 2026</div>
      </section>

      <section className="approach-section" id="approach">
        <div className="page-shell approach-inner">
          <div className="section-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> THE PROJECT</div>
              <h2>Designed for careful<br />inspection, <span>not easy answers.</span></h2>
            </div>
            <p className="section-intro">
              A detection tool should show its work. TruthLens is being developed around transparent signals, clear limitations, and a human in the loop.
            </p>
          </div>

          <div className="module-grid">
            {plannedModules.map(({ number, icon: Icon, title, description, tag, tone }) => (
              <article className={`module module-${tone}`} key={number}>
                <div className="module-top">
                  <span className="module-number">{number} / 03</span>
                  <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
                <div className="module-tag"><span />{tag}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace-section page-shell" id="workspace" aria-labelledby="workspace-title">
        <div className="workspace-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> LOCAL PREVIEW</div>
            <h2 id="workspace-title">Bring an image<br /><span>into focus.</span></h2>
          </div>
          <p>Image previews and experimental AI classification run in your browser. Basic forensic checks, including file validation, metadata indicators and ELA, are performed by the backend.</p>
        </div>

        <div
          className={`upload-panel${isDragging ? ' is-dragging' : ''}${selectedFile ? ' has-file' : ''}`}
          aria-busy={previewStatus === 'loading'}
          onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false);
          }}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            id="image-input"
            className="visually-hidden"
            type="file"
            accept=".jpg,.jpeg,image/jpeg,.png,image/png,.webp,image/webp"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleFileChange}
          />
          {selectedFile ? (
            <div className="selected-preview">
              <div className="preview-media">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt={`Local preview of ${selectedFile.name}`}
                    onLoad={(event) => {
                      setPreviewDimensions({
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      });
                      setPreviewStatus('ready');
                    }}
                    onError={() => setPreviewStatus('error')}
                  />
                )}
                {previewStatus === 'loading' && (
                  <div className="preview-overlay" role="status">
                    <LoaderCircle size={19} className="spinner" />
                    <span>Preparing local preview</span>
                  </div>
                )}
                {previewStatus === 'error' && (
                  <div className="preview-overlay preview-error" role="status">
                    <ImagePlus size={19} />
                    <span>Preview unavailable</span>
                  </div>
                )}
              </div>
              <div className="selected-details">
                <span className="file-kind"><FileImage size={15} /> LOCAL FILE</span>
                <h3 title={selectedFile.name}>{selectedFile.name}</h3>
                <p>{formatFileSize(selectedFile.size)} <span>·</span> {supportedFormats[getSupportedMimeType(selectedFile)]}</p>
                <div className="preview-status" aria-live="polite">
                  {previewStatus === 'ready' ? (
  <>
    <Check size={14} />
    {analysisStatus === 'success'
      ? 'Preview and analysis complete'
      : analysisStatus === 'loading'
        ? 'Analysis in progress'
        : 'Preview ready; analysis not yet run'}
  </>
) :
                    previewStatus === 'error' ? 'Try another image format.' : 'Preparing image locally…'}
                </div>
              </div>
              <div className="preview-actions">
                <button className="button button-outline" type="button" onClick={() => fileInputRef.current?.click()}>
                  Replace image <ArrowRight size={15} />
                </button>
                <button className="icon-button clear-file" type="button" aria-label="Remove selected image" onClick={clearSelection}>
                  <X size={18} />
                </button>
              </div>
            </div>
          ) : (
            <div className="upload-empty">
              <div className="upload-symbol" aria-hidden="true"><ImagePlus size={23} strokeWidth={1.6} /></div>
              <div className="upload-copy">
                <h3>Drop an image to preview</h3>
                <p id="upload-help">JPG, PNG, or WebP · up to 20 MB · stays in this browser</p>
              </div>
              <button className="button button-outline" type="button" onClick={() => fileInputRef.current?.click()}>
                Choose an image <ArrowRight size={15} />
              </button>
            </div>
          )}
          {message && <p className="upload-message" role="alert">{message}</p>}
        </div>
        <div className="analysis-action">
          <button
            className="button button-analyze"
            type="button"
            disabled={!selectedFile || previewStatus !== 'ready' || analysisStatus === 'loading'}
            aria-busy={analysisStatus === 'loading'}
            onClick={runAnalysis}
          >
            {analysisStatus === 'loading' ? <><LoaderCircle size={15} className="spinner" /> Running checks…</> :
              analysisStatus === 'success' ? <>Run checks again <ScanSearch size={15} /></> :
                <>Analyze Media <ScanSearch size={15} /></>}
          </button>
          <span>Basic forensic analysis + experimental AI image classification</span>
        </div>
        {analysisError && <p className="analysis-error" role="alert">{analysisError}</p>}

        <section className="report-panel" aria-labelledby="report-title" aria-live="polite">
          <div className="report-header">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> REVIEW OUTPUT</div>
              <h3 id="report-title">Local file brief</h3>
            </div>
            <span className={`report-state${analysisReport ? ' report-state-complete' : ''}`}>
              <span /> {analysisReport ? 'BASIC CHECKS COMPLETE' : 'ANALYSIS NOT RUN'}
            </span>
          </div>
          {selectedFile && previewStatus === 'ready' && previewDimensions ? (
            <>
              <dl className="report-grid">
                <div><dt>File name</dt><dd title={selectedFile.name}>{selectedFile.name}</dd></div>
                <div><dt>File format</dt><dd>{supportedFormats[getSupportedMimeType(selectedFile)]}</dd></div>
                <div><dt>MIME type</dt><dd>{selectedFile.type || 'Not provided by browser'}</dd></div>
                <div><dt>File size</dt><dd>{formatFileSize(selectedFile.size)}</dd></div>
                <div><dt>Image dimensions</dt><dd>{previewDimensions.width} × {previewDimensions.height} px</dd></div>
                <div>
                  <dt>SHA-256</dt>
                  <dd>
                    {hashStatus === 'ready' ? <code className="hash-value">{fileHash}</code> :
                      hashStatus === 'loading' ? 'Calculating locally…' :
                        hashStatus === 'unavailable' ? 'Unavailable in this browser context' : 'Could not calculate'}
                  </dd>
                </div>
              </dl>
              <p className="report-disclaimer">These are local file details. Run analysis to view experimental AI classification and backend forensic indicators. Neither can prove authenticity or manipulation.</p>
            </>
          ) : (
            <div className="report-empty" role="status">
              {previewStatus === 'loading' ? <LoaderCircle size={18} className="spinner" /> : <ClipboardList size={18} />}
              <div>
                <h4>{previewStatus === 'loading' ? 'Preparing file brief' : previewStatus === 'error' ? 'Preview could not be prepared' : 'No image selected'}</h4>
                <p>{previewStatus === 'loading'
                  ? 'Reading basic image dimensions in this browser. No analysis is running.'
                  : previewStatus === 'error'
                    ? 'The file could not be decoded as an image. Choose a different JPG, PNG, or WebP file.'
                    : 'Choose an image to see its local file details, then run basic forensic analysis and experimental AI classification.'}</p>
              </div>
            </div>
          )}
          {(aiDetectionResult || aiDetectionError) && (
  <section className="ai-detection-result">
    <h4>AI-Generated Image Detection</h4>

    {aiDetectionResult && (
      <>
        <p>
          <strong>Model result:</strong> {aiDetectionResult.label}
        </p>
        <p>
          <strong>Fake score:</strong>{' '}
          {(aiDetectionResult.fakeScore * 100).toFixed(2)}%
        </p>
        <p>
          <strong>Real score:</strong>{' '}
          {(aiDetectionResult.realScore * 100).toFixed(2)}%
        </p>
        <p>{aiDetectionResult.disclaimer}</p>
      </>
    )}

    {aiDetectionError && (
      <p role="alert">{aiDetectionError}</p>
    )}
  </section>
)}
          {analysisReport && (
            <div className="server-report">
              <div className="server-report-heading">
                <div>
                  <span className="eyebrow-line" />
                  <span className="server-report-kicker">SERVER REPORT · BASIC FORENSICS</span>
                  <h4>Observable file checks</h4>
                </div>
                <span className="report-state"><span /> BASIC CHECKS COMPLETE</span>
              </div>
              <dl className="report-grid server-report-grid">
                <div><dt>Detected format</dt><dd>{analysisReport.detectedFormat}</dd></div>
                <div><dt>Dimensions</dt><dd>{analysisReport.dimensions.width} × {analysisReport.dimensions.height} px</dd></div>
                <div><dt>Server file size</dt><dd>{formatFileSize(analysisReport.fileSize)}</dd></div>
                <div><dt>Server SHA-256</dt><dd><code className="hash-value">{analysisReport.sha256}</code></dd></div>
                <div><dt>Analysis type</dt><dd>Basic forensic checks · not AI</dd></div>
                <div><dt>Analysis time</dt><dd>{new Date(analysisReport.analysisTimestamp || analysisReport.createdAt).toLocaleString()}</dd></div>
              </dl>
              <section className="ela-result" aria-labelledby="ela-title">
                <div className="ela-heading">
                  <div>
                    <h5 id="ela-title">Contrast-enhanced ELA visualization</h5>
                    {elaResult?.status === 'completed' && (
                      <span className="ela-method">JPEG recompression · quality {elaResult.jpegQuality}</span>
                    )}
                  </div>
                  <span className={`finding-status finding-${elaResult?.status || 'unavailable'}`}>
                    {elaResult?.status || 'unavailable'}
                  </span>
                </div>
                {elaResult?.status === 'completed' && elaResult.visualizationDataUrl ? (
                  <img
                    className="ela-visualization"
                    src={elaResult.visualizationDataUrl}
                    alt="Contrast-enhanced ELA visualization showing normalized pixel differences after JPEG recompression. This is not a manipulation verdict."
                  />
                ) : (
                  <p className="ela-unavailable">{elaResult?.message || 'ELA visualization is unavailable for this file.'}</p>
                )}
                <p className="ela-normalization">
                  {elaResult?.normalization || 'Display normalization: the 99th percentile of nonzero per-pixel maximum RGB differences is scaled to full range; higher values are clipped.'}
                  {elaResult?.normalizationPercentileValue !== null && elaResult?.normalizationPercentileValue !== undefined
                    ? ` Scale threshold: ${elaResult.normalizationPercentileValue}/255.`
                    : ''}
                </p>
                <p className="ela-limitations">
                  {elaResult?.limitation || 'Contrast enhancement changes visualization only, not the evidential strength of ELA. Bright or uneven regions can have many causes and are not proof of manipulation or authenticity.'}
                </p>
              </section>
              <div className="finding-list">
                <h5>Forensic checks</h5>
                {analysisReport.forensicChecks.map((check) => (
                  <div className="finding-row" key={check.code}>
                    <span className={`finding-status finding-${check.status}`}>{check.status.replace('_', ' ')}</span>
                    <span className="finding-code">{check.code.replaceAll('_', ' ')}</span>
                    <p>{check.message}</p>
                  </div>
                ))}
              </div>
              <div className="finding-list metadata-findings">
                <h5>Metadata indicators</h5>
                {analysisReport.metadataFindings.map((finding) => (
                  <div className="finding-row" key={finding.code}>
                    <span className={`finding-status finding-${finding.status}`}>{finding.status.replace('_', ' ')}</span>
                    <span className="finding-code">{finding.code.replaceAll('_', ' ')}</span>
                    <p>{finding.message}</p>
                  </div>
                ))}
              </div>
              <p className="report-disclaimer">This server report contains basic forensic indicators only. Experimental AI classification is displayed separately above. Neither result proves authenticity or manipulation.</p>
            </div>
          )}
        </section>
       <p className="privacy-line"><Shield size={14} /> AI classification runs in your browser. The selected image is also sent to the backend for basic forensic analysis.</p>
      </section>

      <footer className="footer page-shell">
        <a className="brand footer-brand" href="#home">
          <span className="brand-mark"><ScanSearch size={17} strokeWidth={2} /></span>
          <span>TRUTH<span className="brand-accent">LENS</span></span>
        </a>
        <span className="footer-caption">A FINAL-YEAR PROJECT IN DEVELOPMENT</span>
        <a className="back-top" href="#home">Back to top <ArrowRight size={14} /></a>
      </footer>
    </main>
  );
}

export default App;