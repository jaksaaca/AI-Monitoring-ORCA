/**
 * ================================================
 *  ORCA Host Monitoring — Firebase DB Module
 *  Handles all Firestore operations (Auth, Schedules, Sessions)
 * ================================================
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, doc, setDoc, getDoc, getDocs, 
    addDoc, deleteDoc, query, where, orderBy, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// ⚠️ FIREBASE CONFIGURATION (USER MUST FILL)
// ==========================================
const firebaseConfig = {
    // PASTE YOUR FIREBASE CONFIG HERE
    // apiKey: "...",
    // authDomain: "...",
    // projectId: "...",
    // storageBucket: "...",
    // messagingSenderId: "...",
    // appId: "..."
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

export async function uploadSchedule(scheduleArray) {
    // Clear existing schedule (Optional: delete all docs in collection)
    const snapshot = await getDocs(collection(db, "schedules"));
    const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    
    // Add new ones
    const addPromises = scheduleArray.map(sched => {
        return addDoc(collection(db, "schedules"), sched);
    });
    await Promise.all(addPromises);
}

export async function getSchedule() {
    const snapshot = await getDocs(collection(db, "schedules"));
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

export async function getAllSessionLogs() {
    // Get all sessions, sorted by timestamp descending
    const q = query(collection(db, "sessions"), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
