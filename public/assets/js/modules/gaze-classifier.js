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

// Pre-allocated buffers for preprocessing (avoids ~600KB GC per frame)
const TOTAL_PIXELS = INPUT_SIZE * INPUT_SIZE;
const _float32Buf = new Float32Array(3 * TOTAL_PIXELS);
const _tensorDims = [1, 3, INPUT_SIZE, INPUT_SIZE];

// Class bias: boosts underrepresented classes in logit space BEFORE softmax.
// This corrects model bias toward 'Depan' without the aggressive 5% override hack.
// Bawah bias of 1.5 ≈ 4.5x probability boost (principled alternative to SENSITIVITAS_NUNDUK)
const CLASS_BIAS = [0, 0, 0, 0, 1.5]; // [Depan, Kiri, Kanan, Atas, Bawah]

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
        // Configure ONNX Runtime — prefer GPU (WebGL) with WASM fallback
        session = await ort.InferenceSession.create(modelPath, {
            executionProviders: ['webgl', 'wasm'],
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

        // Step 3: Apply class bias to correct model imbalance, then softmax
        // This replaces the old SENSITIVITAS_NUNDUK=0.05 hack which forced
        // 'Bawah' whenever it had ≥5% probability (causing massive false positives).
        // Class bias adds to logits BEFORE softmax — mathematically principled.
        let maxLogit = -Infinity;
        for (let i = 0; i < logits.length; i++) {
            logits[i] += CLASS_BIAS[i]; // Apply bias in logit space
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
    // Avoid resetting dimensions if already correct (prevents canvas buffer realloc)
    if (canvas.width !== INPUT_SIZE) canvas.width = INPUT_SIZE;
    if (canvas.height !== INPUT_SIZE) canvas.height = INPUT_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Draw the cropped face region, scaled to 224x224
    ctx.drawImage(
        source,
        box.x, box.y, box.width, box.height,  // source crop
        0, 0, INPUT_SIZE, INPUT_SIZE            // destination (224x224)
    );

    // Get raw pixel data (RGBA)
    const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
    const pixels = imageData.data; // Uint8ClampedArray, length = 224*224*4

    // Reuse pre-allocated buffer (NCHW format: [1, 3, 224, 224])
    for (let i = 0; i < TOTAL_PIXELS; i++) {
        const r = pixels[i * 4] / 255.0;
        const g = pixels[i * 4 + 1] / 255.0;
        const b = pixels[i * 4 + 2] / 255.0;

        // Channel-first + ImageNet normalization: (pixel - mean) / std
        _float32Buf[i]                   = (r - MEAN[0]) / STD[0];
        _float32Buf[i + TOTAL_PIXELS]    = (g - MEAN[1]) / STD[1];
        _float32Buf[i + TOTAL_PIXELS * 2] = (b - MEAN[2]) / STD[2];
    }

    return new ort.Tensor('float32', _float32Buf, _tensorDims);
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
