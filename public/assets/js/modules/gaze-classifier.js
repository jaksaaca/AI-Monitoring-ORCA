/**
 * ================================================
 *  ORCA Host Monitoring — Gaze Classifier Module
 *  Runs EfficientNet-based head pose classification
 *  in the browser using ONNX Runtime Web.
 *  Author: Jaksa Setia Alam
 * ================================================
 */

let session = null;
let _isReady = false;

const CLASSES = ['Depan', 'Kiri', 'Kanan', 'Atas', 'Bawah'];
const INPUT_SIZE = 224;

// ImageNet normalization constants (must match training preprocessing)
const MEAN = [0.485, 0.456, 0.406];
const STD  = [0.229, 0.224, 0.225];

/**
 * Initialize ONNX Runtime session with the gaze model.
 * @param {string} modelPath — path to the .onnx model file
 * @param {function} onProgress — callback for loading status updates
 * @returns {Promise<void>}
 */
export async function init(modelPath, onProgress) {
    if (_isReady) return;

    onProgress?.('Loading gaze classification model...');

    try {
        // Configure ONNX Runtime for optimal browser performance
        // Use 'wasm' as execution provider (most compatible)
        session = await ort.InferenceSession.create(modelPath, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all',
        });

        _isReady = true;
        onProgress?.('Gaze classification model ready.');
    } catch (e) {
        console.error('[GazeClassifier] Failed to load model:', e);
        onProgress?.('ERROR: Failed to load gaze model.');
        throw e;
    }
}

/**
 * Classify the head pose from a cropped face image.
 * @param {HTMLCanvasElement|HTMLVideoElement} source — image source
 * @param {object} faceBox — bounding box {x, y, width, height} in source coordinates
 * @returns {Promise<{class: string, classIndex: number, confidence: number}>}
 */
export async function classify(source, faceBox) {
    if (!_isReady || !session) {
        return { class: 'Depan', classIndex: 0, confidence: 0 };
    }

    try {
        // Step 1: Crop and resize face to 224x224
        const tensor = preprocessFace(source, faceBox);

        // Step 2: Run inference
        const feeds = { 'input': tensor };
        const results = await session.run(feeds);
        const output = results['output'];
        const logits = output.data;

        // --- CONFIGURATION ---
        // SENSITIVITAS "Nunduk" (Bawah). Range 0.0 - 1.0
        // Semakin KECIL angkanya, semakin GAMPANG/SENSITIF AI mendeteksi nunduk.
        const SENSITIVITAS_NUNDUK = 0.05; // Diubah jadi 5% (SANGAT SENSITIF)

        // Step 3: Calculate probabilities for all classes (Softmax)
        let maxLogit = logits[0];
        for (let i = 1; i < logits.length; i++) {
            if (logits[i] > maxLogit) maxLogit = logits[i];
        }

        let expSum = 0;
        const probs = new Float32Array(logits.length);
        for (let i = 0; i < logits.length; i++) {
            const val = Math.exp(logits[i] - maxLogit);
            probs[i] = val;
            expSum += val;
        }
        for (let i = 0; i < probs.length; i++) {
            probs[i] /= expSum;
        }

        // Step 4: Find argmax (predicted class)
        let maxIdx = 0;
        let maxProb = probs[0];
        for (let i = 1; i < probs.length; i++) {
            if (probs[i] > maxProb) {
                maxProb = probs[i];
                maxIdx = i;
            }
        }

        // --- Custom Sensitivity Logic ---
        // Jika probabilitas 'Bawah' (index 4) mencapai batas sensitivitas (misal 25%),
        // kita langsung paksa vonis jadi 'Bawah', tak peduli walaupun 'Depan' skornya lebih besar.
        // Ini mengatasi model yang terlalu kebal (bias) ke depan.
        if (probs[4] >= SENSITIVITAS_NUNDUK) {
            maxIdx = 4;
        }

        const confidence = probs[maxIdx];

        let poseClass = CLASSES[maxIdx];

        // Mirror correction (same as Python version):
        // Because the video is mirrored (scaleX(-1)), left/right are swapped
        if (poseClass === 'Kiri') poseClass = 'Kanan';
        else if (poseClass === 'Kanan') poseClass = 'Kiri';

        return { class: poseClass, classIndex: maxIdx, confidence };

    } catch (e) {
        console.warn('[GazeClassifier] Inference error:', e);
        return { class: 'Depan', classIndex: 0, confidence: 0 };
    }
}

/**
 * Preprocess a face crop into an ONNX tensor:
 *   1. Crop face region from source
 *   2. Resize to 224x224
 *   3. Convert to RGB float [0, 1]
 *   4. Normalize with ImageNet mean/std
 *   5. Reshape to NCHW format [1, 3, 224, 224]
 *
 * @param {HTMLVideoElement} source — video element
 * @param {object} box — {x, y, width, height}
 * @returns {ort.Tensor}
 */
function preprocessFace(source, box) {
    // Use an offscreen canvas to crop and resize
    const canvas = getOffscreenCanvas();
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = INPUT_SIZE;
    canvas.height = INPUT_SIZE;

    // Draw the cropped face region, scaled to 224x224
    ctx.drawImage(
        source,
        box.x, box.y, box.width, box.height,  // source crop
        0, 0, INPUT_SIZE, INPUT_SIZE            // destination (224x224)
    );

    // Get raw pixel data (RGBA)
    const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
    const pixels = imageData.data; // Uint8ClampedArray, length = 224*224*4

    // Create float32 array in NCHW format: [1, 3, 224, 224]
    const totalPixels = INPUT_SIZE * INPUT_SIZE;
    const float32Data = new Float32Array(3 * totalPixels);

    for (let i = 0; i < totalPixels; i++) {
        const r = pixels[i * 4] / 255.0;
        const g = pixels[i * 4 + 1] / 255.0;
        const b = pixels[i * 4 + 2] / 255.0;

        // Channel-first order: R plane, then G plane, then B plane
        // Apply ImageNet normalization: (pixel - mean) / std
        float32Data[i]                  = (r - MEAN[0]) / STD[0];
        float32Data[i + totalPixels]    = (g - MEAN[1]) / STD[1];
        float32Data[i + totalPixels * 2] = (b - MEAN[2]) / STD[2];
    }

    return new ort.Tensor('float32', float32Data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
}

// Reusable offscreen canvas for preprocessing
let _offscreenCanvas = null;
function getOffscreenCanvas() {
    if (!_offscreenCanvas) {
        _offscreenCanvas = document.createElement('canvas');
    }
    return _offscreenCanvas;
}

/**
 * @returns {boolean} whether the classifier is initialized
 */
export function isReady() {
    return _isReady;
}

/**
 * @returns {string[]} list of class names
 */
export function getClasses() {
    return [...CLASSES];
}
