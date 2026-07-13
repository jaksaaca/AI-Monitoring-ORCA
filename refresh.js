const url = 'https://firestore.googleapis.com/v1/projects/ai-monitoring-orca-8cfb3/databases/(default)/documents/system_commands/global';

const payload = {
    fields: {
        timestamp: { integerValue: Date.now().toString() }
    }
};

console.log("📡 Mengirim Sinyal God-Mode Refresh ke Server...");

fetch(url + '?updateMask.fieldPaths=timestamp', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
})
.then(res => res.json())
.then(data => {
    if (data.error) {
        console.error("❌ Gagal mengirim sinyal:", data.error.message);
    } else {
        console.log("✅ BERHASIL! Sinyal Refresh terkirim ke Firebase.");
        console.log("🔄 Semua layar operator ORCA akan ter-refresh secara otomatis.");
    }
})
.catch(err => {
    console.error("❌ Koneksi gagal:", err.message);
});
