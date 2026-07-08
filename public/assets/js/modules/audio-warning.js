/**
 * ================================================
 *  ORCA Host Monitoring — Audio Warning Module
 *  Plays "Ti-Ding!" warning beep via Web Audio API
 *  when host is silent for too long.
 *  Author: Jaksa Setia Alam
 * ================================================
 */

let audioCtx = null;

/**
 * Ensures we have a valid AudioContext (created on demand).
 * Must be called after a user gesture (click/tap) the first time.
 */
function getAudioContext() {
    if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

/**
 * Play a soft "Ti-Ding!" warning sound.
 * Tone 1 (Ti) : 880 Hz, 0.1s
 * Silence     : 0.05s
 * Tone 2 (Ding): 1046.5 Hz, 0.2s
 * Both tones have smooth fade-in/fade-out to avoid click artifacts.
 */
export function playSoftWarning() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;

        // --- Tone 1: "Ti" (880 Hz, 0.1 seconds) ---
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.value = 880;
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.4, now + 0.02);       // fade in
        gain1.gain.linearRampToValueAtTime(0.4, now + 0.08);       // sustain
        gain1.gain.linearRampToValueAtTime(0, now + 0.1);          // fade out
        osc1.connect(gain1).connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.1);

        // --- Tone 2: "Ding!" (1046.5 Hz, 0.2 seconds) ---
        const startTone2 = now + 0.15; // 0.1s tone + 0.05s silence
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = 1046.5;
        gain2.gain.setValueAtTime(0, startTone2);
        gain2.gain.linearRampToValueAtTime(0.4, startTone2 + 0.02);
        gain2.gain.linearRampToValueAtTime(0.4, startTone2 + 0.16);
        gain2.gain.linearRampToValueAtTime(0, startTone2 + 0.2);
        osc2.connect(gain2).connect(ctx.destination);
        osc2.start(startTone2);
        osc2.stop(startTone2 + 0.2);

    } catch (e) {
        console.warn('[AudioWarning] Failed to play warning:', e);
    }
}
