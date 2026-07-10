const fs = require('fs');

let indexHtml = fs.readFileSync('public/index.html', 'utf8');
indexHtml = indexHtml.replace(/<img src="assets\/images\/orbizlogo\.png"[^>]+style="width: 48px[^>]+>\s*ORCA/, '<i data-lucide="activity" class="icon-lg"></i> ORCA');
indexHtml = indexHtml.replace(/<img src="assets\/images\/orbizlogo\.png"[^>]+style="width: 28px[^>]+>\s*ORCA/, '<i data-lucide="radio" class="icon-md text-white"></i> ORCA');
fs.writeFileSync('public/index.html', indexHtml);
console.log('Reverted index.html');

let loginHtml = fs.readFileSync('public/login.html', 'utf8');
loginHtml = loginHtml.replace(/<img src="assets\/images\/orbizlogo\.png"[^>]+>\s*ORCA/, '<i data-lucide="box" class="icon-md me-2"></i> ORCA');
fs.writeFileSync('public/login.html', loginHtml);
console.log('Reverted login.html');
