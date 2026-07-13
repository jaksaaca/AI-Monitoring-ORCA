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

// ==========================================
// ⚠️ FIREBASE CONFIGURATION (USER MUST FILL)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyChiTYLxjlWJ_fWn3JxYvggu-GZYiIBVgs",
  authDomain: "ai-monitoring-orca-8cfb3.firebaseapp.com",
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

    // Wrap entire operation in a 30-second timeout to prevent infinite hang
    const timeoutMs = 30000;
    const uploadTask = async () => {
        // Step 1: Clear existing schedule ONLY for this branch and organization
        console.log(`[Upload] Deleting old schedules for ${branch}/${organization}...`);
        const q = query(collection(db, "schedules"), 
                        where("branch", "==", branch), 
                        where("organization", "==", organization));
        const snapshot = await getDocs(q);
        
        // Delete in small batches to avoid Firestore rate limits
        const BATCH_SIZE = 20;
        for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
            const batch = snapshot.docs.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(d => deleteDoc(d.ref)));
            console.log(`[Upload] Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(snapshot.docs.length / BATCH_SIZE)}`);
        }
        
        // Step 2: Add new ones in batches
        console.log(`[Upload] Adding ${scheduleArray.length} new schedules...`);
        for (let i = 0; i < scheduleArray.length; i += BATCH_SIZE) {
            const batch = scheduleArray.slice(i, i + BATCH_SIZE);
            const addPromises = batch.map(sched => {
                const docData = { ...sched, branch, organization };
                return addDoc(collection(db, "schedules"), docData);
            });
            await Promise.all(addPromises);
            console.log(`[Upload] Added batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(scheduleArray.length / BATCH_SIZE)}`);
        }
        console.log(`[Upload] Complete!`);
    };

    // Race between the upload task and a timeout
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
// 4. COMMAND CENTER (STUDIO STATUS)
// ==========================================

export function subscribeToStudioStatus(branch, callback) {
    const q = query(
        collection(db, "studio_status"), 
        where("branch", "==", branch)
    );
    
    return onSnapshot(q, (snapshot) => {
        const statuses = {};
        snapshot.forEach(doc => {
            statuses[doc.data().studio] = doc.data();
        });
        callback(statuses);
    });
}

export async function setStudioStatus(branch, studio, statusData) {
    try {
        const docId = `${branch}_${studio}`.replace(/\s+/g, '_');
        const docRef = doc(db, "studio_status", docId);
        await setDoc(docRef, {
            branch,
            studio,
            ...statusData,
            updatedAt: new Date().getTime()
        }, { merge: true });
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
