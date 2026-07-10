const fs = require('fs');

const oldLogoHtml = `<img src="assets/images/orbizlogo.png" alt="ORBIZ Logo" class="rounded-circle object-fit-cover me-2 shadow-sm" style="width: 28px; height: 28px; border: 2px solid var(--theme-primary);">`;
const oldLogoHtmlLoading = oldLogoHtml.replace('28px', '48px').replace('28px', '48px');

const updates = {
    'public/index.html': [
        { find: oldLogoHtml, replace: '<i data-lucide="radio" class="icon-md text-white"></i>' },
        { find: oldLogoHtmlLoading, replace: '<i data-lucide="activity" class="icon-lg"></i>' }
    ],
    'public/login.html': [
        { find: oldLogoHtml, replace: '<i data-lucide="box" class="icon-md me-2"></i>' }
    ]
};

for (const [file, changes] of Object.entries(updates)) {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        changes.forEach(change => {
            content = content.replace(change.find, change.replace);
        });
        fs.writeFileSync(file, content);
        console.log(`Reverted logo in ${file}`);
    }
}
