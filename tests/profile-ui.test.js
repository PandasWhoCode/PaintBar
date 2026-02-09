const fs = require('fs');
const path = require('path');

/**
 * Tests for profile.js UI logic
 * 
 * Since profile.js uses ES module imports from Firebase CDN,
 * we test the DOM manipulation logic by reading the source and
 * extracting the pure functions that operate on the DOM.
 */

// Read the profile.js source to extract testable functions
const profileSource = fs.readFileSync(
    path.resolve(__dirname, '../public/scripts/profile.js'),
    'utf8'
);

// Set up the DOM from profile.html before each test
let profileHtml;
beforeAll(() => {
    profileHtml = fs.readFileSync(
        path.resolve(__dirname, '../public/profile.html'),
        'utf8'
    );
});

beforeEach(() => {
    document.documentElement.innerHTML = profileHtml;
});

// ---- Extract pure functions from profile.js source ----
// We eval the function bodies in CJS context since we can't import ES modules in Jest

// Extract updateProfileUI
const updateProfileUIBody = profileSource.match(
    /\/\/ Update profile UI with user data\nasync function updateProfileUI\(userData\) \{([\s\S]*?)\n\}\n\n\/\/ Populate form/
);

const updateProfileUI = new Function('userData', updateProfileUIBody[1]);

// Extract populateFormData
const populateFormDataBody = profileSource.match(
    /\/\/ Populate form with user data\nfunction populateFormData\(userData\) \{([\s\S]*?)\n\}\n\n\/\/ Fallback/
);

const populateFormData = new Function('userData', populateFormDataBody[1]);

// Stub cache functions used by updateProjectsUI (must be global for new Function scope)
globalThis.PROJECTS_CACHE_KEY = 'paintbar_projects_cache';
globalThis.setCachedGrid = function() {}; // no-op for tests

// Extract updateProjectsUI
const updateProjectsUIBody = profileSource.match(
    /\/\/ Update projects UI with user's projects\nfunction updateProjectsUI\(projects\) \{([\s\S]*?)\n\}\n\n\/\/ Handle/
);

const updateProjectsUI = new Function('projects', updateProjectsUIBody[1]);


describe('updateProfileUI', () => {

    test('displays username from userData', () => {
        updateProfileUI({ username: 'testuser', email: 'test@example.com' });
        expect(document.getElementById('profileUsername').textContent).toBe('testuser');
    });

    test('shows prompt when no username set', () => {
        updateProfileUI({ email: 'artist@paintbar.app' });
        expect(document.getElementById('profileUsername').textContent).toBe('Choose a username');
    });

    test('shows prompt when no username or email', () => {
        updateProfileUI({});
        expect(document.getElementById('profileUsername').textContent).toBe('Choose a username');
    });

    test('displays display name and shows element', () => {
        updateProfileUI({ displayName: 'Test Artist' });
        const el = document.getElementById('profileDisplayName');
        expect(el.textContent).toBe('Test Artist');
        expect(el.style.display).toBe('block');
    });

    test('hides display name when empty', () => {
        updateProfileUI({ displayName: '' });
        const el = document.getElementById('profileDisplayName');
        expect(el.style.display).toBe('none');
    });

    test('displays bio and shows element', () => {
        updateProfileUI({ bio: 'Digital artist' });
        const el = document.getElementById('profileBio');
        expect(el.textContent).toBe('Digital artist');
        expect(el.style.display).toBe('block');
    });

    test('hides bio when empty', () => {
        updateProfileUI({});
        const el = document.getElementById('profileBio');
        expect(el.style.display).toBe('none');
    });

    test('displays location with map marker icon', () => {
        updateProfileUI({ location: 'San Francisco' });
        const el = document.getElementById('profileLocation');
        expect(el.innerHTML).toContain('fa-map-marker-alt');
        expect(el.innerHTML).toContain('San Francisco');
        expect(el.style.display).toBe('block');
    });

    test('hides location when empty', () => {
        updateProfileUI({});
        const el = document.getElementById('profileLocation');
        expect(el.style.display).toBe('none');
    });

    test('displays HBAR address', () => {
        updateProfileUI({ hbarAddress: '0.0.123456' });
        expect(document.getElementById('hbarAddressDisplay').textContent).toBe('0.0.123456');
        expect(document.getElementById('hbarAddressContainer').style.display).toBe('flex');
    });

    test('hides HBAR address when empty', () => {
        updateProfileUI({});
        expect(document.getElementById('hbarAddressContainer').style.display).toBe('none');
    });

    test('no duplicate IDs between sidebar and form', () => {
        const allIds = [...document.querySelectorAll('[id]')].map(el => el.id);
        const dupes = allIds.filter((id, i) => allIds.indexOf(id) !== i);
        expect(dupes).toEqual([]);
    });

    describe('social links', () => {
        test('renders GitHub link', () => {
            updateProfileUI({ githubUrl: 'https://github.com/testuser' });
            const links = document.getElementById('socialLinks');
            expect(links.innerHTML).toContain('github.com/testuser');
            expect(links.innerHTML).toContain('fa-github');
        });

        test('renders Twitter link with @ stripped', () => {
            updateProfileUI({ twitterHandle: '@testuser' });
            const links = document.getElementById('socialLinks');
            expect(links.innerHTML).toContain('twitter.com/testuser');
            expect(links.innerHTML).not.toContain('twitter.com/@testuser');
        });

        test('renders Twitter link without @ prefix', () => {
            updateProfileUI({ twitterHandle: 'testuser' });
            const links = document.getElementById('socialLinks');
            expect(links.innerHTML).toContain('twitter.com/testuser');
        });

        test('renders Bluesky link', () => {
            updateProfileUI({ blueskyHandle: 'test.bsky.social' });
            const links = document.getElementById('socialLinks');
            expect(links.innerHTML).toContain('bsky.app/profile/test.bsky.social');
        });

        test('renders Instagram link with @ stripped', () => {
            updateProfileUI({ instagramHandle: '@artist' });
            const links = document.getElementById('socialLinks');
            expect(links.innerHTML).toContain('instagram.com/artist');
            expect(links.innerHTML).not.toContain('instagram.com/@artist');
        });

        test('renders website link', () => {
            updateProfileUI({ website: 'https://myart.com' });
            const links = document.getElementById('socialLinks');
            expect(links.innerHTML).toContain('https://myart.com');
            expect(links.innerHTML).toContain('fa-globe');
        });

        test('renders all social links together', () => {
            updateProfileUI({
                githubUrl: 'https://github.com/user',
                twitterHandle: '@user',
                blueskyHandle: 'user.bsky.social',
                instagramHandle: '@user',
                website: 'https://user.com'
            });
            const anchors = document.getElementById('socialLinks').querySelectorAll('a');
            expect(anchors.length).toBe(5);
        });

        test('renders no links when no social data', () => {
            updateProfileUI({});
            const links = document.getElementById('socialLinks');
            expect(links.innerHTML).toBe('');
        });
    });
});


describe('populateFormData', () => {

    test('populates displayName input', () => {
        populateFormData({ displayName: 'Test Artist' });
        expect(document.getElementById('displayName').value).toBe('Test Artist');
    });

    test('populates username and makes read-only when set', () => {
        populateFormData({ username: 'testuser' });
        const input = document.getElementById('username');
        expect(input.value).toBe('testuser');
        expect(input.readOnly).toBe(true);
        expect(input.title).toBe('Username cannot be changed once set');
    });

    test('username is editable when not set', () => {
        populateFormData({});
        const input = document.getElementById('username');
        expect(input.readOnly).toBe(false);
        expect(input.title).toBe('');
    });

    test('populates bio textarea', () => {
        populateFormData({ bio: 'My bio text' });
        expect(document.getElementById('bio').value).toBe('My bio text');
    });

    test('populates location input', () => {
        populateFormData({ location: 'NYC' });
        expect(document.getElementById('location').value).toBe('NYC');
    });

    test('populates website input', () => {
        populateFormData({ website: 'https://example.com' });
        expect(document.getElementById('website').value).toBe('https://example.com');
    });

    test('populates githubUrl input', () => {
        populateFormData({ githubUrl: 'https://github.com/user' });
        expect(document.getElementById('githubUrl').value).toBe('https://github.com/user');
    });

    test('populates twitterHandle input', () => {
        populateFormData({ twitterHandle: '@user' });
        expect(document.getElementById('twitterHandle').value).toBe('@user');
    });

    test('populates blueskyHandle input', () => {
        populateFormData({ blueskyHandle: 'user.bsky.social' });
        expect(document.getElementById('blueskyHandle').value).toBe('user.bsky.social');
    });

    test('populates instagramHandle input', () => {
        populateFormData({ instagramHandle: '@artist' });
        expect(document.getElementById('instagramHandle').value).toBe('@artist');
    });

    test('populates hbarAddress input', () => {
        populateFormData({ hbarAddress: '0.0.999' });
        const form = document.getElementById('editProfileForm');
        expect(form.querySelector('#hbarAddress').value).toBe('0.0.999');
    });

    test('handles empty/missing fields gracefully', () => {
        populateFormData({});
        expect(document.getElementById('displayName').value).toBe('');
        expect(document.getElementById('bio').value).toBe('');
        expect(document.getElementById('location').value).toBe('');
        expect(document.getElementById('website').value).toBe('');
        expect(document.getElementById('githubUrl').value).toBe('');
        expect(document.getElementById('twitterHandle').value).toBe('');
        expect(document.getElementById('blueskyHandle').value).toBe('');
        expect(document.getElementById('instagramHandle').value).toBe('');
        const form = document.getElementById('editProfileForm');
        expect(form.querySelector('#hbarAddress').value).toBe('');
    });
});


describe('updateProjectsUI', () => {

    test('shows "no projects" message for empty array', () => {
        updateProjectsUI([]);
        const grid = document.getElementById('projectsGrid');
        expect(grid.innerHTML).toContain('No projects yet');
    });

    test('renders project cards with data', () => {
        const projects = [
            {
                id: 'proj1',
                name: 'My Drawing',
                thumbnailData: 'data:image/png;base64,abc',
                createdAt: { seconds: 1700000000 }
            },
            {
                id: 'proj2',
                name: 'Another Art',
                imageData: 'data:image/png;base64,def',
                createdAt: { seconds: 1700100000 }
            }
        ];
        updateProjectsUI(projects);
        const grid = document.getElementById('projectsGrid');
        const cards = grid.querySelectorAll('.project-card');
        expect(cards.length).toBe(2);
        expect(cards[0].dataset.projectId).toBe('proj1');
        expect(cards[0].querySelector('h3').textContent).toBe('My Drawing');
    });

    test('updates project count stat', () => {
        updateProjectsUI([
            { id: '1', name: 'P1' },
            { id: '2', name: 'P2' },
            { id: '3', name: 'P3' }
        ]);
        expect(document.getElementById('projectCount').textContent).toBe('3');
    });

    test('handles project with no name as "Untitled"', () => {
        updateProjectsUI([{ id: '1' }]);
        const card = document.getElementById('projectsGrid').querySelector('.project-card');
        expect(card.querySelector('h3').textContent).toBe('Untitled');
    });

    test('uses placeholder image when no thumbnail or imageData', () => {
        updateProjectsUI([{ id: '1', name: 'Test' }]);
        const img = document.getElementById('projectsGrid').querySelector('.project-card img');
        expect(img.getAttribute('src')).toBe('images/placeholder.png');
    });
});


describe('profile.js source validation', () => {

    test('uses onSnapshot for profile listener (not setInterval polling or getDoc for initial load)', () => {
        expect(profileSource).toContain('unsubscribeProfile = onSnapshot(userDocRef');
        expect(profileSource).not.toContain('setInterval');
        // getDoc() calls should only be in form save, not in handleAuthStateChanged
        const authHandler = profileSource.match(/function handleAuthStateChanged[\s\S]*?\n\}\n/);
        expect(authHandler[0]).not.toMatch(/await getDoc\(/);
    });

    test('uses onSnapshot for projects listener', () => {
        expect(profileSource).toContain('unsubscribeProjects = onSnapshot(q');
    });

    test('has cleanupListeners function', () => {
        expect(profileSource).toContain('function cleanupListeners()');
    });

    test('cleans up listeners on logout', () => {
        expect(profileSource).toContain('cleanupListeners();');
        // Verify it's in the logout handler
        const logoutSection = profileSource.match(/async function handleLogout[\s\S]*?cleanupListeners/);
        expect(logoutSection).not.toBeNull();
    });

    test('cleans up listeners on page unload', () => {
        expect(profileSource).toContain("addEventListener('unload', cleanupListeners)");
    });

    test('imports getDoc and writeBatch for username uniqueness', () => {
        const importBlock = profileSource.match(/import \{[\s\S]*?\} from.*firebase-firestore/)[0];
        expect(importBlock).toContain('getDoc');
        expect(importBlock).toContain('writeBatch');
    });

    test('uses non-blocking success toast instead of alert on save', () => {
        expect(profileSource).toContain('showSuccessMessage');
        // The save handler should not use alert for success
        const saveHandler = profileSource.match(/async function handleProfileFormSubmit[\s\S]*?\n\}\n/);
        expect(saveHandler[0]).not.toMatch(/alert\(.*success/i);
    });

    test('saves bio, location, website in form submission', () => {
        expect(profileSource).toContain("bio: formData.get('bio')");
        expect(profileSource).toContain("location: formData.get('location')");
        expect(profileSource).toContain("website: formData.get('website')");
    });

    test('saves githubUrl in form submission', () => {
        expect(profileSource).toContain("githubUrl: formData.get('githubUrl')");
    });

    test('checks username uniqueness before claiming', () => {
        expect(profileSource).toContain("doc(db, 'usernames'");
        expect(profileSource).toContain('writeBatch(db)');
        expect(profileSource).toContain('batch.commit()');
    });

    test('validates username format', () => {
        expect(profileSource).toContain('/^[a-z0-9_-]{3,30}$/');
    });

    test('does not reference githubProfiles subcollection', () => {
        expect(profileSource).not.toContain('githubProfiles');
        expect(profileSource).not.toContain('githubUrl[]');
    });

    test('sets up stats listeners for gallery and nfts', () => {
        expect(profileSource).toContain("setupStatsListeners(user.uid)");
        expect(profileSource).toContain("name: 'gallery'");
        expect(profileSource).toContain("name: 'nfts'");
    });
});
