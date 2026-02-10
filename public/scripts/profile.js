import { auth, db, sendPasswordResetEmail, signOut } from './firebase-init.js';
import { 
    doc, 
    setDoc, 
    getDoc,
    collection, 
    query, 
    where, 
    onSnapshot,
    orderBy,
    limit,
    writeBatch,
    getCountFromServer
} from 'https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js';

// Listener unsubscribe functions for cleanup
let unsubscribeProfile = null;
let unsubscribeProjects = null;
let unsubscribeStats = [];

// Local cache key suffixes (prefixed with uid at runtime)
const PROFILE_CACHE_SUFFIX = '_profile_cache';
const PROJECTS_CACHE_SUFFIX = '_projects_cache';
const GALLERY_CACHE_SUFFIX = '_gallery_cache';
const NFTS_CACHE_SUFFIX = '_nfts_cache';

// Current user uid for cache scoping (set on auth state change)
let currentUid = null;

function cacheKey(suffix) {
    return currentUid ? `paintbar_${currentUid}${suffix}` : null;
}

function getCachedProfile() {
    try {
        const key = cacheKey(PROFILE_CACHE_SUFFIX);
        if (!key) return null;
        const cached = localStorage.getItem(key);
        return cached ? JSON.parse(cached) : null;
    } catch { return null; }
}

function setCachedProfile(userData) {
    try {
        const key = cacheKey(PROFILE_CACHE_SUFFIX);
        if (key) localStorage.setItem(key, JSON.stringify(userData));
    } catch { /* quota exceeded — ignore */ }
}

function clearCachedProfile() {
    const suffixes = [PROFILE_CACHE_SUFFIX, PROJECTS_CACHE_SUFFIX, GALLERY_CACHE_SUFFIX, NFTS_CACHE_SUFFIX];
    suffixes.forEach(suffix => {
        const key = cacheKey(suffix);
        if (key) localStorage.removeItem(key);
    });
}

function getCachedGrid(suffix) {
    try {
        const key = cacheKey(suffix);
        if (!key) return null;
        const cached = localStorage.getItem(key);
        return cached ? JSON.parse(cached) : null;
    } catch { return null; }
}

function setCachedGrid(suffix, html) {
    try {
        const key = cacheKey(suffix);
        if (key) localStorage.setItem(key, JSON.stringify(html));
    } catch { /* quota exceeded — ignore */ }
}

// Sanitization helpers
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function sanitizeUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    } catch { /* invalid URL */ }
    return '';
}

function createSafeLink(href, title, iconClass) {
    const safeHref = sanitizeUrl(href);
    if (!safeHref) return null;
    const a = document.createElement('a');
    a.href = safeHref;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = title;
    const i = document.createElement('i');
    i.className = iconClass;
    a.appendChild(i);
    return a;
}

// Initialize profile page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Update copyright year
    document.querySelectorAll('.copyright-year').forEach(el => el.textContent = new Date().getFullYear());

    // Cached data is rendered after auth confirms uid (see handleAuthStateChanged)

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

    // "View All" links — show under construction banner
    document.querySelectorAll('.view-all').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showUnderConstructionBanner();
        });
    });

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

    // Set uid for cache scoping and render cached data now that uid is confirmed
    currentUid = user.uid;
    const cached = getCachedProfile();
    if (cached) {
        updateProfileUI(cached);
        populateFormData(cached);
    }
    const gridCaches = [
        { suffix: PROJECTS_CACHE_SUFFIX, id: 'projectsGrid' },
        { suffix: GALLERY_CACHE_SUFFIX, id: 'galleryGrid' },
        { suffix: NFTS_CACHE_SUFFIX, id: 'nftsGrid' }
    ];
    gridCaches.forEach(({ suffix, id }) => {
        const cachedHtml = getCachedGrid(suffix);
        if (cachedHtml) {
            const grid = document.getElementById(id);
            if (grid) grid.innerHTML = cachedHtml;
        }
    });

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
                    email: user.email || '',
                    username: '',
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

    unsubscribeProjects = onSnapshot(q, async (snapshot) => {
        const projects = snapshot.docs.map(d => ({ 
            id: d.id, 
            ...d.data() 
        }));
        updateProjectsUI(projects);

        // Fetch true count via server aggregation (not capped by limit)
        try {
            const countQuery = query(collection(db, 'projects'), where('userId', '==', uid));
            const countSnapshot = await getCountFromServer(countQuery);
            const projectCountEl = document.getElementById('projectCount');
            if (projectCountEl) projectCountEl.textContent = countSnapshot.data().count;
        } catch (err) {
            console.error('Error fetching project count:', err);
        }
    }, (error) => {
        console.error('Error in projects listener:', error);
        // Clear skeleton loaders on error so they don't spin forever
        const projectGrid = document.getElementById('projectsGrid');
        if (projectGrid) {
            projectGrid.innerHTML = '<p class="no-projects">No projects yet. Start creating!</p>';
        }
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
    let claimingUsername = false;
    if (usernameInput && !usernameInput.readOnly) {
        const newUsername = (formData.get('username') || '').trim().toLowerCase();
        if (newUsername) {
            // Validate format: alphanumeric, underscores, hyphens, 3-30 chars
            if (!/^[a-z0-9_-]{3,30}$/.test(newUsername)) {
                alert('Username must be 3-30 characters and can only contain letters, numbers, underscores, and hyphens.');
                return;
            }
            // Check uniqueness before proceeding
            const usernameDocRef = doc(db, 'usernames', newUsername);
            try {
                const usernameDoc = await getDoc(usernameDocRef);
                if (usernameDoc.exists()) {
                    alert('That username is already taken. Please choose another.');
                    return;
                }
            } catch (error) {
                console.error('Error checking username:', error);
                alert('Could not verify username availability. Please try again.');
                return;
            }
            updates.username = newUsername;
            claimingUsername = true;
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
        if (claimingUsername) {
            // Atomic batch: claim username + update profile together
            const batch = writeBatch(db);
            const usernameDocRef = doc(db, 'usernames', updates.username);
            batch.set(usernameDocRef, { uid: user.uid, createdAt: new Date() });
            batch.set(userDocRef, updates, { merge: true });
            await batch.commit();
        } else {
            await setDoc(userDocRef, updates, { merge: true });
        }
    } catch (error) {
        console.error('Error saving profile to server:', error);
        if (claimingUsername) {
            // Revert optimistic username update
            const reverted = { ...merged, username: '' };
            setCachedProfile(reverted);
            updateProfileUI(reverted);
            showSuccessMessage('Username could not be claimed. Please try again.');
        } else {
            showSuccessMessage('Saved locally. Will sync when connection is restored.');
        }
    }
}

// Set up real-time listeners for profile stats and grid content
function setupStatsListeners(uid) {
    const statCollections = [
        { name: 'gallery', gridId: 'galleryGrid', cacheSuffix: GALLERY_CACHE_SUFFIX },
        { name: 'nfts', gridId: 'nftsGrid', cacheSuffix: NFTS_CACHE_SUFFIX }
    ];
    
    statCollections.forEach(({ name, gridId, cacheSuffix }) => {
        const statsQuery = query(
            collection(db, name),
            where('userId', '==', uid),
            limit(10)
        );

        // Separate unlimited query for true count
        const countQuery = query(
            collection(db, name),
            where('userId', '==', uid)
        );

        const unsub = onSnapshot(statsQuery, async (snapshot) => {
            // Fetch true count via server aggregation (not capped by limit)
            const countEl = document.getElementById(`${name}Count`);
            try {
                const countSnapshot = await getCountFromServer(countQuery);
                if (countEl) countEl.textContent = countSnapshot.data().count;
            } catch (err) {
                console.error(`Error fetching ${name} count:`, err);
                if (countEl) countEl.textContent = snapshot.size;
            }

            // Update grid content
            const grid = document.getElementById(gridId);
            if (grid) {
                grid.innerHTML = '';
                if (snapshot.size === 0) {
                    grid.innerHTML = `<p class="no-projects">No ${name === 'nfts' ? 'NFTs' : 'gallery items'} yet.</p>`;
                } else {
                    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    items.forEach(item => {
                        const card = document.createElement('div');
                        card.className = 'project-card';
                        card.dataset.itemId = item.id;

                        const img = document.createElement('img');
                        img.src = safeSrc(item.thumbnailData || item.imageData);
                        img.alt = item.name || 'Untitled';
                        img.onerror = function() { this.src = 'images/placeholder.png'; };
                        card.appendChild(img);

                        const info = document.createElement('div');
                        info.className = 'project-info';
                        const h3 = document.createElement('h3');
                        h3.textContent = item.name || 'Untitled';
                        info.appendChild(h3);
                        card.appendChild(info);
                        grid.appendChild(card);
                    });
                }
                setCachedGrid(cacheSuffix, grid.innerHTML);
            }
        }, (error) => {
            console.error(`Error in ${name} listener:`, error);
            // Clear skeleton loaders on error so they don't spin forever
            const grid = document.getElementById(gridId);
            if (grid) {
                grid.innerHTML = `<p class="no-projects">No ${name === 'nfts' ? 'NFTs' : 'gallery items'} yet.</p>`;
            }
        });

        unsubscribeStats.push(unsub);
    });
}

// Update profile UI with user data
async function updateProfileUI(userData) {
    // Update username
    const usernameEl = document.getElementById('profileUsername');
    if (usernameEl) {
        usernameEl.textContent = userData.username || 'Choose a username';
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
            locationEl.textContent = '';
            const icon = document.createElement('i');
            icon.className = 'fas fa-map-marker-alt';
            locationEl.appendChild(icon);
            locationEl.appendChild(document.createTextNode(' ' + userData.location));
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
            const link = createSafeLink(userData.githubUrl, 'GitHub', 'fab fa-github');
            if (link) socialLinksEl.appendChild(link);
        }
        
        if (userData.twitterHandle) {
            const handle = userData.twitterHandle.startsWith('@') ? userData.twitterHandle.slice(1) : userData.twitterHandle;
            const link = createSafeLink(`https://twitter.com/${encodeURIComponent(handle)}`, 'Twitter/X', 'fab fa-x-twitter');
            if (link) socialLinksEl.appendChild(link);
        }
        
        if (userData.blueskyHandle) {
            const handle = userData.blueskyHandle.startsWith('@') ? userData.blueskyHandle.slice(1) : userData.blueskyHandle;
            const link = createSafeLink(`https://bsky.app/profile/${encodeURIComponent(handle)}`, 'Bluesky', 'fab fa-bluesky');
            if (link) socialLinksEl.appendChild(link);
        }
        
        if (userData.instagramHandle) {
            const handle = userData.instagramHandle.startsWith('@') ? userData.instagramHandle.slice(1) : userData.instagramHandle;
            const link = createSafeLink(`https://instagram.com/${encodeURIComponent(handle)}`, 'Instagram', 'fab fa-instagram');
            if (link) socialLinksEl.appendChild(link);
        }
        
        if (userData.website) {
            const link = createSafeLink(userData.website, 'Website', 'fas fa-globe');
            if (link) socialLinksEl.appendChild(link);
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
    const usernameEl = document.getElementById('profileUsername');
    if (usernameInput && usernameEl) {
        const text = usernameEl.textContent.trim();
        // Skip skeleton nbsp and placeholder prompt text
        if (text && !text.includes('\u00a0') && text !== 'Choose a username') {
            usernameInput.value = text;
            usernameInput.readOnly = true;
            usernameInput.title = 'Username cannot be changed once set';
        } else {
            usernameInput.value = '';
            usernameInput.readOnly = false;
            usernameInput.title = '';
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
            let hostname = '';
            try { hostname = new URL(href).hostname; } catch { return; }
            if (hostname === 'github.com' || hostname === 'www.github.com') {
                const gi = form.querySelector('#githubUrl');
                if (gi) gi.value = href;
            } else if (hostname === 'twitter.com' || hostname === 'www.twitter.com' || hostname === 'x.com' || hostname === 'www.x.com') {
                const ti = form.querySelector('#twitterHandle');
                if (ti) ti.value = href.split('/').pop();
            } else if (hostname === 'bsky.app' || hostname === 'www.bsky.app') {
                const bi = form.querySelector('#blueskyHandle');
                if (bi) bi.value = href.split('/').pop();
            } else if (hostname === 'instagram.com' || hostname === 'www.instagram.com') {
                const ii = form.querySelector('#instagramHandle');
                if (ii) ii.value = href.split('/').pop();
            } else if (link.querySelector('.fa-globe')) {
                const wi = form.querySelector('#website');
                if (wi) wi.value = href;
            }
        });
    }
}

// Validate image src is a safe data URI or relative/https path
function safeSrc(src) {
    if (!src) return 'images/placeholder.png';
    if (src.startsWith('data:image/')) return src;
    const safe = sanitizeUrl(src);
    return safe || 'images/placeholder.png';
}

// Update projects UI with user's projects
function updateProjectsUI(projects) {
    const projectGrid = document.getElementById('projectsGrid');
    if (!projectGrid) return;

    projectGrid.innerHTML = '';
    if (projects.length === 0) {
        projectGrid.innerHTML = '<p class="no-projects">No projects yet. Start creating!</p>';
    } else {
        projects.forEach(project => {
            const card = document.createElement('div');
            card.className = 'project-card';
            card.dataset.projectId = project.id;

            const img = document.createElement('img');
            img.src = safeSrc(project.thumbnailData || project.imageData);
            img.alt = project.name || 'Untitled';
            img.onerror = function() { this.src = 'images/placeholder.png'; };
            card.appendChild(img);

            const info = document.createElement('div');
            info.className = 'project-info';
            const h3 = document.createElement('h3');
            h3.textContent = project.name || 'Untitled';
            info.appendChild(h3);
            if (project.createdAt) {
                const dateSpan = document.createElement('span');
                dateSpan.className = 'project-date';
                dateSpan.textContent = new Date(project.createdAt.seconds * 1000).toLocaleDateString();
                info.appendChild(dateSpan);
            }
            card.appendChild(info);
            projectGrid.appendChild(card);
        });
    }

    // Cache the rendered grid HTML for instant load next time
    setCachedGrid(PROJECTS_CACHE_SUFFIX, projectGrid.innerHTML);
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

    // Restore header when modal closes
    const restoreHeader = () => {
        if (modalHeader) {
            modalHeader.textContent = 'Edit Profile';
        }
    };

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
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}

// Show an "Under Construction" banner
function showUnderConstructionBanner() {
    const existing = document.querySelector('.under-construction-banner');
    if (existing) return; // don't stack banners

    const banner = document.createElement('div');
    banner.className = 'under-construction-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = `
        <span>🚧 Under Construction — This feature is coming soon!</span>
        <button class="banner-close" aria-label="Close">&times;</button>
    `;
    document.body.prepend(banner);

    banner.querySelector('.banner-close').addEventListener('click', () => banner.remove());
    setTimeout(() => banner.remove(), 5000);
}