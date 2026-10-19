# ORCA — AI Host Monitoring System

Real-time AI-powered monitoring system for live streaming hosts. Runs entirely in the browser: face detection, gaze/pose classification, and voice activity detection track host performance metrics during live sessions — no server-side processing of video.

## Features

- **Face Detection** — MediaPipe FaceLandmarker for real-time face tracking
- **Gaze/Pose Classification** — ONNX-based EfficientNet model classifying 5 head poses (Front, Left, Right, Up, Down)
- **Voice Activity Detection** — Web Audio API with bandpass filtering and RMS threshold
- **Real-time Dashboard** — Live session stats with bounding boxes, 3D axis overlay, and FPS counter
- **Admin Command Center** — Multi-studio monitoring with heartbeat-based active/idle status, diff-rendered grid
- **Dynamic Studio Counts** — Branch studio counts editable from the superadmin panel (stored in RTDB), applied live without a redeploy
- **Schedule Management** — Excel upload for live streaming schedules
- **Analytics & Export** — Superadmin panel with filterable session logs and CSV export
- **Account Management** — Role-based access (Operator / Admin / Superadmin)
- **Auto-Recovery** — Automatic session backup on crash/refresh with localStorage fallback
- **Power Saving** — Render loop pauses when the tab is hidden (AI keeps sampling at 1 Hz); resumes instantly on return
- **Quota Friendly** — Built to stay within Firebase Spark (free tier): on-demand status fetches, 60s heartbeat, branch-scoped schedule reads

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS (ES Modules), Bootstrap 5.3 Dark Theme, no build step |
| AI/ML | MediaPipe Tasks Vision, ONNX Runtime Web |
| Database | Firebase Firestore (schedules, logs, accounts) + Firebase Realtime Database (studio status, heartbeat, branch config) |
| Hosting | Vercel (static) |
| Icons | Lucide Icons |
| Fonts | Inter (body), Outfit (headings) |

## Project Structure

```
public/
├── index.html              # Host Monitoring (Operator view)
├── admin.html              # Master Control (Admin view)
├── login.html              # Secure Login
├── superadmin.html         # Analytics & Account Management
└── assets/
    ├── css/
    │   └── style.css       # Global stylesheet (design tokens + overrides)
    ├── images/
    │   └── orbizlogo.png   # App logo/favicon
    ├── models/
    │   └── gaze_model.onnx # Head pose classification model (~16MB)
    └── js/
        ├── app.js          # Main orchestrator (camera, AI loop, session)
        ├── admin.js        # Admin panel logic (schedule + command center)
        ├── login.js        # Authentication handler
        ├── superadmin.js   # Analytics, export, account management, branch settings
        └── modules/
            ├── config.js           # Branch/org configuration (defaults)
            ├── firebase-db.js      # All Firestore + RTDB operations
            ├── face-detector.js    # MediaPipe FaceLandmarker wrapper
            ├── gaze-classifier.js  # ONNX head pose inference
            ├── session.js          # Session lifecycle & stats tracking (1 Hz)
            ├── vad.js              # Voice Activity Detection
            ├── canvas-overlay.js   # Bounding box & 3D axis rendering
            ├── worker-timer.js     # Web Worker timers (unthrottled in background tabs)
            └── audio-warning.js    # Silence warning beep generator

refresh.js                  # Dev utility: broadcast refresh signal to operator screens
firebase.json               # Firebase Hosting config (cache headers)
firestore.rules             # Firestore security rules
```

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/jaksaaca/AI-Monitoring-ORCA.git
   cd AI-Monitoring-ORCA
   ```

2. **Configure Firebase**
   Edit `public/assets/js/modules/firebase-db.js` and replace `firebaseConfig` with your Firebase project credentials (Firestore + Realtime Database enabled).

3. **Deploy**
   - **Vercel** — import the repo, set the output directory to `public/`, deploy.
   - **Firebase Hosting** — `npm install -g firebase-tools && firebase login && firebase deploy`

4. **First-time Setup**
   Open `/login.html` → Click "Init Superadmin" to create the default admin account, then change the password immediately (see Security Notes).

## Configuration

**Branch names, suffixes and default studio counts** live in one place:
`public/assets/js/modules/config.js`

```javascript
export const BRANCHES = [
    { name: 'Jakarta', suffix: 'JKT', studioCount: 11 },
    { name: 'Bandung', suffix: 'BDG', studioCount: 30 },
    { name: 'Surabaya', suffix: 'SBY', studioCount: 15 },  // ← Add here
];
```

No other files need to be modified — all dropdowns populate dynamically from this config.

**Studio counts can also be changed at runtime** (no code change, no redeploy):
Superadmin → Accounts tab → *Branch Studio Settings* → edit → Save.
The value is stored in RTDB (`branch_config/{branch}/studioCount`) and the admin Command Center grid updates live. The `config.js` values above act as fallback defaults.

## Roles

| Role | Access |
|------|--------|
| Operator | Host monitoring only (`index.html`) |
| Admin | Schedule management + Command Center (`admin.html`) |
| Superadmin | Full access: Analytics, Export, Accounts, Branch Settings (`superadmin.html`) |

## Data & Quota Notes (Firebase Free Tier)

The app is designed to fit within the Spark (free) plan for ~20–40 concurrent studios:

- **Realtime Database** — heartbeat every 60s per active studio; operator tabs fetch studio status on demand instead of holding a branch-wide listener (only the admin Command Center keeps a live listener; an operator's own session listens to its own studio node for take-over detection).
- **Firestore** — schedule reads are branch-scoped; session logs written once per session; analytics capped at 1,000 rows per query.
- **Ghost sessions** are cleaned up server-side via `onDisconnect`, independent of heartbeat frequency.

Monitor actual usage in Firebase Console → *Usage and billing*.

## Security Notes

Before exposing this deployment to the internet, address:

1. `firestore.rules` currently allows all read/write (`if true`) — the app uses custom username/password checks, not Firebase Auth. Tighten rules or migrate to Firebase Auth.
2. Default superadmin account (`Init Superadmin`) uses a well-known password — change it after first login.
3. Firebase web config in `firebase-db.js` is public by design (it is not a secret), but the rules above are the real gate.

## Author

**Jaksa Setia Alam** — ORBIZ 2026
