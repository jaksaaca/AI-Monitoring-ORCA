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
const fBranch = document.getElementById('filter-branch');
const fOrganization = document.getElementById('filter-organization');
const fStudio = document.getElementById('filter-studio');
const fBrand = document.getElementById('filter-brand');
const fPlatform = document.getElementById('filter-platform');
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
    const platforms = [...new Set(allLogs.map(l => l.platform).filter(Boolean))].sort();
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
    createOpts(platforms, fPlatform);
    createOpts(hosts, fHost);
}

function renderLogs() {
    const br = fBranch ? fBranch.value : 'all';
    const org = fOrganization ? fOrganization.value : 'all';
    const s = fStudio.value;
    const b = fBrand.value;
    const p = fPlatform.value;
    const h = fHost.value;

    filteredLogs = allLogs.filter(l => {
        const mBranch = br === 'all' || (l.branch || '').toLowerCase() === br.toLowerCase();
        const mOrg = org === 'all' || (l.organization || '').toLowerCase() === org.toLowerCase();
        const mStudio = s === 'all' || l.studio_id === s;
        const mBrand = b === 'all' || l.brand === b;
        const mPlatform = p === 'all' || l.platform === p;
        const mHost = h === 'all' || l.host_name === h;
        return mBranch && mOrg && mStudio && mBrand && mPlatform && mHost;
    });

    matchCount.textContent = filteredLogs.length;

    if (filteredLogs.length === 0) {
        tbodyLogs.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-secondary">No sessions match the selected filters.</td></tr>`;
        return;
    }

    tbodyLogs.innerHTML = filteredLogs.map(l => `
        <tr>
            <td class="ps-4">${l.timestamp ? new Date(l.timestamp).toLocaleString() : l['dateDay'] || '-'}</td>
            <td><span class="badge bg-secondary">${l.branch || '-'}</span></td>
            <td><span class="badge bg-info text-dark">${l.organization || '-'}</span></td>
            <td><span class="badge bg-light text-dark border">${l.studio_id || '-'}</span></td>
            <td>${l.brand || '-'}</td>
            <td><span class="badge bg-primary">${l.platform || '-'}</span></td>
            <td>${l.host_name || '-'}</td>
            <td>${l.total_duration_seconds}s</td>
            <td class="${l.face_detected_pct < 50 ? 'text-danger' : 'text-success'}">${l.face_detected_pct}%</td>
            <td class="${l.speaking_pct < 20 ? 'text-warning' : 'text-success'}">${l.speaking_pct}%</td>
        </tr>
    `).join('');
}

if(fBranch) fBranch.addEventListener('change', renderLogs);
if(fOrganization) fOrganization.addEventListener('change', renderLogs);
[fStudio, fBrand, fPlatform, fHost].forEach(el => el.addEventListener('change', renderLogs));

// Export CSV
btnDownload.addEventListener('click', () => {
    if (filteredLogs.length === 0) {
        alert("No data to download.");
        return;
    }
    
    // Define exact headers matching the original format
    const headers = [
        "Branch", "Organization", "Date", "Schedule", "Studio", "Brand", "Platform", "Host Name", 
        "Total Duration(s)", "Face Detected(s)", "Face(%)", 
        "Facing Camera(s)", "Facing Camera(%)", 
        "Head Down(s)", "Head Down(%)", 
        "Not Facing(s)", "Not Facing(%)", 
        "Off Frame(s)", "Off Frame(%)", 
        "Speaking(s)", "Speaking(%)"
    ];

    const rows = filteredLogs.map(row => {
        const rowData = [
            row.branch || 'Unknown',
            row.organization || 'Unknown',
            row.dateDay || '-',
            row.lsTime || '-',
            row.studio_id || '-',
            row.brand || '-',
            row.platform || '-',
            row.host_name || '-',
            row.total_duration_seconds || 0,
            row.face_detected_seconds || 0,
            row.face_detected_pct || 0,
            row.facing_camera_seconds || 0,
            row.facing_camera_pct || 0,
            row.head_down_seconds || 0,
            row.head_down_pct || 0,
            row.not_facing_seconds || 0,
            row.not_facing_pct || 0,
            row.off_frame_seconds || 0,
            row.off_frame_pct || 0,
            row.speaking_seconds || 0,
            row.speaking_pct || 0
        ];
        
        return rowData.map(val => {
            const strVal = String(val);
            if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
                return `"${strVal.replace(/"/g, '""')}"`;
            }
            return strVal;
        }).join(',');
    });

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
                    <span class="badge ${u.role === 'superadmin' ? 'bg-danger' : (u.role === 'admin' ? 'bg-primary' : 'bg-white')}">
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
