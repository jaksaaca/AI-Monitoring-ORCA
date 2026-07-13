/**
 * ================================================
 *  ORCA Host Monitoring — Worker Timer Module
 *  Provides a drop-in replacement for requestAnimationFrame
 *  and setInterval that uses a Web Worker to bypass
 *  browser background throttling (allows AI to run when minimized).
 * ================================================
 */

const workerCode = `
    const timers = {};
    
    self.onmessage = function(e) {
        const data = e.data;
        if (data.type === 'setTimeout') {
            timers[data.id] = setTimeout(() => {
                self.postMessage({ id: data.id });
                delete timers[data.id];
            }, data.delay);
        } else if (data.type === 'clearTimeout') {
            clearTimeout(timers[data.id]);
            delete timers[data.id];
        } else if (data.type === 'setInterval') {
            timers[data.id] = setInterval(() => {
                self.postMessage({ id: data.id });
            }, data.delay);
        } else if (data.type === 'clearInterval') {
            clearInterval(timers[data.id]);
            delete timers[data.id];
        }
    };
`;

// Create Web Worker from Blob
const blob = new Blob([workerCode], { type: 'application/javascript' });
const worker = new Worker(URL.createObjectURL(blob));

let idCounter = 0;
const callbacks = {};

worker.onmessage = function(e) {
    const id = e.data.id;
    if (callbacks[id]) {
        callbacks[id].fn();
        
        // If it was a timeout (not an interval), clean up the callback
        if (!callbacks[id].isInterval) {
            delete callbacks[id];
        }
    }
};

export function workerSetTimeout(cb, delay) {
    const id = ++idCounter;
    callbacks[id] = { fn: cb, isInterval: false };
    worker.postMessage({ type: 'setTimeout', id, delay });
    return id;
}

export function workerClearTimeout(id) {
    delete callbacks[id];
    worker.postMessage({ type: 'clearTimeout', id });
}

export function workerSetInterval(cb, delay) {
    const id = ++idCounter;
    callbacks[id] = { fn: cb, isInterval: true };
    worker.postMessage({ type: 'setInterval', id, delay });
    return id;
}

export function workerClearInterval(id) {
    delete callbacks[id];
    worker.postMessage({ type: 'clearInterval', id });
}

/**
 * requestAnimationFrame replacement running at ~30 FPS
 * Will not be paused by the browser when tab is hidden.
 */
export function workerRequestAnimationFrame(cb) {
    return workerSetTimeout(cb, 33);
}

export function workerCancelAnimationFrame(id) {
    workerClearTimeout(id);
}
