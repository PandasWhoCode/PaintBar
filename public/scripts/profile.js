import { auth, db, sendPasswordResetEmail, signOut } from './firebase-init.js';
import { 
    doc, 
    setDoc, 
    collection, 
    query, 
    where, 
    onSnapshot,
    orderBy,
    limit
} from 'https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js';

// Listener unsubscribe functions for cleanup
let unsubscribeProfile = null;
let unsubscribeProjects = null;
let unsubscribeStats = [];

// Local cache keys for instant rendering
const PROFILE_CACHE_KEY = 'paintbar_profile_cache';
const PROJECTS_CACHE_KEY = 'paintbar_projects_cache';
const GALLERY_CACHE_KEY = 'paintbar_gallery_cache';
const NFTS_CACHE_KEY = 'paintbar_nfts_cache';

function getCachedProfile() {
    try {
        const cached = localStorage.getItem(PROFILE_CACHE_KEY);
        return cached ? JSON.parse(cached) : null;
    } catch { return null; }
}

function setCachedProfile(userData) {
    try {
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(userData));
    } catch { /* quota exceeded — ignore */ }
}

function clearCachedProfile() {
    localStorage.removeItem(PROFILE_CACHE_KEY);
    localStorage.removeItem(PROJECTS_CACHE_KEY);
    localStorage.removeItem(GALLERY_CACHE_KEY);
    localStorage.removeItem(NFTS_CACHE_KEY);
}

function getCachedGrid(key) {
    try {
        const cached = localStorage.getItem(key);
        return cached ? JSON.parse(cached) : null;
    } catch { return null; }
}

function setCachedGrid(key, html) {
    try {
        localStorage.setItem(key, JSON.stringify(html));
    } catch { /* quota exceeded — ignore */ }
}

// Initialize profile page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Update copyright year
    document.querySelectorAll('.copyright-year').forEach(el => el.textContent = new Date().getFullYear());

    // Render cached profile data instantly (before Firebase resolves)
    const cached = getCachedProfile();
    if (cached) {
        updateProfileUI(cached);
        populateFormData(cached);
    }

    // Render cached grid states instantly
    const gridCaches = [
        { key: PROJECTS_CACHE_KEY, id: 'projectsGrid' },
        { key: GALLERY_CACHE_KEY, id: 'galleryGrid' },
        { key: NFTS_CACHE_KEY, id: 'nftsGrid' }
    ];
    gridCaches.forEach(({ key, id }) => {
        const cachedHtml = getCachedGrid(key);
        if (cachedHtml) {
            const grid = document.getElementById(id);
            if (grid) grid.innerHTML = cachedHtml;
        }
    });

    // Set up auth state listener
    auth.onAuthStateChanged(handleAuthStateChanged);

    // Set up form submission handler
    const form = document.getElementById('editProfileForm');
    if (form) {
        form.addEventListener('submit', handleProfileFormSubmit);
    }

    // Set up modal handlers
    const modal = document.getElementById('editProfileModal');
    const editProfileBtn = document.getElementById('editProfileBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const closeModalBtn = document.querySelector('.close-modal');
    const cancelBtn = document.querySelector('.cancel-button');

    if (editProfileBtn && modal) {
        editProfileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Populate form: try cache first, fall back to reading displayed UI
            const cachedData = getCachedProfile();
            if (cachedData) {
                populateFormData(cachedData);
            } else {
                populateFormFromUI();
            }
            modal.style.display = 'block';
        });
    }

    // Set up logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    if (closeModalBtn && modal) {
        closeModalBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    if (cancelBtn && modal) {
        cancelBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    // Close modal when clicking outside
    if (modal) {
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    // Set up reset password button
    const resetPasswordBtn = document.getElementById('resetPasswordBtn');
    if (resetPasswordBtn) {
        resetPasswordBtn.addEventListener('click', handleResetPassword);
    }

    // Clean up on page unload
    window.addEventListener('unload', cleanupListeners);
});

// Clean up all active listeners
function cleanupListeners() {
    if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
    }
    if (unsubscribeProjects) {
        unsubscribeProjects();
        unsubscribeProjects = null;
    }
    unsubscribeStats.forEach(unsub => unsub());
    unsubscribeStats = [];
}

// Handle auth state changes
async function handleAuthStateChanged(user) {
    // Clean up any existing listeners before setting up new ones
    cleanupListeners();

    if (!user) {
        window.location.href = '/login.html';
        return;
    }

    // Track whether we've handled the first snapshot (for new user detection)
    let isFirstSnapshot = true;

    const userDocRef = doc(db, 'users', user.uid);

    // Set up real-time listener for user profile
    // onSnapshot handles connectivity gracefully — it waits for the connection
    // and delivers data when ready, unlike getDoc which fails if offline.
    unsubscribeProfile = onSnapshot(userDocRef, async (docSnapshot) => {
        try {
            if (!docSnapshot.exists() && isFirstSnapshot) {
                // New user — create their document
                const initialUserData = {
                    uid: user.uid,
                    email: user.email,
                    username: user.email.split('@')[0],
                    displayName: user.displayName || '',
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                await setDoc(userDocRef, initialUserData);
                // onSnapshot will fire again with the new doc, so return here
                isFirstSnapshot = false;
                showWelcomeModal();
                return;
            }

            if (docSnapshot.exists()) {
                const userData = { ...docSnapshot.data(), uid: user.uid };
                setCachedProfile(userData);
                updateProfileUI(userData);
                populateFormData(docSnapshot.data());
            }

            isFirstSnapshot = false;
        } catch (error) {
            console.error('Error processing profile snapshot:', error);
        }
    }, (error) => {
        console.error('Error in profile listener:', error);
        if (error.code === 'permission-denied') {
            cleanupListeners();
            alert('You do not have permission to access this profile. Please log in again.');
            signOut(auth);
            window.location.href = '/login.html';
        }
    });

    // Set up real-time listener for projects
    setupProjectsListener(user.uid);

    // Set up real-time listeners for stats
    setupStatsListeners(user.uid);
}

// Set up real-time listener for user's projects
function setupProjectsListener(uid) {
    const projectsRef = collection(db, 'projects');
    const q = query(
        projectsRef, 
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(10)
    );

    unsubscribeProjects = onSnapshot(q, (snapshot) => {
        const projects = snapshot.docs.map(d => ({ 
            id: d.id, 
            ...d.data() 
        }));
        updateProjectsUI(projects);
    }, (error) => {
        console.error('Error in projects listener:', error);
        if (error.code === 'permission-denied') {
            cleanupListeners();
            alert('You do not have permission to access projects. Please log in again.');
            signOut(auth);
            window.location.href = '/login.html';
        }
    });
}

// Handle profile form submission
async function handleProfileFormSubmit(event) {
    event.preventDefault();

    const user = auth.currentUser;
    if (!user) {
        alert('Please log in to update your profile.');
        return;
    }

    const formData = new FormData(event.target);
    const updates = {
        displayName: formData.get('displayName') || '',
        bio: formData.get('bio') || '',
        location: formData.get('location') || '',
        website: formData.get('website') || '',
        githubUrl: formData.get('githubUrl') || '',
        twitterHandle: formData.get('twitterHandle') || '',
        blueskyHandle: formData.get('blueskyHandle') || '',
        instagramHandle: formData.get('instagramHandle') || '',
        hbarAddress: formData.get('hbarAddress') || '',
        updatedAt: new Date()
    };

    // Only set username if it's a new user (doesn't have one yet)
    // Username can only be set once — check via the readOnly state set by populateFormData
    const usernameInput = document.getElementById('username');
    if (usernameInput && !usernameInput.readOnly) {
        const newUsername = formData.get('username');
        if (newUsername) {
            updates.username = newUsername;
        }
    }

    // Optimistic update: close modal, update cache and UI immediately
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.style.display = 'none';
    }

    const cachedData = getCachedProfile() || {};
    const merged = { ...cachedData, ...updates, uid: user.uid };
    setCachedProfile(merged);
    updateProfileUI(merged);

    showSuccessMessage('Profile updated successfully!');

    // Write to Firestore in the background
    try {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, updates, { merge: true });
    } catch (error) {
        console.error('Error saving profile to server:', error);
        showSuccessMessage('Saved locally. Will sync when connection is restored.');
    }
}

// Set up real-time listeners for profile stats and grid content
function setupStatsListeners(uid) {
    const statCollections = [
        { name: 'gallery', gridId: 'galleryGrid', cacheKey: GALLERY_CACHE_KEY },
        { name: 'nfts', gridId: 'nftsGrid', cacheKey: NFTS_CACHE_KEY }
    ];
    
    statCollections.forEach(({ name, gridId, cacheKey }) => {
        const statsQuery = query(
            collection(db, name),
            where('userId', '==', uid)
        );

        const unsub = onSnapshot(statsQuery, (snapshot) => {
            // Update count
            const countEl = document.getElementById(`${name}Count`);
            if (countEl) countEl.textContent = snapshot.size;

            // Update grid content
            const grid = document.getElementById(gridId);
            if (grid) {
                if (snapshot.size === 0) {
                    grid.innerHTML = `<p class="no-projects">No ${name === 'nfts' ? 'NFTs' : 'gallery items'} yet.</p>`;
                } else {
                    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    grid.innerHTML = items.map(item => `
                        <div class="project-card" data-item-id="${item.id}">
                            <img src="${item.thumbnailData || item.imageData || 'images/placeholder.png'}" 
                                 alt="${item.name || 'Untitled'}"
                                 onerror="this.src='images/placeholder.png'">
                            <div class="project-info">
                                <h3>${item.name || 'Untitled'}</h3>
                            </div>
                        </div>
                    `).join('');
                }
                setCachedGrid(cacheKey, grid.innerHTML);
            }
        }, (error) => {
            console.error(`Error in ${name} listener:`, error);
        });

        unsubscribeStats.push(unsub);
    });
}

// Update profile UI with user data
async function updateProfileUI(userData) {
    // Update username
    const usernameEl = document.getElementById('profileUsername');
    if (usernameEl) {
        usernameEl.textContent = userData.username || (userData.email ? userData.email.split('@')[0] : 'User');
    }

    // Update display name
    const displayNameEl = document.getElementById('profileDisplayName');
    if (displayNameEl) {
        displayNameEl.textContent = userData.displayName || '';
        displayNameEl.style.display = userData.displayName ? 'block' : 'none';
    }

    // Update bio
    const bioEl = document.getElementById('profileBio');
    if (bioEl) {
        bioEl.textContent = userData.bio || '';
        bioEl.style.display = userData.bio ? 'block' : 'none';
    }

    // Update location
    const locationEl = document.getElementById('profileLocation');
    if (locationEl) {
        if (userData.location) {
            locationEl.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${userData.location}`;
            locationEl.style.display = 'block';
        } else {
            locationEl.style.display = 'none';
        }
    }

    // Update HBAR address
    const hbarAddressEl = document.getElementById('hbarAddressDisplay');
    const hbarContainerEl = document.getElementById('hbarAddressContainer');
    if (hbarAddressEl && hbarContainerEl) {
        if (userData.hbarAddress) {
            hbarAddressEl.textContent = userData.hbarAddress;
            hbarContainerEl.style.display = 'flex';
        } else {
            hbarContainerEl.style.display = 'none';
        }
    }

    // Update social links
    const socialLinksEl = document.getElementById('socialLinks');
    if (socialLinksEl) {
        socialLinksEl.innerHTML = '';
        
        if (userData.githubUrl) {
            socialLinksEl.innerHTML += `<a href="${userData.githubUrl}" target="_blank" title="GitHub"><i class="fab fa-github"></i></a>`;
        }
        
        if (userData.twitterHandle) {
            const handle = userData.twitterHandle.startsWith('@') ? userData.twitterHandle.slice(1) : userData.twitterHandle;
            socialLinksEl.innerHTML += `<a href="https://twitter.com/${handle}" target="_blank" title="Twitter/X"><i class="fab fa-x-twitter"></i></a>`;
        }
        
        if (userData.blueskyHandle) {
            socialLinksEl.innerHTML += `<a href="https://bsky.app/profile/${userData.blueskyHandle}" target="_blank" title="Bluesky"><i class="fab fa-bluesky"></i></a>`;
        }
        
        if (userData.instagramHandle) {
            const handle = userData.instagramHandle.startsWith('@') ? userData.instagramHandle.slice(1) : userData.instagramHandle;
            socialLinksEl.innerHTML += `<a href="https://instagram.com/${handle}" target="_blank" title="Instagram"><i class="fab fa-instagram"></i></a>`;
        }
        
        if (userData.website) {
            socialLinksEl.innerHTML += `<a href="${userData.website}" target="_blank" title="Website"><i class="fas fa-globe"></i></a>`;
        }
    }

}

// Populate form with user data
function populateFormData(userData) {
    const form = document.getElementById('editProfileForm');
    if (!form) return;

    // Basic information
    const displayNameInput = form.querySelector('#displayName');
    if (displayNameInput) displayNameInput.value = userData.displayName || '';

    const usernameInput = form.querySelector('#username');
    if (usernameInput) {
        usernameInput.value = userData.username || '';
        // Make username read-only if it's already set
        if (userData.username) {
            usernameInput.readOnly = true;
            usernameInput.style.backgroundColor = '#f0f0f0';
            usernameInput.style.cursor = 'not-allowed';
            usernameInput.title = 'Username cannot be changed once set';
        } else {
            usernameInput.readOnly = false;
            usernameInput.style.backgroundColor = '';
            usernameInput.style.cursor = '';
            usernameInput.title = '';
        }
    }

    // Social media
    const githubInput = form.querySelector('#githubUrl');
    if (githubInput) githubInput.value = userData.githubUrl || '';

    const twitterInput = form.querySelector('#twitterHandle');
    if (twitterInput) twitterInput.value = userData.twitterHandle || '';

    const blueskyInput = form.querySelector('#blueskyHandle');
    if (blueskyInput) blueskyInput.value = userData.blueskyHandle || '';

    const instagramInput = form.querySelector('#instagramHandle');
    if (instagramInput) instagramInput.value = userData.instagramHandle || '';

    // Bio, location, website
    const bioInput = form.querySelector('#bio');
    if (bioInput) bioInput.value = userData.bio || '';

    const locationInput = form.querySelector('#location');
    if (locationInput) locationInput.value = userData.location || '';

    const websiteInput = form.querySelector('#website');
    if (websiteInput) websiteInput.value = userData.website || '';

    // Blockchain
    const hbarInput = form.querySelector('#hbarAddress');
    if (hbarInput) hbarInput.value = userData.hbarAddress || '';
}

// Fallback: populate form by reading currently displayed profile UI values
function populateFormFromUI() {
    const form = document.getElementById('editProfileForm');
    if (!form) return;

    const username = document.getElementById('profileUsername');
    const displayName = document.getElementById('profileDisplayName');
    const bio = document.getElementById('profileBio');
    const location = document.getElementById('profileLocation');
    const hbar = document.getElementById('hbarAddressDisplay');

    const usernameInput = form.querySelector('#username');
    if (usernameInput && username) {
        const text = username.textContent.trim();
        if (text && !text.includes('\u00a0')) { // skip skeleton nbsp
            usernameInput.value = text;
            usernameInput.readOnly = true;
            usernameInput.title = 'Username cannot be changed once set';
        }
    }

    const displayNameInput = form.querySelector('#displayName');
    if (displayNameInput && displayName) displayNameInput.value = displayName.textContent.trim() || '';

    const bioInput = form.querySelector('#bio');
    if (bioInput && bio) bioInput.value = bio.textContent.trim() || '';

    const locationInput = form.querySelector('#location');
    if (locationInput && location) {
        // Strip the map marker icon text
        const locText = location.textContent.trim();
        if (locText) locationInput.value = locText;
    }

    const hbarInput = form.querySelector('#hbarAddress');
    if (hbarInput && hbar) hbarInput.value = hbar.textContent.trim() || '';

    // Social links: read href attributes from rendered links
    const socialLinks = document.getElementById('socialLinks');
    if (socialLinks) {
        const links = socialLinks.querySelectorAll('a');
        links.forEach(link => {
            const href = link.getAttribute('href') || '';
            if (href.includes('github.com')) {
                const gi = form.querySelector('#githubUrl');
                if (gi) gi.value = href;
            } else if (href.includes('twitter.com')) {
                const ti = form.querySelector('#twitterHandle');
                if (ti) ti.value = href.split('/').pop();
            } else if (href.includes('bsky.app')) {
                const bi = form.querySelector('#blueskyHandle');
                if (bi) bi.value = href.split('/').pop();
            } else if (href.includes('instagram.com')) {
                const ii = form.querySelector('#instagramHandle');
                if (ii) ii.value = href.split('/').pop();
            } else if (link.querySelector('.fa-globe')) {
                const wi = form.querySelector('#website');
                if (wi) wi.value = href;
            }
        });
    }
}

// Update projects UI with user's projects
function updateProjectsUI(projects) {
    const projectGrid = document.getElementById('projectsGrid');
    if (!projectGrid) return;

    if (projects.length === 0) {
        projectGrid.innerHTML = '<p class="no-projects">No projects yet. Start creating!</p>';
    } else {
        projectGrid.innerHTML = projects.map(project => `
            <div class="project-card" data-project-id="${project.id}">
                <img src="${project.thumbnailData || project.imageData || 'images/placeholder.png'}" 
                     alt="${project.name || 'Untitled'}"
                     onerror="this.src='images/placeholder.png'">
                <div class="project-info">
                    <h3>${project.name || 'Untitled'}</h3>
                    ${project.createdAt ? `<span class="project-date">${new Date(project.createdAt.seconds * 1000).toLocaleDateString()}</span>` : ''}
                </div>
            </div>
        `).join('');
    }

    // Cache the rendered grid HTML for instant load next time
    setCachedGrid(PROJECTS_CACHE_KEY, projectGrid.innerHTML);

    // Update project count
    const projectCountEl = document.getElementById('projectCount');
    if (projectCountEl) {
        projectCountEl.textContent = projects.length;
    }
}

// Handle logout
async function handleLogout(e) {
    e.preventDefault();
    
    try {
        // Clean up all listeners and cached data
        cleanupListeners();
        clearCachedProfile();
        
        // Sign out from Firebase
        await signOut(auth);
        
        // Redirect to login page
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Error signing out:', error);
        alert('Failed to sign out. Please try again.');
    }
}

// Handle password reset request
async function handleResetPassword() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        await sendPasswordResetEmail(auth, user.email);
        alert('Password reset email sent. Please check your inbox.');
    } catch (error) {
        console.error('Error sending reset email:', error);
        alert('Failed to send reset email. Please try again.');
    }
}

// Show welcome modal for new users
function showWelcomeModal() {
    const modal = document.getElementById('editProfileModal');
    if (!modal) return;

    // Add welcome message to modal
    const modalHeader = modal.querySelector('.modal-header h2');
    if (modalHeader) {
        modalHeader.textContent = 'Welcome to PaintBar! Complete Your Profile';
    }

    // Show the modal
    modal.style.display = 'block';

    // Add a one-time listener to restore the header text after closing
    const restoreHeader = () => {
        if (modalHeader) {
            modalHeader.textContent = 'Edit Profile';
        }
        modal.removeEventListener('close', restoreHeader);
    };

    // Restore header when modal closes
    const closeBtn = modal.querySelector('.close-modal');
    const cancelBtn = modal.querySelector('.cancel-button');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', restoreHeader, { once: true });
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', restoreHeader, { once: true });
    }
}

// Show a non-blocking success toast message
function showSuccessMessage(message) {
    const existing = document.querySelector('.success-message');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'success-message';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}

// Initialize smooth scrolling
function initializeSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
}