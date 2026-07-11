/**
 * ================================================
 *  ORCA Host Monitoring — Face Detector Module
 *  (UPGRADED: FaceLandmarker Lite Version)
 *  Author: Jaksa Setia Alam
 * ================================================
 */

let faceLandmarker = null;
let _isReady = false;

// MediaPipe Tasks Vision CDN paths
const VISION_WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE_MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/**
 * Initialize the MediaPipe FaceLandmarker.
 * @param {function} onProgress — callback for loading status updates
 * @returns {Promise<void>}
 */
export async function init(onProgress) {
    if (_isReady) return;

    onProgress?.('Loading Face Landmarker model...');

    // Dynamically import MediaPipe Tasks Vision
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
    const { FaceLandmarker, FilesetResolver } = vision;

    onProgress?.('Initializing WASM runtime...');
    const filesetResolver = await FilesetResolver.forVisionTasks(VISION_WASM_CDN);

    onProgress?.('Creating Face Landmarker (Lite)...');
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
            modelAssetPath: FACE_MODEL_CDN,
            delegate: 'GPU'  // Use WebGL for better performance
        },
        runningMode: 'VIDEO',
        numFaces: 1, // LITE OPTIMIZATION 1: Only track 1 face, ignore others
        minFaceDetectionConfidence: 0.2, // High sensitivity for long range
        minFacePresenceConfidence: 0.2,
        minTrackingConfidence: 0.2,
        outputFaceBlendshapes: false, // LITE OPTIMIZATION: Disable heavy 3D blendshapes
        outputFacialTransformationMatrixes: false // Disable heavy matrices
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
    if (!_isReady || !faceLandmarker) return [];

    try {
        const result = faceLandmarker.detectForVideo(videoElement, timestamp);
        if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
            return [];
        }

        const vw = videoElement.videoWidth;
        const vh = videoElement.videoHeight;

        // LITE OPTIMIZATION 3: Convert 478 3D points back to a simple 2D Bounding Box
        return result.faceLandmarks.map(landmarks => {
            let minX = 1, maxX = 0, minY = 1, maxY = 0;
            
            // Find boundaries
            for (let i = 0; i < landmarks.length; i++) {
                if (landmarks[i].x < minX) minX = landmarks[i].x;
                if (landmarks[i].x > maxX) maxX = landmarks[i].x;
                if (landmarks[i].y < minY) minY = landmarks[i].y;
                if (landmarks[i].y > maxY) maxY = landmarks[i].y;
            }

            // Convert normalized coordinates [0.0 - 1.0] to pixels
            const originX = minX * vw;
            const originY = minY * vh;
            const rawWidth = (maxX - minX) * vw;
            const rawHeight = (maxY - minY) * vh;

            // Add margin (20% on each side) to match old FaceDetector behavior
            const marginX = rawWidth * 0.2;
            const marginY = rawHeight * 0.2;

            const x = Math.max(0, originX - marginX);
            const y = Math.max(0, originY - marginY);
            const w = Math.min(vw - x, rawWidth + marginX * 2);
            const h = Math.min(vh - y, rawHeight + marginY * 2);

            // --- Compute real head pose from key landmarks ---
            // Uses geometric estimation (zero extra cost, landmarks already computed)
            const nose = landmarks[1];            // Nose tip
            const leftEyeInner = landmarks[33];   // Left eye inner corner
            const rightEyeInner = landmarks[263]; // Right eye inner corner
            const leftMouth = landmarks[61];      // Left mouth corner
            const rightMouth = landmarks[291];    // Right mouth corner

            const eyeMidX = (leftEyeInner.x + rightEyeInner.x) / 2;
            const eyeMidY = (leftEyeInner.y + rightEyeInner.y) / 2;
            const mouthMidX = (leftMouth.x + rightMouth.x) / 2;
            const mouthMidY = (leftMouth.y + rightMouth.y) / 2;
            const faceCenterX = (eyeMidX + mouthMidX) / 2;
            const faceCenterY = (eyeMidY + mouthMidY) / 2;

            // Inter-ocular distance for angle normalization
            const eyeDist = Math.hypot(
                rightEyeInner.x - leftEyeInner.x,
                rightEyeInner.y - leftEyeInner.y
            );

            // Yaw (horizontal rotation): nose offset from face center
            const yaw = Math.atan2(nose.x - faceCenterX, eyeDist * 0.5) * (180 / Math.PI);
            // Pitch (vertical rotation): nose position relative to face midline
            const pitch = Math.atan2(faceCenterY - nose.y, eyeDist * 0.5) * (180 / Math.PI);
            // Roll (head tilt): angle of the inter-ocular line
            const roll = Math.atan2(
                rightEyeInner.y - leftEyeInner.y,
                rightEyeInner.x - leftEyeInner.x
            ) * (180 / Math.PI);

            return {
                x: Math.round(x),
                y: Math.round(y),
                width: Math.round(w),
                height: Math.round(h),
                confidence: 1,
                yaw: Math.round(yaw * 10) / 10,   // 1 decimal precision
                pitch: Math.round(pitch * 10) / 10,
                roll: Math.round(roll * 10) / 10,
            };
        });
    } catch (e) {
        console.warn('[FaceLandmarker] Detection error:', e);
        return [];
    }
}

/**
 * @returns {boolean} whether the face detector is initialized
 */
export function isReady() {
    return _isReady;
}
