const fs = require('fs');
const path = require('path');

/**
 * Tests for profile.html structure
 * Validates that all required elements, IDs, form fields, and sections exist.
 */

let html;

beforeAll(() => {
    html = fs.readFileSync(
        path.resolve(__dirname, '../public/profile.html'),
        'utf8'
    );
    document.documentElement.innerHTML = html;
});

describe('Profile HTML Structure', () => {

    describe('Navigation', () => {
        test('has nav menu bar', () => {
            expect(document.querySelector('nav.menu-bar')).not.toBeNull();
        });

        test('has logo linking to paintbar.app', () => {
            const logoLink = document.querySelector('.logo a');
            expect(logoLink).not.toBeNull();
            expect(logoLink.href).toContain('paintbar.app');
        });

        test('has profile dropdown with edit and logout', () => {
            expect(document.getElementById('editProfileBtn')).not.toBeNull();
            expect(document.getElementById('logoutBtn')).not.toBeNull();
        });
    });

    describe('Profile Sidebar', () => {
        test('has profile picture element', () => {
            expect(document.getElementById('profilePicture')).not.toBeNull();
        });

        test('has username display with skeleton loader', () => {
            const el = document.getElementById('profileUsername');
            expect(el).not.toBeNull();
            expect(el.querySelector('.skeleton-text')).not.toBeNull();
        });

        test('has display name element', () => {
            expect(document.getElementById('profileDisplayName')).not.toBeNull();
        });

        test('has bio element', () => {
            expect(document.getElementById('profileBio')).not.toBeNull();
        });

        test('has location element', () => {
            expect(document.getElementById('profileLocation')).not.toBeNull();
        });

        test('has social links container', () => {
            expect(document.getElementById('socialLinks')).not.toBeNull();
        });

        test('has HBAR address container and display span', () => {
            expect(document.getElementById('hbarAddressContainer')).not.toBeNull();
            expect(document.getElementById('hbarAddressDisplay')).not.toBeNull();
        });

        test('has stats counters for projects, gallery, and NFTs', () => {
            expect(document.getElementById('projectCount')).not.toBeNull();
            expect(document.getElementById('galleryCount')).not.toBeNull();
            expect(document.getElementById('nftCount')).not.toBeNull();
        });

        test('stats default to 0', () => {
            expect(document.getElementById('projectCount').textContent).toBe('0');
            expect(document.getElementById('galleryCount').textContent).toBe('0');
            expect(document.getElementById('nftCount').textContent).toBe('0');
        });
    });

    describe('Content Sections', () => {
        test('has three project sections with IDs', () => {
            expect(document.getElementById('projectsSection')).not.toBeNull();
            expect(document.getElementById('gallerySection')).not.toBeNull();
            expect(document.getElementById('nftsSection')).not.toBeNull();
        });

        test('each section has a project grid with ID', () => {
            expect(document.getElementById('projectsGrid')).not.toBeNull();
            expect(document.getElementById('galleryGrid')).not.toBeNull();
            expect(document.getElementById('nftsGrid')).not.toBeNull();
        });

        test('grids show skeleton loaders by default', () => {
            ['projectsGrid', 'galleryGrid', 'nftsGrid'].forEach(id => {
                const grid = document.getElementById(id);
                const skeletons = grid.querySelectorAll('.skeleton-card');
                expect(skeletons.length).toBe(3);
                skeletons.forEach(card => {
                    expect(card.querySelector('.skeleton-rect')).not.toBeNull();
                });
            });
        });
    });

    describe('Edit Profile Modal', () => {
        test('has modal element', () => {
            expect(document.getElementById('editProfileModal')).not.toBeNull();
        });

        test('has edit profile form', () => {
            expect(document.getElementById('editProfileForm')).not.toBeNull();
        });

        test('has close button', () => {
            expect(document.querySelector('.close-modal')).not.toBeNull();
        });

        test('has cancel button', () => {
            expect(document.querySelector('.cancel-button')).not.toBeNull();
        });

        test('has save button', () => {
            expect(document.querySelector('.save-button')).not.toBeNull();
        });

        describe('Basic Information fields', () => {
            test('has displayName input', () => {
                const input = document.getElementById('displayName');
                expect(input).not.toBeNull();
                expect(input.name).toBe('displayName');
            });

            test('has username input', () => {
                const input = document.getElementById('username');
                expect(input).not.toBeNull();
                expect(input.name).toBe('username');
            });

            test('has bio textarea', () => {
                const textarea = document.getElementById('bio');
                expect(textarea).not.toBeNull();
                expect(textarea.tagName.toLowerCase()).toBe('textarea');
                expect(textarea.name).toBe('bio');
            });

            test('has location input', () => {
                const input = document.getElementById('location');
                expect(input).not.toBeNull();
                expect(input.name).toBe('location');
            });

            test('has website input with url type', () => {
                const input = document.getElementById('website');
                expect(input).not.toBeNull();
                expect(input.name).toBe('website');
                expect(input.type).toBe('url');
            });
        });

        describe('Social Media fields', () => {
            test('has single githubUrl input with url type', () => {
                const input = document.getElementById('githubUrl');
                expect(input).not.toBeNull();
                expect(input.name).toBe('githubUrl');
                expect(input.type).toBe('url');
            });

            test('does NOT have multi-account github inputs', () => {
                expect(document.querySelector('input[name="githubUrl[]"]')).toBeNull();
                expect(document.querySelector('.add-account')).toBeNull();
                expect(document.querySelector('input[name="githubPrimary"]')).toBeNull();
            });

            test('has twitterHandle input', () => {
                const input = document.getElementById('twitterHandle');
                expect(input).not.toBeNull();
                expect(input.name).toBe('twitterHandle');
            });

            test('has blueskyHandle input', () => {
                const input = document.getElementById('blueskyHandle');
                expect(input).not.toBeNull();
                expect(input.name).toBe('blueskyHandle');
            });

            test('has instagramHandle input', () => {
                const input = document.getElementById('instagramHandle');
                expect(input).not.toBeNull();
                expect(input.name).toBe('instagramHandle');
            });
        });

        describe('Blockchain fields', () => {
            test('has hbarAddress input', () => {
                const input = document.querySelector('#editProfileForm #hbarAddress');
                expect(input).not.toBeNull();
                expect(input.name).toBe('hbarAddress');
            });
        });

        describe('Security section', () => {
            test('has reset password button', () => {
                expect(document.getElementById('resetPasswordBtn')).not.toBeNull();
            });
        });
    });
});
