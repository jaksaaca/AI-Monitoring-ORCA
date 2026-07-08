/**
 * ================================================
 *  ORCA Host Monitoring — Session Management
 *  Handles session lifecycle, statistics tracking,
 *  and warning beep logic (1Hz polling).
 *  Port of Python tracker_thread_func.
 *  Author: Jaksa Setia Alam
 * ================================================
 */

import { playSoftWarning } from './audio-warning.js';

let isActive = false;
let intervalId = null;
let silentSeconds = 0;
let lastWarningTime = 0;

let metadata = {};
let stats = {
    total_duration_seconds: 0,
    face_detected_seconds: 0,
    facing_camera_seconds: 0,
    head_down_seconds: 0,
    not_facing_seconds: 0,
    off_frame_seconds: 0,
    speaking_seconds: 0,
};

// External state references (set by the main app each frame)
let _faceDetected = false;
let _poseClass = 'Depan';
let _isSpeaking = false;

/**
 * Update current detection state. Called from the main render loop.
 */
export function updateState(faceDetected, poseClass, isSpeaking) {
    _faceDetected = faceDetected;
    _poseClass = poseClass;
    _isSpeaking = isSpeaking;
}

/**
 * Start a new monitoring session.
 * @param {object} meta — session metadata from the form
 */
export function startSession(meta) {
    // Store metadata
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    metadata = {
        brand: meta.brand || 'Unknown',
        studio: meta.studio || 'Unknown',
        hostName: meta.host_name || 'Unknown',
        location: meta.location || 'Unknown',
        programSchedule: `${meta.start_program || '00:00'} - ${meta.end_program || '00:00'}`,
        dateDay: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${days[now.getDay()]}`,
        lsTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`,
    };

    // Reset stats
    for (const key in stats) {
        stats[key] = 0;
    }
    silentSeconds = 0;
    lastWarningTime = 0;
    isActive = true;

    // Start 1Hz tracker (equivalent to Python tracker_thread_func)
    intervalId = setInterval(trackerTick, 1000);
}

/**
 * Stop the current session.
 * @returns {{ metadata: object, stats: object }} the completed session data
 */
export function stopSession() {
    isActive = false;
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    silentSeconds = 0;
    return { metadata: { ...metadata }, stats: { ...stats } };
}

/**
 * 1Hz tracker tick — exact port of Python tracker_thread_func logic.
 */
function trackerTick() {
    if (!isActive) return;

    stats.total_duration_seconds += 1;

    if (_faceDetected) {
        stats.face_detected_seconds += 1;
        if (_poseClass === 'Depan') {
            stats.facing_camera_seconds += 1;
        } else if (_poseClass === 'Bawah') {
            stats.head_down_seconds += 1;
        } else {
            stats.not_facing_seconds += 1;
        }
    } else {
        stats.off_frame_seconds += 1;
    }

    if (_isSpeaking) {
        stats.speaking_seconds += 1;
        silentSeconds = 0;
    } else {
        silentSeconds += 1;
    }

    // Play warning if silent for >= 20 seconds, repeat every 2 seconds
    if (silentSeconds >= 20) {
        const currTime = performance.now() / 1000;
        if (currTime - lastWarningTime >= 2.0) {
            playSoftWarning();
            lastWarningTime = currTime;
        }
    }
}

/**
 * @returns {boolean} whether a session is currently active
 */
export function isSessionActive() {
    return isActive;
}

/**
 * @returns {object} current session statistics (read-only copy)
 */
export function getStats() {
    return { ...stats };
}

/**
 * @returns {object} current session metadata (read-only copy)
 */
export function getMetadata() {
    return { ...metadata };
}
