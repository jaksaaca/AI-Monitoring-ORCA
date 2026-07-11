/**
 * ================================================
 *  ORCA Host Monitoring — Centralized Configuration
 *  Single source of truth for branches, organizations,
 *  and studio counts. Update HERE when adding new
 *  locations instead of editing multiple HTML files.
 *  Author: Jaksa Setia Alam
 * ================================================
 */

export const BRANCHES = [
    { name: 'Jakarta', suffix: 'JKT', studioCount: 11 },
    { name: 'Bandung', suffix: 'BDG', studioCount: 30 },
];

export const ORGANIZATIONS = ['ORCA', 'Reckitt'];

/**
 * Get branch config by name.
 * @param {string} name — branch name (e.g. 'Jakarta')
 * @returns {object|undefined}
 */
export function getBranch(name) {
    return BRANCHES.find(b => b.name === name);
}

/**
 * Populate a <select> element with branch options.
 * @param {HTMLSelectElement} selectEl
 * @param {object} opts — { includeAll: boolean, selectedValue: string }
 */
export function populateBranchSelect(selectEl, opts = {}) {
    const { includeAll = false, selectedValue = '' } = opts;
    selectEl.innerHTML = '';
    if (includeAll) {
        const allOpt = document.createElement('option');
        allOpt.value = 'all';
        allOpt.textContent = 'All Branches';
        selectEl.appendChild(allOpt);
    }
    BRANCHES.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.name;
        opt.textContent = b.name;
        if (b.name === selectedValue) opt.selected = true;
        selectEl.appendChild(opt);
    });
}

/**
 * Populate a <select> element with organization options.
 * @param {HTMLSelectElement} selectEl
 * @param {object} opts — { includeAll: boolean, selectedValue: string }
 */
export function populateOrgSelect(selectEl, opts = {}) {
    const { includeAll = false, selectedValue = '' } = opts;
    selectEl.innerHTML = '';
    if (includeAll) {
        const allOpt = document.createElement('option');
        allOpt.value = 'all';
        allOpt.textContent = 'All Organizations';
        selectEl.appendChild(allOpt);
    }
    ORGANIZATIONS.forEach(org => {
        const opt = document.createElement('option');
        opt.value = org;
        opt.textContent = org;
        if (org === selectedValue) opt.selected = true;
        selectEl.appendChild(opt);
    });
}
