/**
 * ================================================
 *  ORCA Master Control — Admin Logic
 *  Parses Excel, displays editable table, and
 *  syncs to localStorage (mocking Firebase).
 * ================================================
 */

import { uploadSchedule, getSchedule, subscribeToStudioStatus } from "./modules/firebase-db.js";

// Check Auth
const authData = JSON.parse(sessionStorage.getItem('orca_auth'));
if (!authData || (authData.role !== 'admin' && authData.role !== 'superadmin')) {
    window.location.href = 'login.html';
}
document.getElementById('nav-user').textContent = authData.username;

const fileInput = document.getElementById('excel-file');
const tbody = document.getElementById('schedule-body');
const btnSave = document.getElementById('btn-save-schedule');
const btnClear = document.getElementById('btn-clear-schedule');
const adminBranch = document.getElementById('admin-branch');
const adminOrganization = document.getElementById('admin-organization');

// Internal state
let scheduleData = [];

// Load existing from Firebase
async function loadSchedule() {
    try {
        const branch = adminBranch.value;
        const organization = adminOrganization.value;
        scheduleData = await getSchedule(branch, organization);
        sortScheduleData();
        renderTable();
        if (scheduleData.length > 0) {
            btnSave.classList.remove('d-none');
            btnClear.classList.remove('d-none');
        } else {
            btnSave.classList.add('d-none');
            btnClear.classList.add('d-none');
        }
        // Always show Add Schedule button
        document.getElementById('btn-add-schedule').classList.remove('d-none');
    } catch (e) {
        console.warn("Could not load from Firebase:", e);
    }
}

window.addEventListener('DOMContentLoaded', loadSchedule);
adminBranch.addEventListener('change', loadSchedule);
adminOrganization.addEventListener('change', loadSchedule);

// File Upload Handler
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const data = await file.arrayBuffer();
    // SheetJS (XLSX object loaded via CDN)
    const workbook = XLSX.read(data);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Convert to JSON array of arrays to handle dynamic columns
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    
    scheduleData = rawData.map(row => {
        let startTime = String(row['Start Time'] || row['Mulai'] || '').trim();
        let endTime = String(row['End Time'] || row['Selesai'] || '').trim();

        const lsTime = String(row['LS Time'] || '').trim();
        if (lsTime && lsTime.includes('-')) {
            const parts = lsTime.split('-');
            startTime = parts[0].trim();
            endTime = parts[1].trim();
        }

        let dateValue = row['Date'] || row['Tanggal'] || row['date'] || row['tanggal'] || '';
        // SheetJS might parse date as number, try to handle or just use string
        if (typeof dateValue === 'number' && typeof XLSX.SSF !== 'undefined') {
            try {
                const parsed = XLSX.SSF.parse_date_code(dateValue);
                if (parsed) {
                    dateValue = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
                }
            } catch(e) {}
        }
        // Basic format check if it's a string, assuming DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD
        if (typeof dateValue === 'string') {
            dateValue = dateValue.trim();
            if (dateValue.match(/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/)) {
                const parts = dateValue.split(/[\/\-]/);
                dateValue = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }

        return {
            date: dateValue,
            studio: String(row['Studio'] || row['studio'] || '').trim(),
            hostName: String(row['Host'] || row['Host Name'] || row['Nama Host'] || '').trim(),
            brand: String(row['Brand'] || row['brand'] || '').trim(),
            platform: String(row['Platform'] || row['Platform Live'] || row['Streaming'] || '').trim(),
            location: String(row['Location'] || row['Lokasi'] || '').trim(),
            startTime: startTime,
            endTime: endTime
        };
    });

    sortScheduleData();
    renderTable();
    btnSave.classList.remove('d-none');
    btnClear.classList.remove('d-none');
    document.getElementById('btn-add-schedule').classList.remove('d-none');
    
    // Reset input
    fileInput.value = '';
});

// Sort Schedule Data by Date then Start Time
function sortScheduleData() {
    scheduleData.sort((a, b) => {
        const dateA = a.date || '9999-12-31';
        const dateB = b.date || '9999-12-31';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        
        const timeA = a.startTime || '99:99';
        const timeB = b.startTime || '99:99';
        return timeA.localeCompare(timeB);
    });
}

// Render Table with editable inputs
function renderTable() {
    if (scheduleData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-secondary);">No schedule loaded. Upload an Excel file or add manually.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    scheduleData.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="form-control form-control-sm bg-transparent text-white border-secondary" value="${row.studio}" data-idx="${index}" data-field="studio"></td>
            <td><input type="text" class="form-control form-control-sm bg-transparent text-white border-secondary" value="${row.hostName}" data-idx="${index}" data-field="hostName"></td>
            <td><input type="text" class="form-control form-control-sm bg-transparent text-white border-secondary" value="${row.brand}" data-idx="${index}" data-field="brand"></td>
            <td><input type="text" class="form-control form-control-sm bg-transparent text-white border-secondary" value="${row.platform || ''}" data-idx="${index}" data-field="platform"></td>
            <td><input type="text" class="form-control form-control-sm bg-transparent text-white border-secondary" value="${row.location || ''}" data-idx="${index}" data-field="location"></td>
            <td><input type="date" class="form-control form-control-sm bg-transparent text-white border-secondary" value="${row.date || ''}" data-idx="${index}" data-field="date"></td>
            <td><input type="time" class="form-control form-control-sm bg-transparent text-white border-secondary" value="${row.startTime || ''}" data-idx="${index}" data-field="startTime"></td>
            <td><input type="time" class="form-control form-control-sm bg-transparent text-white border-secondary" value="${row.endTime || ''}" data-idx="${index}" data-field="endTime"></td>
            <td class="text-center">
                <button class="btn btn-outline-danger btn-sm" onclick="deleteRow(${index})">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
    attachInputListeners();
}

function attachInputListeners() {
    document.querySelectorAll('input[data-field]').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = e.target.getAttribute('data-idx');
            const field = e.target.getAttribute('data-field');
            scheduleData[idx][field] = e.target.value;
        });
    });
}

window.deleteRow = function(index) {
    scheduleData.splice(index, 1);
    renderTable();
};

const btnAddSchedule = document.getElementById('btn-add-schedule');
if (btnAddSchedule) {
    btnAddSchedule.addEventListener('click', () => {
        scheduleData.push({
            date: '',
            studio: '',
            hostName: '',
            brand: '',
            platform: '',
            location: '',
            startTime: '',
            endTime: ''
        });
        renderTable();
        
        // Show save buttons if they were hidden
        btnSave.classList.remove('d-none');
        btnClear.classList.remove('d-none');
        
        // Scroll to bottom
        tbody.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
}

// Save to Database (Firebase)
btnSave.addEventListener('click', async () => {
    // Re-sort before saving
    sortScheduleData();
    renderTable();

    // Validate
    const invalid = scheduleData.some(r => !r.studio || !r.hostName || !r.date || !r.startTime || !r.endTime);
    if (invalid) {
        alert('Error: Please ensure all rows have at least Studio, Host Name, Date, Start Time, and End Time filled.');
        return;
    }
    
    const branch = adminBranch.value;
    const organization = adminOrganization.value;
    btnSave.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
    btnSave.disabled = true;

    try {
        await uploadSchedule(scheduleData, branch, organization);
        
        btnSave.innerHTML = `<i data-lucide="check"></i> Saved ${branch} (${organization}) to Cloud!`;
        btnSave.classList.replace('btn-primary', 'btn-success');
        lucide.createIcons();
        
        setTimeout(() => {
            btnSave.innerHTML = '<i data-lucide="save"></i> Save Changes to Database';
            btnSave.classList.replace('btn-success', 'btn-primary');
            btnSave.disabled = false;
            lucide.createIcons();
        }, 2000);
    } catch (e) {
        alert("Error saving to Firebase: " + e.message);
        btnSave.innerHTML = '<i data-lucide="save"></i> Save Changes to Database';
        btnSave.disabled = false;
    }
});

// Clear Database
btnClear.addEventListener('click', async () => {
    const branch = adminBranch.value;
    const organization = adminOrganization.value;
    if (confirm(`Are you sure you want to clear the entire schedule for ${branch} (${organization}) from the cloud?`)) {
        try {
            await uploadSchedule([], branch, organization); // empty array to clear
            scheduleData = [];
            renderTable();
            btnSave.classList.add('d-none');
            btnClear.classList.add('d-none');
        } catch (e) {
            alert("Error clearing Firebase: " + e.message);
        }
    }
});

// ==========================================
// COMMAND CENTER LOGIC
// ==========================================
const ccBranch = document.getElementById('cc-branch');
const ccGrid = document.getElementById('command-center-grid');

let unsubscribeStatus = null;
let currentStatuses = {};
let uptimeInterval = null;

function initCommandCenter() {
    if (!ccBranch || !ccGrid) return;
    
    ccBranch.addEventListener('change', listenToStatus);
    listenToStatus();
    
    // Start uptime ticking
    if (uptimeInterval) clearInterval(uptimeInterval);
    uptimeInterval = setInterval(updateUptimes, 1000);
}

function listenToStatus() {
    if (unsubscribeStatus) unsubscribeStatus();
    
    unsubscribeStatus = subscribeToStudioStatus(ccBranch.value, (statuses) => {
        currentStatuses = statuses;
        renderGrid();
    });
}

function renderGrid() {
    const branch = ccBranch.value;
    const numStudios = branch === 'Bandung' ? 30 : 11;
    
    ccGrid.innerHTML = '';
    
    for (let i = 1; i <= numStudios; i++) {
        const suffix = branch === 'Bandung' ? 'BDG' : 'JKT';
        const studioName = `Studio ${i} ${suffix}`;
        const statusData = currentStatuses[studioName] || { status: 'idle' };
        let isActive = statusData.status === 'active';
        

        
        const cardCol = document.createElement('div');
        cardCol.className = 'col-xl-2 col-lg-3 col-md-4 col-sm-6';
        
        cardCol.innerHTML = `
            <div class="card h-100 ${isActive ? 'border-info' : 'border-secondary'}" style="${isActive ? 'box-shadow: 0 0 20px rgba(13, 202, 240, 0.15); border-width: 2px !important;' : ''}">
                <div class="card-body p-3 d-flex flex-column gap-2">
                    <div class="d-flex justify-content-between align-items-start">
                        <span class="badge ${isActive ? 'bg-info text-dark' : 'bg-secondary text-white'}">${String(i).padStart(2, '0')} ${isActive && statusData.org ? statusData.org : ''}</span>
                        <span class="small font-monospace fw-bold ${isActive ? 'text-info' : 'text-secondary'}">${isActive ? 'ACTIVE' : 'IDLE'}</span>
                    </div>
                    <div class="mt-3">
                        <h6 class="mb-0 text-white fw-bold brand-font" style="letter-spacing: 1px;">${isActive ? (statusData.brand || '-') : '-'}</h6>
                        <small class="text-secondary">${isActive ? (statusData.host || '-') : '-'}</small>
                        <small class="text-info mt-1 d-block" style="font-size: 0.75rem;">
                            ${isActive && statusData.scheduleTime ? '<i data-lucide="clock" style="width: 12px; height: 12px;"></i> ' + statusData.scheduleTime : ''}
                        </small>
                    </div>
                    <div class="mt-auto pt-3 d-flex justify-content-end align-items-center border-top border-secondary mt-3">
                        <small class="text-info font-monospace fw-bold uptime-clock" data-time="${isActive ? statusData.updatedAt : ''}">
                            ${isActive ? '00:00:00' : '--:--'}
                        </small>
                    </div>
                </div>
            </div>
        `;
        ccGrid.appendChild(cardCol);
    }
    
    if (window.lucide) {
        lucide.createIcons({ root: ccGrid });
    }
    updateUptimes();
}

function updateUptimes() {
    const clocks = document.querySelectorAll('.uptime-clock');
    const now = new Date().getTime();
    
    clocks.forEach(clock => {
        const startTime = parseInt(clock.getAttribute('data-time'));
        if (!startTime) return;
        
        const diff = Math.max(0, Math.floor((now - startTime) / 1000));
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        clock.textContent = `${h}:${m}:${s}`;
    });
}

// Start CC
document.addEventListener('DOMContentLoaded', initCommandCenter);
