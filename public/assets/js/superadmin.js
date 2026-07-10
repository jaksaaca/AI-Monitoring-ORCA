import { getAllSessionLogs, getAllUsers, createUser, deleteUser, deleteSessionLog } from "./modules/firebase-db.js";

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

const dateRangeInput = document.getElementById('fetch-date-range');
const btnFetchData = document.getElementById('btn-fetch-data');
const btnResetFilters = document.getElementById('btn-reset-filters');

let fpInstance = null;
if (typeof flatpickr !== 'undefined' && dateRangeInput) {
    fpInstance = flatpickr(dateRangeInput, {
        mode: "range",
        dateFormat: "Y-m-d",
        theme: "dark"
    });
}

if (btnFetchData) {
    btnFetchData.addEventListener('click', async () => {
        let start = null, end = null;
        if (fpInstance && fpInstance.selectedDates.length === 2) {
            start = fpInstance.selectedDates[0].toISOString().split('T')[0];
            end = fpInstance.selectedDates[1].toISOString().split('T')[0];
        } else if (fpInstance && fpInstance.selectedDates.length === 1) {
            start = fpInstance.selectedDates[0].toISOString().split('T')[0];
            end = start;
        }
        
        btnFetchData.disabled = true;
        btnFetchData.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        
        try {
            allLogs = await getAllSessionLogs(start, end);
            populateFilters(true); // Re-populate based on new dataset
            renderLogs();
        } catch (e) {
            console.error(e);
            alert("Gagal menarik data dari server.");
        } finally {
            btnFetchData.disabled = false;
            btnFetchData.innerHTML = '<i data-lucide="database-zap" style="width: 14px;"></i> Fetch';
            lucide.createIcons();
        }
    });
}

if (btnResetFilters) {
    btnResetFilters.addEventListener('click', async () => {
        // Reset dropdowns
        fBranch.value = 'all';
        fOrganization.value = 'all';
        fStudio.value = 'all';
        fBrand.value = 'all';
        fPlatform.value = 'all';
        fHost.value = 'all';
        
        // Reset flatpickr
        if (fpInstance) fpInstance.clear();
        
        btnResetFilters.disabled = true;
        
        try {
            allLogs = await getAllSessionLogs();
            populateFilters(true);
            renderLogs();
        } catch(e) {
            console.error(e);
        } finally {
            btnResetFilters.disabled = false;
        }
    });
}


let allLogs = [];
let currentPage = 1;
const itemsPerPage = 50;
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
    const selS = fStudio.value;
    const selB = fBrand.value;
    const selP = fPlatform.value;
    const selH = fHost.value;
    const selBranch = fBranch ? fBranch.value : 'all';
    const selOrg = fOrganization ? fOrganization.value : 'all';

    const getAvailable = (filterKey, logs) => [...new Set(logs.map(l => l[filterKey]).filter(Boolean))].sort();

    const createOpts = (arr, el, currentVal) => {
        el.innerHTML = el.firstElementChild.outerHTML; 
        arr.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            if (val === currentVal) opt.selected = true;
            el.appendChild(opt);
        });
        if (!arr.includes(currentVal) && currentVal !== 'all') {
            el.value = 'all';
        }
    };

    const logsForStudio = allLogs.filter(l => 
        (selBranch === 'all' || (l.branch || '').toLowerCase() === selBranch.toLowerCase()) &&
        (selOrg === 'all' || (l.organization || '').toLowerCase() === selOrg.toLowerCase()) &&
        (selB === 'all' || l.brand === selB) && 
        (selP === 'all' || l.platform === selP) && 
        (selH === 'all' || l.host_name === selH)
    );
    createOpts(getAvailable('studio_id', logsForStudio), fStudio, selS);

    const logsForBrand = allLogs.filter(l => 
        (selBranch === 'all' || (l.branch || '').toLowerCase() === selBranch.toLowerCase()) &&
        (selOrg === 'all' || (l.organization || '').toLowerCase() === selOrg.toLowerCase()) &&
        (selS === 'all' || l.studio_id === selS) && 
        (selP === 'all' || l.platform === selP) && 
        (selH === 'all' || l.host_name === selH)
    );
    createOpts(getAvailable('brand', logsForBrand), fBrand, selB);

    const logsForPlatform = allLogs.filter(l => 
        (selBranch === 'all' || (l.branch || '').toLowerCase() === selBranch.toLowerCase()) &&
        (selOrg === 'all' || (l.organization || '').toLowerCase() === selOrg.toLowerCase()) &&
        (selS === 'all' || l.studio_id === selS) && 
        (selB === 'all' || l.brand === selB) && 
        (selH === 'all' || l.host_name === selH)
    );
    createOpts(getAvailable('platform', logsForPlatform), fPlatform, selP);

    const logsForHost = allLogs.filter(l => 
        (selBranch === 'all' || (l.branch || '').toLowerCase() === selBranch.toLowerCase()) &&
        (selOrg === 'all' || (l.organization || '').toLowerCase() === selOrg.toLowerCase()) &&
        (selS === 'all' || l.studio_id === selS) && 
        (selB === 'all' || l.brand === selB) && 
        (selP === 'all' || l.platform === selP)
    );
    createOpts(getAvailable('host_name', logsForHost), fHost, selH);
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
    populateFilters(); // Cascading update

    if (filteredLogs.length === 0) {
        tbodyLogs.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-secondary">No sessions match the selected filters.</td></tr>`;
        document.getElementById('pagination-info').textContent = "Showing 0 of 0 entries";
        document.getElementById('pagination-ul').innerHTML = "";
        return;
    }

    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = 1;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedLogs = filteredLogs.slice(startIndex, startIndex + itemsPerPage);

    tbodyLogs.innerHTML = paginatedLogs.map(l => {
        const dateObj = l.timestamp ? new Date(l.timestamp) : null;
        
        let dateStr = l['dateDay'] || '-';
        if (dateObj) {
            const dd = String(dateObj.getDate()).padStart(2, '0');
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const yyyy = dateObj.getFullYear();
            dateStr = `${dd}/${mm}/${yyyy}`;
        }

        let scheduleStr = l.lsTime || '-';

        return `
        <tr>
            <td><input class="form-check-input bg-transparent border-secondary log-checkbox" type="checkbox" data-id="${l.id}"></td>
            <td class="text-nowrap">${l.branch || '-'}</td>
            <td class="text-nowrap">${l.organization || '-'}</td>
            <td class="text-nowrap fw-medium">${dateStr}</td>
            <td class="text-nowrap">${scheduleStr}</td>
            <td class="text-nowrap">${l.studio_id || '-'}</td>
            <td class="fw-medium text-white">${l.brand || '-'}</td>
            <td>${l.platform || '-'}</td>
            <td class="text-uppercase fw-semibold text-white">${l.host_name || '-'}</td>
            <td class="fw-bold ${l.face_detected_pct < 50 ? 'text-danger' : 'text-success'}">${l.face_detected_pct}</td>
            <td class="fw-bold ${l.speaking_pct < 20 ? 'text-warning' : 'text-success'}">${l.speaking_pct}</td>
            <td>
                <div class="d-flex justify-content-center gap-1">
                    <button class="btn btn-sm text-white d-flex align-items-center gap-1 px-2 py-1 shadow-sm" style="background-color: #531165; border-radius: 4px; font-size: 0.75rem;" onclick="alert('Detail feature coming soon')">
                        <i data-lucide="eye" style="width: 12px; height: 12px;"></i> Detail
                    </button>
                    <button class="btn btn-sm text-dark d-flex align-items-center gap-1 px-2 py-1 shadow-sm" style="background-color: #F59E0B; border-radius: 4px; font-size: 0.75rem; font-weight: 500;" onclick="alert('Edit feature coming soon')">
                        <i data-lucide="edit-2" style="width: 12px; height: 12px;"></i> Edit
                    </button>
                    <button class="btn btn-sm text-white d-flex align-items-center gap-1 px-2 py-1 shadow-sm" style="background-color: #EF4444; border-radius: 4px; font-size: 0.75rem;" onclick="deleteLog('${l.id}')">
                        <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i> Delete
                    </button>
                </div>
            </td>
        </tr>
        `;
    }).join('');
    lucide.createIcons();
    
    const endCount = Math.min(startIndex + itemsPerPage, filteredLogs.length);
    document.getElementById('pagination-info').textContent = `Showing ${startIndex + 1} to ${endCount} of ${filteredLogs.length} entries`;
    renderPagination(totalPages);
}



function renderPagination(totalPages) {
    const ul = document.getElementById('pagination-ul');
    let html = '';
    
    html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                <button class="page-link" onclick="changePage(${currentPage - 1})">Prev</button>
             </li>`;
             
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<li class="page-item ${i === currentPage ? 'active' : ''}">
                    <button class="page-link" onclick="changePage(${i})">${i}</button>
                 </li>`;
    }
    
    html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                <button class="page-link" onclick="changePage(${currentPage + 1})">Next</button>
             </li>`;
             
    ul.innerHTML = html;
}

window.changePage = (page) => {
    currentPage = page;
    renderLogs();
};

document.getElementById('btn-fetch-data').addEventListener('click', async () => {
    const sDate = document.getElementById('fetch-start-date').value;
    const eDate = document.getElementById('fetch-end-date').value;
    const btn = document.getElementById('btn-fetch-data');
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Fetching...';
    btn.disabled = true;
    try {
        allLogs = await getAllSessionLogs(sDate || null, eDate || null);
        populateFilters();
        currentPage = 1;
        renderLogs();
    } catch (e) {
        alert("Failed to fetch data: " + e.message);
    }
    btn.innerHTML = '<i data-lucide="database-zap" style="width: 16px;"></i> Tarik Data';
    btn.disabled = false;
    lucide.createIcons();
});

window.deleteLog = async (id) => {
    if (confirm("Are you sure you want to permanently delete this session log? This cannot be undone.")) {
        const btn = document.querySelector(`button[onclick="deleteLog('${id}')"]`);
        if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        
        try {
            await deleteSessionLog(id);
            // Remove from local array to avoid refetching
            allLogs = allLogs.filter(l => l.id !== id);
            renderLogs();
        } catch (e) {
            alert("Failed to delete log: " + e.message);
        }
    }
};

if(fBranch) fBranch.addEventListener('change', () => { currentPage = 1; renderLogs(); });
if(fOrganization) fOrganization.addEventListener('change', () => { currentPage = 1; renderLogs(); });
[fStudio, fBrand, fPlatform, fHost].forEach(el => el.addEventListener('change', () => { currentPage = 1; renderLogs(); }));

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


document.addEventListener('DOMContentLoaded', () => {
    // Check All logic
    const checkAll = document.getElementById('check-all');
    const btnDeleteMultiple = document.getElementById('btn-delete-multiple');

    if (checkAll) {
        checkAll.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.log-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
            });
            updateBulkDeleteButton();
        });
    }

    // Delegate change event for individual checkboxes
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('log-checkbox')) {
            updateBulkDeleteButton();
            // Update check-all state
            const checkboxes = Array.from(document.querySelectorAll('.log-checkbox'));
            if (checkAll) {
                checkAll.checked = checkboxes.length > 0 && checkboxes.every(cb => cb.checked);
            }
        }
    });

    function updateBulkDeleteButton() {
        if (btnDeleteMultiple) {
            const anyChecked = document.querySelectorAll('.log-checkbox:checked').length > 0;
            btnDeleteMultiple.disabled = !anyChecked;
        }
    }

    // Bulk Delete Action
    if (btnDeleteMultiple) {
        btnDeleteMultiple.addEventListener('click', async () => {
            const checked = document.querySelectorAll('.log-checkbox:checked');
            const idsToDelete = Array.from(checked).map(cb => cb.getAttribute('data-id'));
            
            if (idsToDelete.length === 0) return;

            if (confirm(`Are you sure you want to permanently delete ${idsToDelete.length} schedules? This cannot be undone.`)) {
                btnDeleteMultiple.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Deleting...';
                btnDeleteMultiple.disabled = true;

                try {
                    // Delete all in parallel
                    await Promise.all(idsToDelete.map(id => window.deleteSessionLog(id)));
                    
                    // Remove from local array
                    allLogs = allLogs.filter(l => !idsToDelete.includes(l.id));
                    
                    // Reset check-all
                    if (checkAll) checkAll.checked = false;
                    
                    // Re-render
                    renderLogs();
                } catch (e) {
                    alert("Error deleting multiple schedules: " + e.message);
                } finally {
                    btnDeleteMultiple.innerHTML = '<i data-lucide="trash-2" style="width: 16px;"></i> Delete Multiple Schedules';
                    btnDeleteMultiple.disabled = true; // Still disabled because selection is gone
                    if (window.lucide) window.lucide.createIcons();
                }
            }
        });
    }
});

// Since window.deleteSessionLog is needed, let's expose it if not already

window.deleteSessionLog = deleteSessionLog;
