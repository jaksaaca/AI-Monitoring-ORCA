/**
 * ================================================
 *  ORCA Master Control — Admin Logic
 *  Parses Excel, displays editable table, and
 *  syncs to localStorage (mocking Firebase).
 * ================================================
 */

import { uploadSchedule, getSchedule } from "./modules/firebase-db.js";

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

// Internal state
let scheduleData = [];

// Load existing from Firebase
window.addEventListener('DOMContentLoaded', async () => {
    try {
        scheduleData = await getSchedule();
        if (scheduleData.length > 0) {
            renderTable();
            btnSave.classList.remove('d-none');
            btnClear.classList.remove('d-none');
        }
    } catch (e) {
        console.warn("Could not load from Firebase:", e);
    }
});

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

        return {
            studio: String(row['Studio'] || row['studio'] || '').trim(),
            hostName: String(row['Host'] || row['Host Name'] || row['Nama Host'] || '').trim(),
            brand: String(row['Brand'] || row['brand'] || '').trim(),
            location: String(row['Location'] || row['Lokasi'] || '').trim(),
            startTime: startTime,
            endTime: endTime
        };
    });

    renderTable();
    btnSave.classList.remove('d-none');
    btnClear.classList.remove('d-none');
    
    // Reset input
    fileInput.value = '';
});

// Render Table with editable inputs
function renderTable() {
    if (scheduleData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No schedule loaded. Upload an Excel file.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    scheduleData.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="form-control form-control-sm bg-transparent text-white border-secondary" value="${row.studio}" data-idx="${index}" data-field="studio"></td>
            <td><input type="text" class="form-control form-control-sm bg-transparent text-white border-secondary" value="${row.hostName}" data-idx="${index}" data-field="hostName"></td>
            <td><input type="text" class="form-control form-control-sm bg-transparent text-white border-secondary" value="${row.brand}" data-idx="${index}" data-field="brand"></td>
            <td><input type="text" class="form-control form-control-sm bg-transparent text-white border-secondary" value="${row.location}" data-idx="${index}" data-field="location"></td>
            <td><input type="time" class="form-control form-control-sm bg-transparent text-white border-secondary" value="${row.startTime}" data-idx="${index}" data-field="startTime"></td>
            <td><input type="time" class="form-control form-control-sm bg-transparent text-white border-secondary" value="${row.endTime}" data-idx="${index}" data-field="endTime"></td>
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

// Save to Database (Firebase)
btnSave.addEventListener('click', async () => {
    // Validate
    const invalid = scheduleData.some(r => !r.studio || !r.hostName || !r.startTime || !r.endTime);
    if (invalid) {
        alert('Error: Please ensure all rows have at least Studio, Host Name, Start Time, and End Time filled.');
        return;
    }
    
    btnSave.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
    btnSave.disabled = true;

    try {
        await uploadSchedule(scheduleData);
        
        btnSave.innerHTML = '<i data-lucide="check"></i> Saved to Cloud!';
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
    if (confirm('Are you sure you want to clear the entire schedule database from the cloud?')) {
        try {
            await uploadSchedule([]); // empty array to clear
            scheduleData = [];
            renderTable();
            btnSave.classList.add('d-none');
            btnClear.classList.add('d-none');
        } catch (e) {
            alert("Error clearing Firebase: " + e.message);
        }
    }
});
