/**
 * ================================================
 *  ORCA Host Monitoring — Canvas Overlay Module
 *  Draws bounding boxes, labels, 3D axis, and
 *  status indicators on the video overlay canvas.
 *  Author: Jaksa Setia Alam
 * ================================================
 */

/**
 * Draw a face detection result onto the overlay canvas.
 * @param {CanvasRenderingContext2D} ctx — the 2D canvas context
 * @param {object} opts — drawing options
 * @param {number} opts.videoWidth — actual video width
 * @param {number} opts.videoHeight — actual video height
 * @param {number} opts.canvasWidth — canvas element width
 * @param {number} opts.canvasHeight — canvas element height
 * @param {object|null} opts.face — face bounding box {x, y, width, height} in video coords (null if no face)
 * @param {string} opts.poseClass — pose class name ("Depan", "Kiri", etc.)
 * @param {boolean} opts.isSpeaking — whether the host is speaking
 * @param {boolean} opts.isRecording — whether a session is being recorded
 */
export function drawOverlay(ctx, opts) {
    const { videoWidth, videoHeight, canvasWidth, canvasHeight, face, poseClass, isSpeaking, isRecording } = opts;

    // Clear previous frame
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (face) {
        // Direct mapping since canvas internal size perfectly matches video size
        // and both are using CSS object-fit: cover natively.
        const fx = face.x;
        const fy = face.y;
        const fw = face.width;
        const fh = face.height;

        // ---- Bounding Box ----
        const boxColor = isSpeaking ? '#10b981' : '#6366f1';
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = boxColor;
        ctx.shadowBlur = 8;

        // Draw rounded rect
        drawRoundedRect(ctx, fx, fy, fw, fh, 6);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // ---- Corner Accents ----
        const cornerLen = Math.min(fw, fh) * 0.15;
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = 3;
        drawCorners(ctx, fx, fy, fw, fh, cornerLen);

        // ---- Label Background ----
        const label = isSpeaking ? `${poseClass} • SPEAKING` : poseClass;
        ctx.font = '600 13px Inter, sans-serif';
        const textMetrics = ctx.measureText(label);
        const labelW = textMetrics.width + 16;
        const labelH = 24;
        const labelX = fx;
        const labelY = fy - labelH - 6;

        ctx.fillStyle = boxColor;
        ctx.globalAlpha = 0.85;
        drawRoundedRect(ctx, labelX, labelY, labelW, labelH, 6);
        ctx.fill();
        ctx.globalAlpha = 1;

        // ---- Label Text ----
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 12px Inter, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, labelX + 8, labelY + labelH / 2);

        // ---- 3D Axis Lines (using REAL pose angles from landmarks) ----
        const centerX = fx + fw / 2;
        const centerY = fy + fh / 2;
        const axisSize = Math.min(fw, fh) * 0.35;

        // Use real angles computed from MediaPipe 478 landmarks (face-detector.js)
        // Falls back to 0 if angles not available (backward compatible)
        const yaw = face.yaw || 0;
        const pitch = face.pitch || 0;
        const roll = face.roll || 0;
        drawAxis(ctx, centerX, centerY, yaw, pitch, roll, axisSize);

    } else {
        // ---- No Face Detected ----
        ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        ctx.font = '700 18px Inter, sans-serif';
        ctx.fillStyle = '#ef4444';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(239, 68, 68, 0.4)';
        ctx.shadowBlur = 12;
        ctx.fillText('NO FACE DETECTED', canvasWidth / 2, canvasHeight / 2);
        ctx.shadowBlur = 0;
        ctx.textAlign = 'start';
    }
}

// ---- Helper: Draw rounded rectangle path ----
function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ---- Helper: Draw corner accents ----
function drawCorners(ctx, x, y, w, h, len) {
    // Top-left
    ctx.beginPath();
    ctx.moveTo(x, y + len);
    ctx.lineTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(x + w - len, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + len);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(x, y + h - len);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + len, y + h);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x + w - len, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - len);
    ctx.stroke();
}

// ---- Helper: Draw 3D axis (port from Python draw_axis) ----
function drawAxis(ctx, tdx, tdy, yaw, pitch, roll, size) {
    const toRad = Math.PI / 180;
    const p = pitch * toRad;
    const y = -(yaw * toRad);
    const r = roll * toRad;

    // X axis endpoint (Red)
    const x1 = size * (Math.cos(y) * Math.cos(r)) + tdx;
    const y1 = size * (Math.cos(p) * Math.sin(r) + Math.cos(r) * Math.sin(p) * Math.sin(y)) + tdy;

    // Y axis endpoint (Green)
    const x2 = size * (-Math.cos(y) * Math.sin(r)) + tdx;
    const y2 = size * (Math.cos(p) * Math.cos(r) - Math.sin(p) * Math.sin(y) * Math.sin(r)) + tdy;

    // Z axis endpoint (Blue)
    const x3 = size * Math.sin(y) + tdx;
    const y3 = size * (-Math.cos(y) * Math.sin(p)) + tdy;

    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    // X-Axis (Red)
    ctx.beginPath();
    ctx.strokeStyle = '#ef4444';
    ctx.moveTo(tdx, tdy);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // Y-Axis (Green)
    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.moveTo(tdx, tdy);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Z-Axis (Blue)
    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.moveTo(tdx, tdy);
    ctx.lineTo(x3, y3);
    ctx.stroke();
}
