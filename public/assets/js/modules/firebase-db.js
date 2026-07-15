/**
 * ================================================
 *  ORCA Host Monitoring — Firebase DB Module
 *  Handles all Firestore operations (Auth, Schedules, Sessions)
 * ================================================
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, doc, setDoc, getDocs, 
    addDoc, deleteDoc, query, where, orderBy, onSnapshot, limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getDatabase, ref, update, onValue, get, onDisconnect 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ==========================================
// ⚠️ FIREBASE CONFIGURATION (USER MUST FILL)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyChiTYLxjlWJ_fWn3JxYvggu-GZYiIBVgs",
  authDomain: "ai-monitoring-orca-8cfb3.firebaseapp.com",
  databaseURL: "https://ai-monitoring-orca-8cfb3-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ai-monitoring-orca-8cfb3",
  storageBucket: "ai-monitoring-orca-8cfb3.firebasestorage.app",
  messagingSenderId: "330499608796",
  appId: "1:330499608796:web:a5df10b3ee41705e5de419"
};

if (!firebaseConfig.apiKey) {
    alert("CRITICAL ERROR: Firebase Config is missing!\nPlease open public/assets/js/modules/firebase-db.js and paste your Firebase credentials.");
    throw new Error("Firebase config missing");
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);

// ==========================================
// 1. CUSTOM AUTHENTICATION & USERS
// ==========================================

export async function loginUser(username, password) {
    try {
        const q = query(collection(db, "users"), where("username", "==", username));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) return { success: false, error: "User not found" };
        
        let userData = null;
        snapshot.forEach(doc => { userData = { id: doc.id, ...doc.data() }; });
        
        // Simple plain-text password check (Can be hashed later if needed)
        if (userData.password === password) {
            return { success: true, user: userData };
        } else {
            return { success: false, error: "Incorrect password" };
        }
    } catch (e) {
        console.error("Login Error:", e);
        return { success: false, error: e.message };
    }
}

export async function getAllUsers() {
    const snapshot = await getDocs(collection(db, "users"));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function createUser(username, password, role) {
    // Check if exists
    const q = query(collection(db, "users"), where("username", "==", username));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) throw new Error("Username already exists");
    
    await addDoc(collection(db, "users"), {
        username,
        password, // For production, this should be hashed
        role,
        createdAt: new Date().toISOString()
    });
}

export async function deleteUser(userId) {
    await deleteDoc(doc(db, "users", userId));
}

// ==========================================
// 2. SCHEDULE MANAGEMENT
// ==========================================

export async function uploadSchedule(scheduleArray, branch, organization) {
    if (!branch || !organization) throw new Error("Branch and Organization are required to upload schedule.");

    const timeoutMs = 30000;
    const uploadTask = async () => {
        console.log(`[Upload] Smart Syncing schedules for ${branch}/${organization}...`);
        
        // 1. Fetch existing schedules
        const q = query(collection(db, "schedules"), 
                        where("branch", "==", branch), 
                        where("organization", "==", organization));
        const snapshot = await getDocs(q);
        
        let existingDocs = snapshot.docs.map(d => ({
            id: d.id,
            ref: d.ref,
            data: d.data()
        }));

        const addPromises = [];
        const updatePromises = [];
        
        // 2. Process new schedules
        for (const newSched of scheduleArray) {
            // Find an exact match to save operations (0 ops!)
            const exactMatchIdx = existingDocs.findIndex(e => 
                e.data.studio === newSched.studio &&
                e.data.hostName === newSched.hostName &&
                e.data.brand === newSched.brand &&
                e.data.platform === newSched.platform &&
                e.data.location === newSched.location &&
                e.data.date === newSched.date &&
                e.data.startTime === newSched.startTime &&
                e.data.endTime === newSched.endTime
            );

            if (exactMatchIdx !== -1) {
                // Exact match found, don't delete this document
                existingDocs.splice(exactMatchIdx, 1);
            } else {
                // No exact match. Update an existing doc or create a new one.
                const docData = { ...newSched, branch, organization };
                if (existingDocs.length > 0) {
                    // Reuse an existing document ID (1 Write instead of Delete+Write)
                    const docToReuse = existingDocs.pop();
                    updatePromises.push(() => setDoc(docToReuse.ref, docData));
                } else {
                    // No more existing docs, add a new one (1 Write)
                    addPromises.push(() => addDoc(collection(db, "schedules"), docData));
                }
            }
        }

        // 3. Any existing docs left over need to be deleted (1 Delete)
        const deletePromises = existingDocs.map(e => () => deleteDoc(e.ref));

        const unchangedCount = scheduleArray.length - addPromises.length - updatePromises.length;
        console.log(`[Upload] Plan: ${unchangedCount} unchanged schedules (0 ops).`);
        console.log(`[Upload] Plan: Updating ${updatePromises.length}, Adding ${addPromises.length}, Deleting ${deletePromises.length}.`);

        // Execute all operations in small batches to avoid rate limits
        const allOps = [...updatePromises, ...addPromises, ...deletePromises];
        const BATCH_SIZE = 20;
        for (let i = 0; i < allOps.length; i += BATCH_SIZE) {
            const batchFns = allOps.slice(i, i + BATCH_SIZE);
            await Promise.all(batchFns.map(fn => fn()));
            console.log(`[Upload] Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allOps.length / BATCH_SIZE)}`);
        }
        
        console.log(`[Upload] Complete!`);
        
        // Trigger real-time signal to all Hosts to fetch the new schedule
        await triggerScheduleSignal(branch);
    };

    await Promise.race([
        uploadTask(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(
            `Upload timed out after ${timeoutMs / 1000}s. Check your internet connection and try again.`
        )), timeoutMs))
    ]);
}

export async function getSchedule(branch = null, organization = null) {
    let q = collection(db, "schedules");
    if (branch) {
        q = query(q, where("branch", "==", branch));
    }
    if (organization) {
        q = query(q, where("organization", "==", organization));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Real-time listener for Operator UI
export function listenToSchedule(callback) {
    const q = collection(db, "schedules");
    return onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(data);
    });
}

// ==========================================
// 3. SESSION LOGS (MASTER LOG)
// ==========================================

export async function saveSessionLog(logData) {
    logData.timestamp = new Date().toISOString();
    await addDoc(collection(db, "sessions"), logData);
}

export async function getAllSessionLogs(startDate = null, endDate = null) {
    let qArgs = [collection(db, "sessions")];
    if (startDate) qArgs.push(where("timestamp", ">=", startDate + "T00:00:00.000Z"));
    if (endDate) qArgs.push(where("timestamp", "<=", endDate + "T23:59:59.999Z"));
    qArgs.push(orderBy("timestamp", "desc"));
    qArgs.push(limit(1000));
    
    const q = query(...qArgs);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ==========================================
// 3. SCHEDULE SYNC SIGNAL (RTDB)
// ==========================================

export async function triggerScheduleSignal(branch) {
    const signalRef = ref(rtdb, `schedule_signal/${branch}`);
    await update(ref(rtdb), { [`schedule_signal/${branch}`]: new Date().getTime() });
}

export function listenToScheduleSignal(branch, callback) {
    const signalRef = ref(rtdb, `schedule_signal/${branch}`);
    const unsubscribe = onValue(signalRef, (snapshot) => {
        callback(snapshot.val());
    });
    return () => unsubscribe();
}

// ==========================================
// 4. COMMAND CENTER (STUDIO STATUS)
// ==========================================

export function subscribeToStudioStatus(branch, callback) {
    const branchRef = ref(rtdb, `studio_status/${branch}`);
    
    const unsubscribe = onValue(branchRef, (snapshot) => {
        const statuses = {};
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach(key => {
                statuses[data[key].studio] = data[key];
            });
        }
        callback(statuses);
    });
    
    return () => unsubscribe();
}



export async function setStudioStatus(branch, studio, statusData) {
    try {
        const safeStudio = studio.replace(/[\.\#\$\[\]]/g, '_'); // RTDB keys cannot contain ., #, $, [, or ]
        const studioRef = ref(rtdb, `studio_status/${branch}/${safeStudio}`);
        await update(studioRef, {
            branch,
            studio,
            ...statusData,
            updatedAt: new Date().getTime()
        });
        
        // NATIVE SERVER-SIDE GHOST CLEANUP
        // Tell Firebase server to automatically set this studio to idle if the user's internet disconnects
        if (statusData.status === 'active') {
            onDisconnect(studioRef).update({ status: 'idle', operator: '', host: '' });
        } else {
            onDisconnect(studioRef).cancel(); // Cancel the trigger if we manually set to idle (End Session)
        }
    } catch (e) {
        console.error("Error setting studio status: ", e);
        throw e;
    }
}

export async function deleteSessionLog(docId) {
    try {
        const docRef = doc(db, "sessions", docId);
        await deleteDoc(docRef);
    } catch (e) {
        console.error("Error deleting session log: ", e);
        throw e;
    }
}

// ==========================================
// 5. SYSTEM COMMANDS (GOD-MODE)
// ==========================================

export function listenToGlobalCommands(callback) {
    const docRef = doc(db, "system_commands", "global");
    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            callback(docSnap.data());
        }
    });
}
