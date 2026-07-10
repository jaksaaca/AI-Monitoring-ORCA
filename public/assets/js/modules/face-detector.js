/**
 * ================================================
 *  ORCA Host Monitoring — Face Detector Module
 *  Wrapper for MediaPipe Tasks Vision FaceDetector.
 *  Runs face detection in the browser using WASM.
 *  Author: Jaksa Setia Alam
 * ================================================
 */

let faceDetector = null;
let _isReady = false;

// MediaPipe Tasks Vision CDN paths
const VISION_WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE_MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

/**
 * Initialize the MediaPipe FaceDetector.
 * @param {function} onProgress — callback for loading status updates
 * @returns {Promise<void>}
 */
export async function init(onProgress) {
    if (_isReady) return;

    onProgress?.('Loading face detection model...');

    // Dynamically import MediaPipe Tasks Vision
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');

    const { FaceDetector, FilesetResolver } = vision;

    onProgress?.('Initializing face detection WASM runtime...');
    const filesetResolver = await FilesetResolver.forVisionTasks(VISION_WASM_CDN);

    onProgress?.('Creating face detector...');
    faceDetector = await FaceDetector.createFromOptions(filesetResolver, {
        baseOptions: {
            modelAssetPath: FACE_MODEL_CDN,
            delegate: 'GPU'  // Use WebGL for better performance
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.2,
    });

    _isReady = true;
    onProgress?.('Face detection ready.');
}

/**
 * Detect faces in a video frame.
 * @param {HTMLVideoElement} videoElement — the camera video element
 * @param {number} timestamp — current timestamp in ms (e.g. performance.now())
 * @returns {Array<{x: number, y: number, width: number, height: number, confidence: number}>}
 *          Array of face bounding boxes in video pixel coordinates.
 */
export function detect(videoElement, timestamp) {
    if (!_isReady || !faceDetector) return [];

    try {
        const result = faceDetector.detectForVideo(videoElement, timestamp);
        if (!result || !result.detections || result.detections.length === 0) {
            return [];
        }

        const vw = videoElement.videoWidth;
        const vh = videoElement.videoHeight;

        return result.detections.map(det => {
            const bbox = det.boundingBox;
            // Add margin (20% on each side, matching Python version)
            const marginX = bbox.width * 0.2;
            const marginY = bbox.height * 0.2;

            const x = Math.max(0, bbox.originX - marginX);
            const y = Math.max(0, bbox.originY - marginY);
            const w = Math.min(vw - x, bbox.width + marginX * 2);
            const h = Math.min(vh - y, bbox.height + marginY * 2);

            return {
                x: Math.round(x),
                y: Math.round(y),
                width: Math.round(w),
                height: Math.round(h),
                confidence: det.categories?.[0]?.score || 0
            };
        });
    } catch (e) {
        console.warn('[FaceDetector] Detection error:', e);
        return [];
    }
}

/**
 * @returns {boolean} whether the face detector is initialized
 */
export function isReady() {
    return _isReady;
}
