const fs = require('fs');
let content = fs.readFileSync('public/assets/js/modules/firebase-db.js', 'utf8');
content = content.replace('orderBy, onSnapshot', 'orderBy, onSnapshot, limit');
content = content.replace(
    /export async function getAllSessionLogs\(\) \{[\s\S]*?return snapshot\.docs\.map\(doc => \(\{ id: doc\.id, \.\.\.doc\.data\(\) \}\)\);\r?\n\}/,
    `export async function getAllSessionLogs(startDate = null, endDate = null) {
    let qArgs = [collection(db, "sessions")];
    if (startDate) qArgs.push(where("timestamp", ">=", startDate + "T00:00:00.000Z"));
    if (endDate) qArgs.push(where("timestamp", "<=", endDate + "T23:59:59.999Z"));
    qArgs.push(orderBy("timestamp", "desc"));
    qArgs.push(limit(1000));
    
    const q = query(...qArgs);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}`
);
fs.writeFileSync('public/assets/js/modules/firebase-db.js', content);
console.log('Done');
