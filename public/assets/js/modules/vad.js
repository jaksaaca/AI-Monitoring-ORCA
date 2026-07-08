/**
 * ================================================
 *  ORCA Host Monitoring — Voice Activity Detection
 *  Uses Web Audio API AnalyserNode to compute RMS
 *  and determine if the host is speaking.
 *  Author: Jaksa Setia Alam
 * ================================================
 */

let audioCtx = null;
let analyser = null;
let sourceNode = null;
let mediaStream = null;
let timeDomainBuf = null;
let _isSpeaking = false;
let _threshold = 0.02;
let _currentRms = 0;
let _rafId = null;

/**
 * Start VAD from a given media stream (or request one).
 * @param {string|null} deviceId — specific microphone device ID, or null for default
 */
export async function start(deviceId = null) {
    if (analyser) return; // already running

    try {
        const constraints = {
            audio: deviceId ? { deviceId: { exact: deviceId } } : true,
            video: false
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        sourceNode = audioCtx.createMediaStreamSource(mediaStream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        sourceNode.connect(analyser);

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
            _isSpeaking = _currentRms > _threshold;
            _rafId = requestAnimationFrame(pollRms);
        };
        _rafId = requestAnimationFrame(pollRms);

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
        cancelAnimationFrame(_rafId);
        _rafId = null;
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
