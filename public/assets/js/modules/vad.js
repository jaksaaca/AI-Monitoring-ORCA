/**
 * ================================================
 *  ORCA Host Monitoring — Voice Activity Detection
 *  Uses Web Audio API AnalyserNode to compute RMS
 *  and determine if the host is speaking.
 *  Author: Jaksa Setia Alam
 * ================================================
 */
import { workerRequestAnimationFrame, workerCancelAnimationFrame } from './worker-timer.js';

let audioCtx = null;
let analyser = null;
let sourceNode = null;
let mediaStream = null;
let timeDomainBuf = null;
let _isSpeaking = false;
let _threshold = 0.02;
let _currentRms = 0;
let _rafId = null;
let _holdTimer = null;
const HOLD_TIME_MS = 1000;

// Adaptive noise floor estimation
let _noiseFloor = 0.005;
const NOISE_ALPHA = 0.997;      // Slow-moving average (converges over ~5 seconds)
const SPEECH_RATIO = 3.0;       // Speech must be 3x louder than noise floor
const MIN_THRESHOLD = 0.005;    // Absolute minimum to avoid triggering on silence

/**
 * Start VAD from a given media stream (or request one).
 * @param {string|null} deviceId — specific microphone device ID, or null for default
 */
export async function start(deviceId = null) {
    if (analyser) return; // already running

    try {
        const constraints = {
            audio: deviceId ? { 
                deviceId: { exact: deviceId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } : {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        sourceNode = audioCtx.createMediaStreamSource(mediaStream);
        
        // Filter 1: Highpass (memotong dengung listrik/bass lagu di bawah 300Hz)
        const highpass = audioCtx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 300;
        
        // Filter 2: Lowpass (memotong noise statis/desis di atas 3000Hz)
        const lowpass = audioCtx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 3000;

        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512; // 512 is sufficient for RMS (was 2048 — overkill)
        
        // Route: Source -> Highpass -> Lowpass -> Analyser
        sourceNode.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(analyser);

        timeDomainBuf = new Float32Array(analyser.fftSize);

        // Use RAF-based polling for smooth updates
        const pollRms = () => {
            if (!analyser) return;
            analyser.getFloatTimeDomainData(timeDomainBuf);
            let sum = 0;
            for (let i = 0; i < timeDomainBuf.length; i++) {
                sum += timeDomainBuf[i] * timeDomainBuf[i];
            }
            _currentRms = Math.sqrt(sum / timeDomainBuf.length);

            // Adaptive noise floor: when NOT speaking, slowly track ambient level
            const effectiveThreshold = Math.max(_noiseFloor * SPEECH_RATIO, _threshold, MIN_THRESHOLD);
            if (_currentRms < effectiveThreshold) {
                // Update noise floor estimate (slow-moving average)
                _noiseFloor = NOISE_ALPHA * _noiseFloor + (1 - NOISE_ALPHA) * _currentRms;
            }
            
            // Hold-Time Hysteresis with adaptive threshold
            if (_currentRms > effectiveThreshold) {
                _isSpeaking = true;
                if (_holdTimer) {
                    clearTimeout(_holdTimer);
                    _holdTimer = null;
                }
            } else {
                if (_isSpeaking && !_holdTimer) {
                    _holdTimer = setTimeout(() => {
                        _isSpeaking = false;
                        _holdTimer = null;
                    }, HOLD_TIME_MS);
                }
            }

            _rafId = workerRequestAnimationFrame(pollRms);
        };
        _rafId = workerRequestAnimationFrame(pollRms);

        console.log('[VAD] Started successfully.');
    } catch (e) {
        console.warn('[VAD] Failed to access microphone:', e);
    }
}

/**
 * Stop VAD and release microphone.
 */
export function stop() {
    if (_rafId) {
        workerCancelAnimationFrame(_rafId);
        _rafId = null;
    }
    if (_holdTimer) {
        clearTimeout(_holdTimer);
        _holdTimer = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    if (audioCtx) {
        audioCtx.close().catch(() => {});
        audioCtx = null;
    }
    analyser = null;
    sourceNode = null;
    _isSpeaking = false;
    _currentRms = 0;
}

/**
 * Restart VAD with a different microphone device.
 * @param {string|null} deviceId
 */
export async function switchDevice(deviceId) {
    stop();
    await start(deviceId);
}

/**
 * @returns {boolean} whether the host is currently speaking
 */
export function isSpeaking() {
    return _isSpeaking;
}

/**
 * @returns {number} current RMS level (0.0 - 1.0)
 */
export function getRms() {
    return _currentRms;
}

/**
 * Set the VAD threshold.
 * @param {number} val — RMS threshold (e.g. 0.02)
 */
export function setThreshold(val) {
    _threshold = parseFloat(val);
}

/**
 * @returns {number} current threshold value
 */
export function getThreshold() {
    return _threshold;
}
