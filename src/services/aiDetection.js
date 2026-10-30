import { pipeline } from '@huggingface/transformers';

const MODEL_ID = 'onnx-community/ai-image-detection-ONNX';

let detectorPromise = null;

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = pipeline('image-classification', MODEL_ID);
  }

  return detectorPromise;
}

export async function detectAIImage(file) {
  if (!(file instanceof File)) {
    throw new Error('Please select a valid image.');
  }

  const imageUrl = URL.createObjectURL(file);

  try {
    const detector = await getDetector();
    const results = await detector(imageUrl);

    const fakeResult = results.find(
      (item) => item.label.toLowerCase() === 'fake'
    );

    const realResult = results.find(
      (item) => item.label.toLowerCase() === 'real'
    );

    if (!fakeResult || !realResult) {
      throw new Error('The AI detection model returned unexpected labels.');
    }

    return {
      label:
        fakeResult.score > realResult.score
          ? 'AI-generated indicator'
          : 'Real-image indicator',
      fakeScore: fakeResult.score,
      realScore: realResult.score,
      model: MODEL_ID,
      disclaimer:
        'Experimental model result only. It cannot prove whether an image is AI-generated or authentic.',
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}