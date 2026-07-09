const fs = require('fs');
let content = fs.readFileSync('public/assets/js/superadmin.js', 'utf8');

// Insert global vars
content = content.replace('let allLogs = [];', 'let allLogs = [];\nlet currentPage = 1;\nconst itemsPerPage = 50;');

// Update renderLogs
const renderLogsReplacement = `
    matchCount.textContent = filteredLogs.length;

    if (filteredLogs.length === 0) {
        tbodyLogs.innerHTML = \`<tr><td colspan="11" class="text-center py-4 text-secondary">No sessions match the selected filters.</td></tr>\`;
        document.getElementById('pagination-info').textContent = "Showing 0 of 0 entries";
        document.getElementById('pagination-ul').innerHTML = "";
        return;
    }

    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = 1;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedLogs = filteredLogs.slice(startIndex, startIndex + itemsPerPage);

    tbodyLogs.innerHTML = paginatedLogs.map(l => \`
        <tr>
            <td class="ps-4">\${l.timestamp ? new Date(l.timestamp).toLocaleString() : l['dateDay'] || '-'}</td>
            <td><span class="badge bg-secondary">\${l.branch || '-'}</span></td>
            <td><span class="badge bg-info text-dark">\${l.organization || '-'}</span></td>
            <td><span class="badge bg-light text-dark border">\${l.studio_id || '-'}</span></td>
            <td>\${l.brand || '-'}</td>
            <td><span class="badge bg-primary">\${l.platform || '-'}</span></td>
            <td>\${l.host_name || '-'}</td>
            <td>\${l.total_duration_seconds}s</td>
            <td class="\${l.face_detected_pct < 50 ? 'text-danger' : 'text-success'}">\${l.face_detected_pct}%</td>
            <td class="\${l.speaking_pct < 20 ? 'text-warning' : 'text-success'}">\${l.speaking_pct}%</td>
            <td class="text-end pe-4">
                <button class="btn btn-sm btn-outline-danger" onclick="deleteLog('\${l.id}')" title="Delete Log">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </td>
        </tr>
    \`).join('');
    lucide.createIcons();
    
    const endCount = Math.min(startIndex + itemsPerPage, filteredLogs.length);
    document.getElementById('pagination-info').textContent = \`Showing \${startIndex + 1} to \${endCount} of \${filteredLogs.length} entries\`;
    renderPagination(totalPages);
}`;

content = content.replace(/matchCount\.textContent = filteredLogs\.length;[\s\S]*?lucide\.createIcons\(\);\r?\n\}/, renderLogsReplacement);

// Add renderPagination and fetch handler
const extraFunctions = `

function renderPagination(totalPages) {
    const ul = document.getElementById('pagination-ul');
    let html = '';
    
    html += \`<li class="page-item \${currentPage === 1 ? 'disabled' : ''}">
                <button class="page-link" onclick="changePage(\${currentPage - 1})">Prev</button>
             </li>\`;
             
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        html += \`<li class="page-item \${i === currentPage ? 'active' : ''}">
                    <button class="page-link" onclick="changePage(\${i})">\${i}</button>
                 </li>\`;
    }
    
    html += \`<li class="page-item \${currentPage === totalPages ? 'disabled' : ''}">
                <button class="page-link" onclick="changePage(\${currentPage + 1})">Next</button>
             </li>\`;
             
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

`;

// Insert extraFunctions right before window.deleteLog
content = content.replace('window.deleteLog =', extraFunctions + 'window.deleteLog =');

// When filters change, reset page to 1
content = content.replace(/if\(fBranch\) fBranch\.addEventListener\('change', renderLogs\);/g, 'if(fBranch) fBranch.addEventListener(\'change\', () => { currentPage = 1; renderLogs(); });');
content = content.replace(/if\(fOrganization\) fOrganization\.addEventListener\('change', renderLogs\);/g, 'if(fOrganization) fOrganization.addEventListener(\'change\', () => { currentPage = 1; renderLogs(); });');
content = content.replace(/\[fStudio, fBrand, fPlatform, fHost\]\.forEach\(el => el\.addEventListener\('change', renderLogs\)\);/g, '[fStudio, fBrand, fPlatform, fHost].forEach(el => el.addEventListener(\'change\', () => { currentPage = 1; renderLogs(); }));');

fs.writeFileSync('public/assets/js/superadmin.js', content);
console.log('superadmin.js updated');
