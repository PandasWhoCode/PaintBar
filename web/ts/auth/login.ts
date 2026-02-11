// ============================================================
// Login page — handles sign-in, sign-up, and auth state
// ============================================================

import { auth, onAuthStateChanged } from '../shared/firebase-init';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  type AuthError,
} from 'firebase/auth';

// Update copyright year
document.querySelectorAll('.copyright-year').forEach(el => {
  el.textContent = String(new Date().getFullYear());
});

// DOM elements
const toggleLinks = document.querySelectorAll('.toggle-link');
const loginForm = document.getElementById('loginForm') as HTMLFormElement;
const signupForm = document.getElementById('signupForm') as HTMLFormElement;
const loginToggle = document.getElementById('loginToggle')!;
const signupToggle = document.getElementById('signupToggle')!;
const formTitle = document.getElementById('formTitle')!;

// Enable submit buttons now that JS is loaded and Firebase is initialized
document.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach(btn => {
  btn.disabled = false;
});

// Form toggle functionality
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

  const email = (document.getElementById('email') as HTMLInputElement).value;
  const password = (document.getElementById('password') as HTMLInputElement).value;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (user) {
      window.location.href = '/profile';
    }
  } catch (error) {
    console.error('Login error:', error);
    let errorMessage = 'An error occurred during login.';
    const authError = error as AuthError;

    switch (authError.code) {
      case 'auth/invalid-email':
        errorMessage = 'Invalid email address format.';
        break;
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
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

  const email = (document.getElementById('signupEmail') as HTMLInputElement).value;
  const password = (document.getElementById('signupPassword') as HTMLInputElement).value;
  const confirmPassword = (document.getElementById('confirmPassword') as HTMLInputElement).value;

  if (password !== confirmPassword) {
    alert('Passwords do not match.');
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (user) {
      window.location.href = '/profile';
    }
  } catch (error) {
    console.error('Signup error:', error);
    let errorMessage = 'An error occurred during signup.';
    const authError = error as AuthError;

    switch (authError.code) {
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

// Auth state observer — redirect to profile if already logged in
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = '/profile';
  }
});
