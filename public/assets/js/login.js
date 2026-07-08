import { loginUser, getAllUsers, createUser } from "./modules/firebase-db.js";

const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const btnLogin = document.getElementById('btn-login');
const errorMsg = document.getElementById('error-msg');
const btnInit = document.getElementById('btn-init');

// Failsafe to initialize first superadmin if DB is empty
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const users = await getAllUsers();
        if (users.length === 0) {
            btnInit.classList.remove('d-none');
            errorMsg.innerHTML = "Database empty. Click 'Init Superadmin' to create default account.";
            errorMsg.classList.remove('alert-danger');
            errorMsg.classList.add('alert-warning', 'd-block');
        }
    } catch (e) {
        // Will fail if firebaseConfig is empty, which is expected before user setup.
        console.warn("Firebase not configured yet.");
    }
});

btnInit.addEventListener('click', async () => {
    try {
        await createUser("superadmin", "superadmin123", "superadmin");
        alert("Created default user:\nUsername: superadmin\nPassword: superadmin123\n\nPlease log in.");
        btnInit.classList.add('d-none');
        errorMsg.classList.add('d-none');
    } catch (e) {
        alert("Error: " + e.message);
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.classList.add('d-none');
    
    const u = usernameInput.value.trim();
    const p = passwordInput.value;
    
    btnLogin.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Authenticating...';
    btnLogin.disabled = true;
    
    const res = await loginUser(u, p);
    
    if (res.success) {
        // Store session
        const sessionData = {
            username: res.user.username,
            role: res.user.role
        };
        sessionStorage.setItem('orca_auth', JSON.stringify(sessionData));
        
        // Redirect based on role
        if (res.user.role === 'superadmin') {
            window.location.href = 'superadmin.html';
        } else if (res.user.role === 'admin') {
            window.location.href = 'admin.html';
        } else {
            window.location.href = 'index.html';
        }
    } else {
        errorMsg.textContent = res.error || "Invalid credentials.";
        errorMsg.classList.remove('d-none', 'alert-warning');
        errorMsg.classList.add('alert-danger');
        
        btnLogin.innerHTML = 'Sign In';
        btnLogin.disabled = false;
    }
});
