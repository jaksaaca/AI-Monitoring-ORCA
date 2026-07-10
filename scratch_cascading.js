const fs = require('fs');

let js = fs.readFileSync('public/assets/js/superadmin.js', 'utf8');

const oldPopulateFilters = `function populateFilters() {
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
}`;

const newPopulateFilters = `function populateFilters() {
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

    // Filter logs ignoring Studio
    const logsForStudio = allLogs.filter(l => 
        (selBranch === 'all' || (l.branch || '').toLowerCase() === selBranch.toLowerCase()) &&
        (selOrg === 'all' || (l.organization || '').toLowerCase() === selOrg.toLowerCase()) &&
        (selB === 'all' || l.brand === selB) && 
        (selP === 'all' || l.platform === selP) && 
        (selH === 'all' || l.host_name === selH)
    );
    createOpts(getAvailable('studio_id', logsForStudio), fStudio, selS);

    // Filter logs ignoring Brand
    const logsForBrand = allLogs.filter(l => 
        (selBranch === 'all' || (l.branch || '').toLowerCase() === selBranch.toLowerCase()) &&
        (selOrg === 'all' || (l.organization || '').toLowerCase() === selOrg.toLowerCase()) &&
        (selS === 'all' || l.studio_id === selS) && 
        (selP === 'all' || l.platform === selP) && 
        (selH === 'all' || l.host_name === selH)
    );
    createOpts(getAvailable('brand', logsForBrand), fBrand, selB);

    // Filter logs ignoring Platform
    const logsForPlatform = allLogs.filter(l => 
        (selBranch === 'all' || (l.branch || '').toLowerCase() === selBranch.toLowerCase()) &&
        (selOrg === 'all' || (l.organization || '').toLowerCase() === selOrg.toLowerCase()) &&
        (selS === 'all' || l.studio_id === selS) && 
        (selB === 'all' || l.brand === selB) && 
        (selH === 'all' || l.host_name === selH)
    );
    createOpts(getAvailable('platform', logsForPlatform), fPlatform, selP);

    // Filter logs ignoring Host
    const logsForHost = allLogs.filter(l => 
        (selBranch === 'all' || (l.branch || '').toLowerCase() === selBranch.toLowerCase()) &&
        (selOrg === 'all' || (l.organization || '').toLowerCase() === selOrg.toLowerCase()) &&
        (selS === 'all' || l.studio_id === selS) && 
        (selB === 'all' || l.brand === selB) && 
        (selP === 'all' || l.platform === selP)
    );
    createOpts(getAvailable('host_name', logsForHost), fHost, selH);
}`;

js = js.replace(oldPopulateFilters, newPopulateFilters);

// Add populateFilters() inside renderLogs() so it updates on every change
if (!js.includes('populateFilters(); // Cascading update')) {
    js = js.replace('matchCount.textContent = filteredLogs.length;', 'matchCount.textContent = filteredLogs.length;\n    populateFilters(); // Cascading update');
}

fs.writeFileSync('public/assets/js/superadmin.js', js);
console.log('Cascading logic applied.');
