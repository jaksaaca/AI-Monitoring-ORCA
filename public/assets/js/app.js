/**
 * ================================================
 *  ORCA Host Monitoring System — Main Application
 *  Entry point that orchestrates all modules:
 *  camera, face detection, gaze classification,
 *  VAD, session tracking, and UI updates.
 *  Author: Jaksa Setia Alam
 * ================================================
 */

import * as FaceDetector from './modules/face-detector.js';
import * as GazeClassifier from './modules/gaze-classifier.js';
import * as VAD from './modules/vad.js';
import * as Session from './modules/session.js';
import { drawOverlay } from './modules/canvas-overlay.js';
import { playSoftWarning } from './modules/audio-warning.js';
import { listenToSchedule, saveSessionLog, subscribeToStudioStatus, setStudioStatus } from './modules/firebase-db.js';

// Branch Selection
let currentBranch = sessionStorage.getItem('orca_branch');
let branchModalInstance = null;

window.selectBranch = function(branch) {
    sessionStorage.setItem('orca_branch', branch);
    currentBranch = branch;
    if (branchModalInstance) branchModalInstance.hide();
    
    // Update label on UI
    document.getElementById('system-status-text').textContent = `System Ready (${branch})`;
    
    // Trigger reload of schedule if it was already fetched
    if (scheduleDb.length > 0) {
        populateStudios();
    }
};

// ============================================
const loadingScreen  = document.getElementById('loading-screen');
const loadingBar     = document.getElementById('loading-bar');
const loadingStatus  = document.getElementById('loading-status');
const appContainer   = document.getElementById('app-container');

const videoEl        = document.getElementById('camera-video');
const canvasEl       = document.getElementById('overlay-canvas');
const canvasCtx      = canvasEl.getContext('2d');

const form           = document.getElementById('session-form');
const btnStart       = document.getElementById('btn-start');
const btnStop        = document.getElementById('btn-stop');
const btnEnableCam   = document.getElementById('btn-enable-camera');

const cameraSelect   = document.getElementById('camera-select');
const micSelect      = document.getElementById('mic-select');
const vadSlider      = document.getElementById('vad-slider');
const vadVal         = document.getElementById('vad-val');

const recOverlay     = document.getElementById('rec-overlay');
const noCameraOverlay = document.getElementById('no-camera-overlay');
const systemDot      = document.getElementById('system-dot');
const systemStatusText = document.getElementById('system-status-text');

// Stat badges
const badgeFace      = document.getElementById('badge-face');
const badgePose      = document.getElementById('badge-pose');
const badgeSpeak     = document.getElementById('badge-speak');
const fpsBadge       = document.getElementById('fps-badge');

// Stat values
const statDuration   = document.getElementById('stat-duration');
const statSpeaking   = document.getElementById('stat-speaking');
const statFacing     = document.getElementById('stat-facing');
const statHeadDown   = document.getElementById('stat-head-down');
const statNotFacing  = document.getElementById('stat-not-facing');
const statOffFrame   = document.getElementById('stat-off-frame');

// ============================================
// APPLICATION STATE
// ============================================
let currentStream    = null;
let isSessionActive  = false;
let currentPoseClass = 'Depan';
let currentFaceDetected = false;

// Frame skipping — process AI every N frames for performance
const AI_FRAME_SKIP  = 5; // default balanced
const currentVideoWidth = 1280;
const currentVideoHeight = 720;
let frameCount       = 0;
let lastFaces        = [];

// FPS tracking
let fpsFrameCount    = 0;
let fpsLastTime      = performance.now();
let currentFps       = 0;

// ============================================
// INITIALIZATION
// ============================================
async function initialize() {
    try {
        if (!currentBranch) {
            branchModalInstance = new bootstrap.Modal(document.getElementById('branchModal'));
            branchModalInstance.show();
        } else {
            document.getElementById('system-status-text').textContent = `System Ready (${currentBranch})`;
        }

        setLoadingProgress(5, 'Initializing ONNX Runtime...');

        // Step 1: Initialize ONNX Runtime (Gaze Classifier)
        setLoadingProgress(15, 'Loading gaze classification model...');
        await GazeClassifier.init('assets/models/gaze_model.onnx', (msg) => {
            setLoadingProgress(35, msg);
        });

        // Step 2: Initialize MediaPipe Face Detector
        setLoadingProgress(45, 'Loading face detection model...');
        await FaceDetector.init((msg) => {
            setLoadingProgress(65, msg);
        });

        // Step 3: Request camera access
        setLoadingProgress(75, 'Requesting camera access...');
        await startCamera();

        // Step 4: Start VAD
        setLoadingProgress(85, 'Starting voice activity detection...');
        await VAD.start();

        // Step 5: Enumerate devices
        setLoadingProgress(90, 'Scanning devices...');
        await populateDevices();

        // Step 6: Ready
        setLoadingProgress(100, 'System ready!');
        
        // Listen to schedule from Firebase Cloud
        listenToSchedule((data) => {
            scheduleDb = data;
            if (currentBranch) {
                populateStudios();
                
                // Also listen to studio statuses for anti-overlap
                if (unsubscribeStudioStatus) unsubscribeStudioStatus();
                unsubscribeStudioStatus = subscribeToStudioStatus(currentBranch, (statuses) => {
                    currentStudioStatuses = statuses;
                    updateStudioDropdown();
                });
            }
        });

        // Wait a moment then show app
        await sleep(500);
        loadingScreen.classList.add('fade-out');
        appContainer.classList.remove('d-none');
        appContainer.classList.add('d-flex');

        systemStatusText.textContent = 'System Ready';
        systemDot.classList.remove('recording');

        // Start render loop
        requestAnimationFrame(renderLoop);

    } catch (err) {
        console.error('[INIT] Fatal error:', err);
        setLoadingProgress(100, `Error: ${err.message}. Refresh to retry.`);
    }
}

function setLoadingProgress(pct, msg) {
    if (loadingBar) loadingBar.style.width = `${pct}%`;
    if (loadingStatus) loadingStatus.textContent = msg;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ============================================
// CAMERA MANAGEMENT
// ============================================
async function startCamera(deviceId = null) {
    // Stop existing stream
    if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
    }

    const constraints = {
        video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 640 } }
            : { facingMode: 'user', width: { ideal: 640 } },
        audio: false
    };

    try {
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoEl.srcObject = currentStream;
        await videoEl.play();
        noCameraOverlay.classList.add('d-none');

        // Match canvas size to video
        videoEl.addEventListener('loadedmetadata', resizeCanvas);
        resizeCanvas();

    } catch (e) {
        console.warn('[Camera] Failed:', e);
        noCameraOverlay.classList.remove('d-none');
    }
}

function resizeCanvas() {
    canvasEl.width = videoEl.videoWidth || currentVideoWidth;
    canvasEl.height = videoEl.videoHeight || currentVideoHeight;
}

async function populateDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();

        // Cameras
        cameraSelect.innerHTML = '';
        const cameras = devices.filter(d => d.kind === 'videoinput');
        cameras.forEach((cam, idx) => {
            const opt = document.createElement('option');
            opt.value = cam.deviceId;
            opt.textContent = cam.label || `Camera ${idx + 1}`;
            // Mark current camera as selected
            if (currentStream) {
                const activeTrack = currentStream.getVideoTracks()[0];
                if (activeTrack && activeTrack.getSettings().deviceId === cam.deviceId) {
                    opt.selected = true;
                }
            }
            cameraSelect.appendChild(opt);
        });

        // Microphones
        micSelect.innerHTML = '<option value="default">Default System Mic</option>';
        const mics = devices.filter(d => d.kind === 'audioinput');
        mics.forEach((mic, idx) => {
            const opt = document.createElement('option');
            opt.value = mic.deviceId;
            opt.textContent = mic.label || `Microphone ${idx + 1}`;
            micSelect.appendChild(opt);
        });

    } catch (e) {
        console.warn('[Devices] Failed to enumerate:', e);
    }
}

// ============================================
// MAIN RENDER LOOP
// ============================================
function renderLoop(timestamp) {
    requestAnimationFrame(renderLoop);

    // Don't process if video isn't playing
    if (videoEl.readyState < 2) return;

    // Ensure canvas exactly matches video dimensions to prevent misalignment
    if (videoEl.videoWidth > 0 && (canvasEl.width !== videoEl.videoWidth || canvasEl.height !== videoEl.videoHeight)) {
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
    }

    frameCount++;

    // FPS calculation
    fpsFrameCount++;
    const elapsed = timestamp - fpsLastTime;
    if (elapsed >= 1000) {
        currentFps = Math.round((fpsFrameCount * 1000) / elapsed);
        fpsFrameCount = 0;
        fpsLastTime = timestamp;
        fpsBadge.textContent = `${currentFps} FPS`;
    }

    // AI processing (every N frames for performance)
    if (frameCount % AI_FRAME_SKIP === 0) {
        processAI(timestamp);
    }

    // Always draw overlay (smooth visual updates)
    const face = lastFaces.length > 0 ? lastFaces[0] : null;

    resizeCanvas();
    drawOverlay(canvasCtx, {
        videoWidth: videoEl.videoWidth,
        videoHeight: videoEl.videoHeight,
        canvasWidth: canvasEl.width,
        canvasHeight: canvasEl.height,
        face: face,
        poseClass: currentPoseClass,
        isSpeaking: VAD.isSpeaking(),
        isRecording: isSessionActive,
    });

    // Update session state
    Session.updateState(currentFaceDetected, currentPoseClass, VAD.isSpeaking());

    // Update UI badges
    updateBadges();
}

async function processAI(timestamp) {
    // Step 1: Face Detection
    const faces = FaceDetector.detect(videoEl, timestamp);
    lastFaces = faces;
    currentFaceDetected = faces.length > 0;

    // Step 2: Gaze Classification (only if face found)
    if (currentFaceDetected && GazeClassifier.isReady()) {
        const result = await GazeClassifier.classify(videoEl, faces[0]);
        currentPoseClass = result.class;
    } else if (!currentFaceDetected) {
        currentPoseClass = 'Depan'; // Reset when no face
    }
}

// ============================================
// UI UPDATE FUNCTIONS
// ============================================
function updateBadges() {
    // Face badge
    if (currentFaceDetected) {
        badgeFace.innerHTML = '<span class="dot-ready bg-white"></span> Face';
        badgeFace.className = 'badge bg-success d-flex align-items-center gap-2 border border-light-subtle opacity-75';
    } else {
        badgeFace.innerHTML = '<span class="dot-ready bg-white"></span> Face';
        badgeFace.className = 'badge bg-danger d-flex align-items-center gap-2 border border-light-subtle opacity-75';
    }

    // Pose badge
    badgePose.innerHTML = `<span class="dot-ready bg-white"></span> Pose: ${currentPoseClass}`;
    badgePose.className = currentFaceDetected 
        ? 'badge bg-success d-flex align-items-center gap-2 border border-light-subtle opacity-75' 
        : 'badge bg-white d-flex align-items-center gap-2 border border-light-subtle opacity-75';

    // Speech badge
    if (VAD.isSpeaking()) {
        badgeSpeak.innerHTML = '<span class="dot-ready bg-white"></span> Voice';
        badgeSpeak.className = 'badge bg-success d-flex align-items-center gap-2 border border-light-subtle opacity-75';
    } else {
        badgeSpeak.innerHTML = '<span class="dot-ready bg-white"></span> Voice';
        badgeSpeak.className = 'badge bg-white d-flex align-items-center gap-2 border border-light-subtle opacity-75';
    }

    // Session stats (update every loop frame for smooth display)
    if (isSessionActive) {
        const stats = Session.getStats();
        statDuration.textContent = formatDuration(stats.total_duration_seconds);
        statSpeaking.textContent = formatDuration(stats.speaking_seconds);
        statFacing.textContent = formatDuration(stats.facing_camera_seconds);
        statHeadDown.textContent = formatDuration(stats.head_down_seconds);
        statNotFacing.textContent = formatDuration(stats.not_facing_seconds);
        statOffFrame.textContent = formatDuration(stats.off_frame_seconds);
    }
}

function formatDuration(totalSeconds) {
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}m ${s}s`;
}

// ============================================
// SCHEDULE MANAGEMENT
// ============================================
let activeSchedule = null;
let scheduleDb = [];

let currentStudioStatuses = {};
let unsubscribeStudioStatus = null;

const studioSelect = document.getElementById('studio');
const infoHost = document.getElementById('info-host');
const infoBrand = document.getElementById('info-brand');
const infoDate = document.getElementById('info-date');
const infoTime = document.getElementById('info-time');

function populateStudios() {
    // Filter schedule by selected branch
    const branchSchedule = scheduleDb.filter(s => s.branch === currentBranch);
    
    // Get unique studios from filtered schedule
    const studios = [...new Set(branchSchedule.map(s => s.studio).filter(Boolean))];
    
    if (studios.length > 0) {
        studioSelect.innerHTML = '<option value="" disabled selected>Choose Studio...</option>';
        studios.sort().forEach(studio => {
            const opt = document.createElement('option');
            opt.value = studio;
            opt.textContent = studio;
            studioSelect.appendChild(opt);
        });
        updateStudioDropdown();
    } else {
        studioSelect.innerHTML = '<option value="" disabled selected>No Schedule Uploaded for ' + currentBranch + '</option>';
        infoHost.textContent = "-";
        infoBrand.textContent = "-";
        infoDate.textContent = "-";
        infoTime.textContent = "-";
        activeSchedule = null;
    }
    
    if (studioSelect.value) {
        studioSelect.dispatchEvent(new Event('change'));
    }
}

// Update UI when Studio changes
studioSelect.addEventListener('change', () => {
    const studio = studioSelect.value;
    
    // Filter schedules for this studio AND current branch
    const studioSchedules = scheduleDb.filter(s => 
        s.studio.toLowerCase() === studio.toLowerCase() && 
        s.branch === currentBranch
    );
    
    if (studioSchedules.length === 0) {
        infoHost.textContent = "No Schedule Found";
        infoBrand.textContent = "-";
        infoDate.textContent = "-";
        infoTime.textContent = "-";
        activeSchedule = null;
        return;
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // Filter schedules for TODAY
    const todaySchedules = studioSchedules.filter(s => {
        // If date is provided, it must match today's date
        // If date is empty, we assume it's a generic daily template
        return !s.date || s.date === todayStr;
    });

    if (todaySchedules.length === 0) {
        infoHost.textContent = "No Schedule for Today";
        infoBrand.textContent = "-";
        infoDate.textContent = todayStr;
        infoTime.textContent = "-";
        activeSchedule = null;
        return;
    }

    // Sort by start time
    todaySchedules.sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    // Logic: Find current active schedule, or next upcoming schedule
    // Add a 5-minute (300,000 ms) look-ahead buffer so operators can prepare for the next session
    const currentMs = (now.getHours() * 3600000) + (now.getMinutes() * 60000) + (5 * 60000);
    
    let matched = null;
    
    for (const sched of todaySchedules) {
        // Parse "HH:MM"
        const startParts = sched.startTime.split(':');
        const endParts = sched.endTime.split(':');
        const startMs = (parseInt(startParts[0]) * 3600000) + (parseInt(startParts[1]) * 60000);
        const endMs = (parseInt(endParts[0]) * 3600000) + (parseInt(endParts[1]) * 60000);
        
        // If effective current time is before the end of this schedule, pick this one
        if (currentMs < endMs) {
            matched = sched;
            break;
        }
    }
    
    // If all schedules have passed, pick the last one of the day
    if (!matched) {
        matched = todaySchedules[todaySchedules.length - 1];
    }
    
    activeSchedule = matched;
    infoHost.textContent = matched.hostName;
    infoBrand.textContent = matched.brand;
    infoDate.textContent = matched.date || "-";
    infoTime.textContent = `${matched.startTime} - ${matched.endTime}`;
});


// ============================================
// EVENT LISTENERS
// ============================================

// Start Session
btnStart.addEventListener('click', async () => {
    if (!studioSelect.value) {
        alert("Please select a Studio first.");
        return;
    }
    if (!activeSchedule) {
        alert("No valid schedule found for this studio. Please check Master Control.");
        return;
    }

    const studioName = activeSchedule.studio;
    const statusData = currentStudioStatuses[studioName];
    if (statusData && statusData.status === 'active') {
        alert(`ACCESS DENIED: Studio [${studioName}] is currently IN USE by another operator!`);
        return;
    }

    const meta = {
        brand: activeSchedule.brand,
        studio: activeSchedule.studio,
        host_name: activeSchedule.hostName,
        location: activeSchedule.location,
        start_program: activeSchedule.startTime,
        end_program: activeSchedule.endTime,
    };

    // Claim Studio
    await setStudioStatus(currentBranch, studioName, {
        status: 'active',
        org: activeSchedule.organization || '',
        brand: activeSchedule.brand || '',
        host: activeSchedule.hostName || '',
        operator: sessionStorage.getItem('orca_user') || 'Unknown'
    });

    Session.startSession(meta);
    isSessionActive = true;

    // Lock form
    btnStart.disabled = true;
    btnStop.disabled = false;
    studioSelect.disabled = true;

    // UI
    recOverlay.classList.remove('d-none');
    systemDot.classList.add('recording');
    systemStatusText.textContent = 'Recording...';
});

// Stop Session
btnStop.addEventListener('click', async () => {
    if (!isSessionActive) return;

    const { metadata, stats } = Session.stopSession();
    isSessionActive = false;
    
    // Save to Firebase Cloud
    const logData = {
        branch: currentBranch,
        organization: activeSchedule.organization || 'Unknown',
        dateDay: activeSchedule.date || new Date().toLocaleDateString('en-GB'),
        lsTime: `${activeSchedule.startTime} - ${activeSchedule.endTime}`,
        host_name: activeSchedule.hostName,
        brand: activeSchedule.brand,
        platform: activeSchedule.platform || '-',
        studio_id: activeSchedule.studio,
        location: activeSchedule.location,
        program_schedule: activeSchedule.startTime,
        total_duration_seconds: stats.total_duration_seconds,
        face_detected_seconds: stats.face_detected_seconds,
        face_detected_pct: Math.round((stats.face_detected_seconds / Math.max(1, stats.total_duration_seconds)) * 100),
        facing_camera_seconds: stats.facing_camera_seconds,
        facing_camera_pct: Math.round((stats.facing_camera_seconds / Math.max(1, stats.total_duration_seconds)) * 100),
        head_down_seconds: stats.head_down_seconds,
        head_down_pct: Math.round((stats.head_down_seconds / Math.max(1, stats.total_duration_seconds)) * 100),
        not_facing_seconds: stats.not_facing_seconds,
        not_facing_pct: Math.round((stats.not_facing_seconds / Math.max(1, stats.total_duration_seconds)) * 100),
        off_frame_seconds: stats.off_frame_seconds,
        off_frame_pct: Math.round((stats.off_frame_seconds / Math.max(1, stats.total_duration_seconds)) * 100),
        speaking_seconds: stats.speaking_seconds,
        speaking_pct: Math.round((stats.speaking_seconds / Math.max(1, stats.total_duration_seconds)) * 100)
    };

    try {
        await saveSessionLog(logData);
    } catch (e) {
        alert("Warning: Could not save session log to cloud.\nError: " + e.message);
    }

    // Release Studio
    await setStudioStatus(currentBranch, activeSchedule.studio, {
        status: 'idle',
        org: '',
        brand: '',
        host: '',
        operator: ''
    });

    // Unlock form
    btnStart.disabled = false;
    btnStop.disabled = true;
    studioSelect.disabled = false;

    // UI
    recOverlay.classList.add('d-none');
    systemDot.classList.remove('recording');
    systemStatusText.textContent = 'System Ready';

    // Reset stat display
    statDuration.textContent = '0s';
    statSpeaking.textContent = '0s';
    statFacing.textContent = '0s';
    statHeadDown.textContent = '0s';
    statNotFacing.textContent = '0s';
    statOffFrame.textContent = '0s';

    alert('Sesi selesai! Data telah ditambahkan ke Log Cloud.');
});

// Camera switch
cameraSelect.addEventListener('change', async () => {
    await startCamera(cameraSelect.value);
});

// Mic switch
micSelect.addEventListener('change', async () => {
    const deviceId = micSelect.value === 'default' ? null : micSelect.value;
    await VAD.switchDevice(deviceId);
});

// VAD threshold slider
vadSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    vadVal.textContent = val.toFixed(3);
    VAD.setThreshold(val);
});

// Enable camera button (for initial permission)
btnEnableCam.addEventListener('click', async () => {
    await startCamera();
});

// Prevent accidental close during active session
window.addEventListener('beforeunload', (e) => {
    if (isSessionActive) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Auto-save on force close
window.addEventListener('unload', () => {
    if (isSessionActive) {
        const { metadata, stats } = Session.stopSession();
        // Release studio
        setStudioStatus(currentBranch, activeSchedule.studio, { status: 'idle' });
        CSVExport.appendToMasterLog(metadata, stats);
    }
});

// Update Studio Dropdown Disabled States
function updateStudioDropdown() {
    if (isSessionActive) return; // Don't mess with it while active
    
    Array.from(studioSelect.options).forEach(opt => {
        if (!opt.value) return; // skip placeholder
        const statusData = currentStudioStatuses[opt.value];
        if (statusData && statusData.status === 'active') {
            opt.disabled = true;
            opt.textContent = `${opt.value} (IN USE)`;
        } else {
            opt.disabled = false;
            opt.textContent = opt.value;
        }
    });
}

// ============================================
// START THE APPLICATION
// ============================================
initialize();
