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
import { workerRequestAnimationFrame, workerCancelAnimationFrame, workerSetInterval, workerClearInterval } from './modules/worker-timer.js';
import { getSchedule, saveSessionLog, subscribeToStudioStatus, setStudioStatus, listenToGlobalCommands } from './modules/firebase-db.js';
import { BRANCHES } from './modules/config.js';

// ============================================
// GLOBAL ERROR HANDLER
// ============================================
window.addEventListener('error', (e) => {
    console.error('[ORCA Global Error]', e.message, e.filename, e.lineno);
});
window.addEventListener('unhandledrejection', (e) => {
    console.error('[ORCA Unhandled Promise]', e.reason);
});

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

// (session-form element removed — buttons are standalone)
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
let backupInterval = null;

// Frame skipping — process AI every N frames for performance
const AI_FRAME_SKIP = 10; // LITE OPTIMIZATION: Process 1 in every 10 frames // default balanced
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
        // Generate branch modal buttons from config
        const branchBtnContainer = document.getElementById('branch-buttons');
        if (branchBtnContainer) {
            branchBtnContainer.innerHTML = BRANCHES.map(b => `
                <button type="button" class="btn btn-outline-light btn-lg" onclick="selectBranch('${b.name}')">
                    <i data-lucide="map-pin" class="icon-sm me-2"></i> ${b.name} Studio
                </button>
            `).join('');
            if (window.lucide) {
                try { lucide.createIcons({ root: branchBtnContainer }); } catch(e) { console.warn(e); }
            }
        }

        if (!currentBranch) {
            branchModalInstance = new bootstrap.Modal(document.getElementById('branchModal'));
            branchModalInstance.show();
        } else {
            document.getElementById('system-status-text').textContent = `System Ready (${currentBranch})`;
            
            // Auto-Release Dangling Studio Status (if page was refreshed)
            const danglingStudio = sessionStorage.getItem('orca_active_studio');
            if (danglingStudio) {
                setStudioStatus(currentBranch, danglingStudio, { status: 'idle' }).catch(console.error);
                sessionStorage.removeItem('orca_active_studio');
                console.log(`[Auto-Release] Studio ${danglingStudio} released after refresh.`);
            }

            // Auto-Upload Disrupted Session (if page was refreshed/crashed during session)
            const backupSession = localStorage.getItem('orca_backup_session');
            if (backupSession) {
                try {
                    const logData = JSON.parse(backupSession);
                    saveSessionLog(logData).catch(console.error);
                    localStorage.removeItem('orca_backup_session');
                    console.log("[Auto-Save] Successfully uploaded disrupted session log.");
                } catch (e) {
                    console.error("Failed to parse backup session", e);
                }
            }
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
        
        // Load schedule once at startup (Saves thousands of reads compared to realtime)
        const refreshSchedule = async () => {
            try {
                scheduleDb = await getSchedule();
                if (currentBranch && !isSessionActive) {
                    populateStudios();
                }
            } catch (err) {
                console.warn("[Schedule] Fetch error:", err);
            }
        };
        await refreshSchedule();

        // Listen to studio statuses for anti-overlap and forced take-overs
        if (currentBranch) {
            if (unsubscribeStudioStatus) unsubscribeStudioStatus();
            unsubscribeStudioStatus = subscribeToStudioStatus(currentBranch, (statuses) => {
                currentStudioStatuses = statuses;
                updateStudioDropdown();
                
                // KICK OUT LOGIC: If someone else forces a Take Over on our active studio
                if (isSessionActive && currentSessionData) {
                    const myStudio = currentSessionData.studio;
                    const myName = sessionStorage.getItem('orca_user') || 'Unknown';
                    const currentStatus = statuses[myStudio];
                    
                    if (currentStatus && currentStatus.status === 'active' && currentStatus.operator && currentStatus.operator !== myName) {
                        console.warn(`[KICK OUT] Studio diambil alih oleh ${currentStatus.operator}`);
                        window._isAutoStop = true;
                        window._kickOutMessage = `Sesi Anda dihentikan paksa karena Studio diambil alih oleh operator lain (${currentStatus.operator}).`;
                        btnStop.click();
                    }
                }
            });
        }

        // Wait a moment then show app
        await sleep(500);
        loadingScreen.classList.add('fade-out');
        appContainer.classList.remove('d-none');
        appContainer.classList.add('d-flex');

        systemStatusText.textContent = 'System Ready';
        systemDot.classList.remove('recording');

        // Start render loop
        workerRequestAnimationFrame(renderLoop);

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

    // Request high resolution without forcing a landscape aspect ratio,
    // so portrait OBS Virtual Cameras (9:16) won't be padded with black bars internally.
    const constraints = {
        video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1920 } }
            : { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false
    };

    try {
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoEl.srcObject = currentStream;
        await videoEl.play();
        noCameraOverlay.classList.add('d-none');

        // Match canvas size to video (remove old listener to prevent leak)
        videoEl.removeEventListener('loadedmetadata', resizeCanvas);
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
    workerRequestAnimationFrame(renderLoop);

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

    // Canvas resize only when dimensions actually change (already handled by the check at line 286)
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
    updateVadMeter();
}

function updateVadMeter() {
    const meterBar = document.getElementById('vad-meter-bar');
    if (!meterBar) return;
    
    const rms = VAD.getRms();
    const threshold = VAD.getThreshold();
    
    // Scale RMS for visual bar (0.15 RMS = 100% width)
    let pct = (rms / 0.15) * 100;
    if (pct > 100) pct = 100;
    
    meterBar.style.width = pct + '%';
    
    if (rms > threshold) {
        meterBar.classList.remove('bg-secondary');
        meterBar.classList.add('bg-success');
    } else {
        meterBar.classList.remove('bg-success');
        meterBar.classList.add('bg-secondary');
    }
}

let consecutiveFaceFails = 0;
const MAX_FAILS_BEFORE_LOST = 3; // LITE OPTIMIZATION: Grace period (3 * 10 frames = 1 second) before dropping face

// Temporal smoothing for pose classification (majority vote)
const POSE_HISTORY_SIZE = 5;
const poseHistory = [];

function getSmoothedPose(rawPose) {
    poseHistory.push(rawPose);
    if (poseHistory.length > POSE_HISTORY_SIZE) poseHistory.shift();
    
    // Count occurrences of each pose in history
    const counts = {};
    for (const p of poseHistory) {
        counts[p] = (counts[p] || 0) + 1;
    }
    
    // Return the most frequent pose (majority vote)
    let maxCount = 0, winner = rawPose;
    for (const [pose, count] of Object.entries(counts)) {
        if (count > maxCount) { maxCount = count; winner = pose; }
    }
    return winner;
}

async function processAI(timestamp) {
    // Step 1: Face Detection
    const faces = FaceDetector.detect(videoEl, timestamp);
    
    // Smoothing / Hysteresis logic to prevent flickering ("copot pasang")
    if (faces.length > 0) {
        lastFaces = faces;
        currentFaceDetected = true;
        consecutiveFaceFails = 0; // Reset fail counter
    } else {
        consecutiveFaceFails++;
        if (consecutiveFaceFails >= MAX_FAILS_BEFORE_LOST) {
            currentFaceDetected = false;
            lastFaces = [];
        }
    }

    // Step 2: Gaze Classification (only if face found)
    if (currentFaceDetected && GazeClassifier.isReady() && lastFaces.length > 0) {
        const result = await GazeClassifier.classify(videoEl, lastFaces[0]);
        currentPoseClass = getSmoothedPose(result.class); // Temporal smoothing (majority vote)
    } else if (!currentFaceDetected) {
        currentPoseClass = 'Depan'; // Reset when no face
        poseHistory.length = 0;     // Clear history on face loss
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
    // Debug: log raw schedule data
    console.log('[Schedule] Raw scheduleDb count:', scheduleDb.length);
    console.log('[Schedule] Current branch:', currentBranch);
    if (scheduleDb.length > 0) {
        console.log('[Schedule] Branches in DB:', [...new Set(scheduleDb.map(s => s.branch))]);
        console.log('[Schedule] Studios in DB:', [...new Set(scheduleDb.map(s => s.studio))]);
    }

    // Filter schedule by selected branch (case-insensitive to prevent mismatch)
    const branchSchedule = scheduleDb.filter(s => 
        s.branch && s.branch.toLowerCase() === currentBranch.toLowerCase()
    );
    
    console.log('[Schedule] Filtered for branch:', branchSchedule.length, 'schedules');
    
    // Get unique studios from filtered schedule
    const studios = [...new Set(branchSchedule.map(s => s.studio).filter(Boolean))];
    console.log('[Schedule] Unique studios:', studios);
    
    if (studios.length > 0) {
        studioSelect.innerHTML = '<option value="" disabled selected>Choose Studio...</option>';
        studios.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).forEach(studio => {
            const opt = document.createElement('option');
            opt.value = studio;
            opt.textContent = studio;
            studioSelect.appendChild(opt);
        });
        updateStudioDropdown();
    } else {
        studioSelect.innerHTML = '<option value="" disabled selected>No Schedule Uploaded for ' + currentBranch + '</option>';
        studioSelect.innerHTML += '<option value="Test Studio">Test Studio (Ad-hoc Testing)</option>';
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
        if (studio === "Test Studio") {
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            activeSchedule = {
                studio: 'Test Studio',
                brand: 'Ad-hoc Testing',
                hostName: 'Test Host',
                location: currentBranch,
                startTime: '00:00',
                endTime: '23:59',
                organization: 'Local Testing',
                platform: 'Web',
                date: todayStr
            };
            infoHost.textContent = activeSchedule.hostName;
            infoBrand.textContent = activeSchedule.brand;
            infoDate.textContent = activeSchedule.date;
            infoTime.textContent = "Ad-hoc Testing";
            return;
        }

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
    
    // Logic: Find current active schedule, or next upcoming schedule (within 5 minutes)
    const currentMs = (now.getHours() * 3600000) + (now.getMinutes() * 60000);
    
    let matched = null;
    
    for (const sched of todaySchedules) {
        // Parse "HH:MM"
        const startParts = sched.startTime.split(':');
        const endParts = sched.endTime.split(':');
        const startMs = (parseInt(startParts[0]) * 3600000) + (parseInt(startParts[1]) * 60000);
        const endMs = (parseInt(endParts[0]) * 3600000) + (parseInt(endParts[1]) * 60000);
        
        // Jika sekarang >= (Jam Mulai - 5 menit) DAN sekarang <= Jam Selesai
        if (currentMs >= (startMs - 300000) && currentMs <= endMs) {
            matched = sched;
            break;
        }
    }
    
    // LITE OPTIMIZATION: Fallback untuk Testing. Jika tidak ada jadwal yang pas dengan waktu sekarang, gunakan jadwal pertama hari ini.
    if (!matched && todaySchedules.length > 0) {
        matched = todaySchedules[0];
    }
    
    if (matched) {
        activeSchedule = matched;
        infoHost.textContent = matched.hostName;
        infoBrand.textContent = matched.brand;
        infoDate.textContent = matched.date || todayStr;
        infoTime.textContent = `${matched.startTime} - ${matched.endTime}`;
    } else {
        // Kosong / Standby (Realtime)
        activeSchedule = null;
        infoHost.textContent = "Standby (No Live Schedule)";
        infoBrand.textContent = "-";
        infoDate.textContent = todayStr;
        infoTime.textContent = "-";
    }
});


// ============================================
// EVENT LISTENERS
// ============================================

// Heartbeat & Watchdog timers (keep standard setInterval since timing isn't critical, but let's use workerSetInterval to be safe)
workerSetInterval(() => {
    if (!isSessionActive && studioSelect.value) {
        studioSelect.dispatchEvent(new Event('change'));
    }

    // Schedule refresh at minute 55 of every hour
    const now = new Date();
    if (now.getMinutes() === 55) {
        getSchedule().then(data => {
            scheduleDb = data;
            if (!isSessionActive && currentBranch) populateStudios();
            console.log("[Schedule] Auto-refreshed at 55 past the hour.");
        }).catch(console.error);
    }
}, 60000);

// Protect the active schedule by cloning it at the start of the session
let currentSessionData = null;

// Start Session
btnStart.addEventListener('click', async () => {
    if (!studioSelect.value) {
        showUIError("Please select a Studio first.");
        return;
    }
    if (!activeSchedule) {
        showUIError("No valid schedule found for this studio. Please check Master Control.");
        return;
    }

    const studioName = activeSchedule.studio;
    const statusData = currentStudioStatuses[studioName];
    if (statusData && statusData.status === 'active') {
        const force = window.confirm(`WARNING: Studio [${studioName}] is currently IN USE by another operator!\n\nDo you want to FORCE TAKE OVER this studio? (Hanya gunakan jika studio tersangkut / error)`);
        if (!force) return;
    }

    currentSessionData = { ...activeSchedule }; // clone to avoid mutation if schedules refresh

    const meta = {
        brand: currentSessionData.brand,
        studio: currentSessionData.studio,
        host_name: currentSessionData.hostName,
        location: currentSessionData.location,
        start_program: currentSessionData.startTime,
        end_program: currentSessionData.endTime,
    };

    try {
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
    } catch (e) {
        console.error("Start Session Error:", e);
        showUIError("Failed to start session: " + e.message);
        return;
    }

    // Determine if Auto-Stop should be active for this session
    let autoStopEnabled = true;
    if (currentSessionData && currentSessionData.endTime) {
        const now = new Date();
        const currentMs = (now.getHours() * 3600000) + (now.getMinutes() * 60000);
        const endParts = currentSessionData.endTime.split(':');
        const endMs = (parseInt(endParts[0]) * 3600000) + (parseInt(endParts[1]) * 60000);
        
        // If they are intentionally starting a session that is ALREADY late (past schedule end time), disable auto-stop
        if (currentMs >= endMs) {
            autoStopEnabled = false;
        }
    }
    
    // Auto-Release Tracker
    sessionStorage.setItem('orca_active_studio', studioName);
    
    // Auto-Save Interval (Backup every 5 seconds, Heartbeat every 60 seconds to save quota)
    if (backupInterval) workerClearInterval(backupInterval);
    let tickCount = 0;
    backupInterval = workerSetInterval(() => {
        // Auto-Stop Check (Do this FIRST to prevent race condition with heartbeat)
        if (autoStopEnabled && currentSessionData && currentSessionData.endTime) {
            const now = new Date();
            const currentMs = (now.getHours() * 3600000) + (now.getMinutes() * 60000);
            const endParts = currentSessionData.endTime.split(':');
            const endMs = (parseInt(endParts[0]) * 3600000) + (parseInt(endParts[1]) * 60000);
            
            // Auto stop exactly when schedule ends
            if (currentMs >= endMs) {
                console.log("[Auto-Stop] Session reached schedule end time.");
                window._isAutoStop = true;
                btnStop.click();
                return; // Abort further execution so we don't send an 'active' heartbeat
            }
        }

        const stats = Session.getStats();
        const logData = {
            branch: currentBranch,
            organization: currentSessionData.organization || 'Unknown',
            dateDay: currentSessionData.date || new Date().toLocaleDateString('en-GB'),
            lsTime: `${currentSessionData.startTime} - ${currentSessionData.endTime}`,
            host_name: currentSessionData.hostName,
            brand: currentSessionData.brand,
            platform: currentSessionData.platform || '-',
            studio_id: currentSessionData.studio,
            location: currentSessionData.location,
            program_schedule: currentSessionData.startTime,
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
        localStorage.setItem('orca_backup_session', JSON.stringify(logData));
        
        // HEARTBEAT PING: Send active status to Firebase every 60 seconds (12 ticks of 5s)
        tickCount++;
        if (tickCount >= 12) {
            tickCount = 0;
            setStudioStatus(currentBranch, currentSessionData.studio, {
                status: 'active',
                org: currentSessionData.organization || '',
                brand: currentSessionData.brand || '',
                host: currentSessionData.hostName || '',
                scheduleTime: `${currentSessionData.startTime || ''} - ${currentSessionData.endTime || ''}`
            }).catch(console.error);
        }
    }, 5000);

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
        organization: currentSessionData.organization || 'Unknown',
        dateDay: currentSessionData.date || new Date().toLocaleDateString('en-GB'),
        lsTime: `${currentSessionData.startTime} - ${currentSessionData.endTime}`,
        host_name: currentSessionData.hostName,
        brand: currentSessionData.brand,
        platform: currentSessionData.platform || '-',
        studio_id: currentSessionData.studio,
        location: currentSessionData.location,
        program_schedule: currentSessionData.startTime,
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
        // Clear backups only if saved successfully
        localStorage.removeItem('orca_backup_session');
    } catch (e) {
        console.error("Stop Session Save Error:", e);
        showUIError("Warning: Could not save session log to cloud.\nError: " + e.message + "\n\nData has been saved locally.");
    }
    
    // Always stop the interval and clear active studio state so UI can reset
    if (backupInterval) workerClearInterval(backupInterval);
    sessionStorage.removeItem('orca_active_studio');

    try {
        // Release Studio
        await setStudioStatus(currentBranch, currentSessionData.studio, {
            status: 'idle',
            org: '',
            brand: '',
            host: '',
            operator: ''
        });
    } catch (e) {
        console.error("Stop Session Release Error:", e);
        // Don't alert here, it's just a status update
    }

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

    let msg = 'Sesi ditutup secara manual oleh operator. Data telah aman disimpan ke Cloud.';
    if (window._isAutoStop) {
        msg = window._kickOutMessage || 'Sesi ini dihentikan OTOMATIS karena jadwal program telah habis. Data telah diamankan.';
        window._isAutoStop = false; // reset
        window._kickOutMessage = null; // reset
    }
    
    document.getElementById('endSessionMessage').textContent = msg;
    const endModal = new bootstrap.Modal(document.getElementById('endSessionModal'));
    endModal.show();
    try { lucide.createIcons(); } catch(e) { console.warn(e); }
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
// Load saved VAD value or default to 0.02
const savedVad = localStorage.getItem('orca_vad_threshold');
if (savedVad) {
    vadSlider.value = savedVad;
    vadVal.textContent = parseFloat(savedVad).toFixed(3);
    VAD.setThreshold(savedVad);
}

vadSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    vadVal.textContent = val.toFixed(3);
    VAD.setThreshold(val);
    localStorage.setItem('orca_vad_threshold', val);
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
    if (isSessionActive && currentSessionData) {
        Session.stopSession();
        // Release studio — fire-and-forget (unload gives no time for async)
        setStudioStatus(currentBranch, currentSessionData.studio, { status: 'idle' });
    }
});

// UI Helper to avoid browser blocking alerts
function showUIError(msg) {
    const existing = document.getElementById('custom-ui-error');
    if (existing) existing.remove();
    const alertDiv = document.createElement('div');
    alertDiv.id = 'custom-ui-error';
    alertDiv.className = 'alert alert-danger alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-4 shadow';
    alertDiv.style.zIndex = '9999';
    alertDiv.innerHTML = `
        <strong>Perhatian:</strong> ${msg}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.body.appendChild(alertDiv);
    setTimeout(() => { if (alertDiv.parentElement) alertDiv.remove(); }, 5000);
}

// Update Studio Dropdown Disabled States
function updateStudioDropdown() {
    if (isSessionActive) return; // Don't mess with it while active
    
    Array.from(studioSelect.options).forEach(opt => {
        if (!opt.value) return; // skip placeholder
        const statusData = currentStudioStatuses[opt.value];
        let isActive = statusData && statusData.status === 'active';
        
        // Heartbeat timeout: if no heartbeat in the last 75 seconds, treat as idle (ghost session)
        if (isActive && statusData.updatedAt) {
            const now = new Date().getTime();
            if (now - statusData.updatedAt > 75000) {
                isActive = false;
                // Auto-cleanup ghost status in Firebase
                setStudioStatus(currentBranch, opt.value, { status: 'idle', operator: '' }).catch(console.error);
                console.log(`[Ghost Cleanup] Studio ${opt.value} auto-released (no heartbeat for >75s)`);
            }
        }
        
        if (isActive) {
            opt.disabled = false; // Allow selection for force takeover
            opt.textContent = `${opt.value} (IN USE)`;
            opt.style.color = '#dc3545'; // text-danger
        } else {
            opt.disabled = false;
            opt.textContent = opt.value;
            opt.style.color = '';
        }
    });
}

// ============================================
// START THE APPLICATION
// ============================================
initialize();
