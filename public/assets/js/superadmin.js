import { getAllSessionLogs, getAllUsers, createUser, deleteUser } from "./modules/firebase-db.js";

// Check Auth
const authData = JSON.parse(sessionStorage.getItem('orca_auth'));
if (!authData || authData.role !== 'superadmin') {
    window.location.href = 'login.html';
}
document.getElementById('display-user').textContent = authData.username;

document.getElementById('btn-logout').addEventListener('click', () => {
    sessionStorage.removeItem('orca_auth');
    window.location.href = 'login.html';
});

// ==========================================
// ANALYTICS & EXPORT TAB
// ==========================================
const tbodyLogs = document.getElementById('logs-tbody');
const fStudio = document.getElementById('filter-studio');
const fBrand = document.getElementById('filter-brand');
const fHost = document.getElementById('filter-host');
const matchCount = document.getElementById('match-count');
const btnDownload = document.getElementById('btn-download');

let allLogs = [];
let filteredLogs = [];

async function loadAnalytics() {
    try {
        allLogs = await getAllSessionLogs();
        populateFilters();
        renderLogs();
    } catch (e) {
        tbodyLogs.innerHTML = `<tr><td colspan="7" class="text-danger text-center">Error loading logs: ${e.message}</td></tr>`;
    }
}

function populateFilters() {
    const studios = [...new Set(allLogs.map(l => l.studio_id).filter(Boolean))].sort();
    const brands = [...new Set(allLogs.map(l => l.brand).filter(Boolean))].sort();
    const hosts = [...new Set(allLogs.map(l => l.host_name).filter(Boolean))].sort();

    const createOpts = (arr, el) => {
        // Keep the "All" option
        el.innerHTML = el.firstElementChild.outerHTML; 
        arr.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            el.appendChild(opt);
        });
    };

    createOpts(studios, fStudio);
    createOpts(brands, fBrand);
    createOpts(hosts, fHost);
}

function renderLogs() {
    const s = fStudio.value;
    const b = fBrand.value;
    const h = fHost.value;

    filteredLogs = allLogs.filter(l => {
        return (s === 'all' || l.studio_id === s) &&
               (b === 'all' || l.brand === b) &&
               (h === 'all' || l.host_name === h);
    });

    matchCount.textContent = filteredLogs.length;

    if (filteredLogs.length === 0) {
        tbodyLogs.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-secondary">No sessions match the selected filters.</td></tr>`;
        return;
    }

    tbodyLogs.innerHTML = filteredLogs.map(l => `
        <tr>
            <td class="ps-4">${l.timestamp ? new Date(l.timestamp).toLocaleString() : l['date & day']}</td>
            <td><span class="badge bg-dark">${l.studio_id || '-'}</span></td>
            <td>${l.brand || '-'}</td>
            <td>${l.host_name || '-'}</td>
            <td>${l.total_duration_seconds}s</td>
            <td class="${l.face_detected_pct < 50 ? 'text-danger' : 'text-success'}">${l.face_detected_pct}%</td>
            <td class="${l.speaking_pct < 20 ? 'text-warning' : 'text-success'}">${l.speaking_pct}%</td>
        </tr>
    `).join('');
}

[fStudio, fBrand, fHost].forEach(el => el.addEventListener('change', renderLogs));

// Export CSV
btnDownload.addEventListener('click', () => {
    if (filteredLogs.length === 0) {
        alert("No data to download.");
        return;
    }
    
    // We expect log headers
    const headers = Object.keys(filteredLogs[0]).filter(k => k !== 'id'); // remove firestore id
    const rows = filteredLogs.map(row =>
        headers.map(h => {
            const val = row[h] !== undefined ? String(row[h]) : '';
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        }).join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Create meaningful filename
    let fn = "orca_log";
    if (fStudio.value !== 'all') fn += `_${fStudio.value}`;
    if (fBrand.value !== 'all') fn += `_${fBrand.value}`;
    fn += ".csv";
    
    link.download = fn.replace(/\s+/g, '_');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});


// ==========================================
// ACCOUNTS TAB
// ==========================================
const tbodyUsers = document.getElementById('users-tbody');
const formCreateUser = document.getElementById('form-create-user');
const btnCreateUser = document.getElementById('btn-create-user');

async function loadAccounts() {
    try {
        const users = await getAllUsers();
        if (users.length === 0) {
            tbodyUsers.innerHTML = `<tr><td colspan="4" class="text-center text-secondary">No accounts found.</td></tr>`;
            return;
        }

        tbodyUsers.innerHTML = users.map(u => `
            <tr>
                <td class="ps-4 fw-medium">${u.username}</td>
                <td>
                    <span class="badge ${u.role === 'superadmin' ? 'bg-danger' : (u.role === 'admin' ? 'bg-primary' : 'bg-dark')}">
                        ${u.role.toUpperCase()}
                    </span>
                </td>
                <td class="text-secondary small">${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}</td>
                <td class="pe-4 text-end">
                    <button class="btn btn-outline-danger btn-sm" onclick="deleteAccount('${u.id}', '${u.username}')" ${u.username === authData.username ? 'disabled' : ''}>
                        <i data-lucide="trash-2" style="width: 14px;"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        lucide.createIcons();
    } catch (e) {
        tbodyUsers.innerHTML = `<tr><td colspan="4" class="text-danger text-center">Error loading accounts: ${e.message}</td></tr>`;
    }
}

formCreateUser.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('new-username').value.trim();
    const p = document.getElementById('new-password').value;
    const r = document.getElementById('new-role').value;

    btnCreateUser.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Creating...';
    btnCreateUser.disabled = true;

    try {
        await createUser(u, p, r);
        document.getElementById('new-username').value = '';
        document.getElementById('new-password').value = '';
        await loadAccounts();
    } catch (e) {
        alert(e.message);
    } finally {
        btnCreateUser.innerHTML = 'Create Account';
        btnCreateUser.disabled = false;
    }
});

window.deleteAccount = async (id, username) => {
    if (confirm(`Are you sure you want to delete the account '${username}'?`)) {
        try {
            await deleteUser(id);
            await loadAccounts();
        } catch (e) {
            alert(e.message);
        }
    }
};

// Init
loadAnalytics();
loadAccounts();
