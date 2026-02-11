// Initialize Firebase
import { firebaseConfig } from './firebase-config.js';
firebase.initializeApp(firebaseConfig);

// Form toggle functionality
const toggleLinks = document.querySelectorAll('.toggle-link');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const loginToggle = document.getElementById('loginToggle');
const signupToggle = document.getElementById('signupToggle');
const formTitle = document.getElementById('formTitle');

toggleLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.toggle('hidden');
        signupForm.classList.toggle('hidden');
        loginToggle.classList.toggle('hidden');
        signupToggle.classList.toggle('hidden');
        formTitle.textContent = loginForm.classList.contains('hidden') ? 'Sign Up' : 'Login';
    });
});

// Login form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        if (user) {
            window.location.href = '/profile.html';
        }
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'An error occurred during login.';
        
        switch (error.code) {
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address format.';
                break;
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                errorMessage = 'Invalid email or password';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Too many failed login attempts. Please try again later.';
                break;
        }
        
        alert(errorMessage);
    }
});

// Signup form submission
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
        alert('Passwords do not match.');
        return;
    }

    try {
        const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        if (user) {
            window.location.href = '/profile.html';
        }
    } catch (error) {
        console.error('Signup error:', error);
        let errorMessage = 'An error occurred during signup.';
        
        switch (error.code) {
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address format.';
                break;
            case 'auth/email-already-in-use':
                errorMessage = 'This email is already registered.';
                break;
            case 'auth/weak-password':
                errorMessage = 'Password is too weak. It should be at least 6 characters.';
                break;
        }
        
        alert(errorMessage);
    }
});

// Auth state observer
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        window.location.href = '/profile.html';
    }
});
