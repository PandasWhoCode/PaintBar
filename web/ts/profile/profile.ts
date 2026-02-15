// ============================================================
// Profile page — handles user profile, projects, gallery, NFTs
// ============================================================

import {
  auth,
  db,
  sendPasswordResetEmail,
  signOut,
} from "../shared/firebase-init";
import { showSuccess, showError } from "../shared/toast";
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
  getCountFromServer,
  type Unsubscribe,
  type DocumentData,
} from "firebase/firestore";
import type { User as FirebaseUser } from "firebase/auth";

// ---- Types ----

interface ProfileData {
  uid?: string;
  email?: string;
  username?: string;
  displayName?: string;
  bio?: string;
  location?: string;
  website?: string;
  githubUrl?: string;
  twitterHandle?: string;
  blueskyHandle?: string;
  instagramHandle?: string;
  hbarAddress?: string;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: unknown;
}

interface ProjectData {
  id: string;
  title?: string;
  thumbnailData?: string;
  storageURL?: string;
  width?: number;
  height?: number;
  isPublic?: boolean;
  tags?: string[];
  createdAt?: { seconds: number };
  [key: string]: unknown;
}

// ---- Listener state ----

let unsubscribeProfile: Unsubscribe | null = null;
let unsubscribeProjects: Unsubscribe | null = null;
let unsubscribeStats: Unsubscribe[] = [];

// ---- Cache keys ----

const PROFILE_CACHE_SUFFIX = "_profile_cache";
const PROJECTS_CACHE_SUFFIX = "_projects_cache";
const GALLERY_CACHE_SUFFIX = "_gallery_cache";
const NFTS_CACHE_SUFFIX = "_nfts_cache";

let currentUid: string | null = null;

function cacheKey(suffix: string): string | null {
  return currentUid ? `paintbar_${currentUid}${suffix}` : null;
}

function getCachedProfile(): ProfileData | null {
  try {
    const key = cacheKey(PROFILE_CACHE_SUFFIX);
    if (!key) return null;
    const cached = localStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

function setCachedProfile(userData: ProfileData): void {
  try {
    const key = cacheKey(PROFILE_CACHE_SUFFIX);
    if (key) localStorage.setItem(key, JSON.stringify(userData));
  } catch {
    /* quota exceeded */
  }
}

function clearCachedProfile(): void {
  const suffixes = [
    PROFILE_CACHE_SUFFIX,
    PROJECTS_CACHE_SUFFIX,
    GALLERY_CACHE_SUFFIX,
    NFTS_CACHE_SUFFIX,
  ];
  suffixes.forEach((suffix) => {
    const key = cacheKey(suffix);
    if (key) localStorage.removeItem(key);
  });
}

interface GridItemData {
  id: string;
  name?: string;
  title?: string;
  thumbnailData?: string;
  imageData?: string;
  createdAt?: { seconds: number };
}

function getCachedGrid(suffix: string): GridItemData[] | null {
  try {
    const key = cacheKey(suffix);
    if (!key) return null;
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    // Discard stale entries from old HTML-string cache format
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCachedGrid(suffix: string, items: GridItemData[]): void {
  try {
    const key = cacheKey(suffix);
    if (key) localStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* quota exceeded */
  }
}

function renderGridItems(
  gridId: string,
  items: GridItemData[],
  emptyLabel: string,
): void {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = "";
  if (items.length === 0) {
    const p = document.createElement("p");
    p.className = "no-projects";
    p.textContent = emptyLabel;
    grid.appendChild(p);
    return;
  }
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "project-card";
    card.dataset.itemId = item.id;

    const img = document.createElement("img");
    img.src = safeSrc(item.thumbnailData || item.imageData);
    img.alt = item.name || item.title || "Untitled";
    img.onerror = function (this: HTMLImageElement) {
      this.src = "/static/images/placeholder.png";
    };
    card.appendChild(img);

    const info = document.createElement("div");
    info.className = "project-info";
    const h3 = document.createElement("h3");
    h3.textContent = item.name || item.title || "Untitled";
    info.appendChild(h3);
    card.appendChild(info);
    grid.appendChild(card);
  });
}

// ---- Sanitization helpers ----

function sanitizeUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:")
      return parsed.href;
  } catch {
    /* invalid URL */
  }
  return "";
}

function createSafeLink(
  href: string,
  title: string,
  iconClass: string,
): HTMLAnchorElement | null {
  const safeHref = sanitizeUrl(href);
  if (!safeHref) return null;
  const a = document.createElement("a");
  a.href = safeHref;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.title = title;
  const i = document.createElement("i");
  i.className = iconClass;
  a.appendChild(i);
  return a;
}

function safeSrc(src: string | undefined): string {
  if (!src) return "/static/images/placeholder.png";
  if (src.startsWith("data:image/")) return src;
  const safe = sanitizeUrl(src);
  return safe || "/static/images/placeholder.png";
}

// ---- DOMContentLoaded ----

document.addEventListener("DOMContentLoaded", () => {
  // Update copyright year
  document.querySelectorAll(".copyright-year").forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  // Set up auth state listener
  auth.onAuthStateChanged(handleAuthStateChanged);

  // Set up form submission handler
  const form = document.getElementById("editProfileForm");
  if (form) {
    form.addEventListener("submit", handleProfileFormSubmit);
  }

  // Set up modal handlers
  const modal = document.getElementById("editProfileModal");
  const editProfileBtn = document.getElementById("editProfileBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const closeModalBtn = document.querySelector(".close-modal");
  const cancelBtn = document.querySelector(".cancel-button");

  if (editProfileBtn && modal) {
    editProfileBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const cachedData = getCachedProfile();
      if (cachedData) {
        populateFormData(cachedData);
      } else {
        populateFormFromUI();
      }
      modal.style.display = "block";
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }

  if (closeModalBtn && modal) {
    closeModalBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  if (cancelBtn && modal) {
    cancelBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  if (modal) {
    window.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.style.display = "none";
      }
    });
  }

  const resetPasswordBtn = document.getElementById("resetPasswordBtn");
  if (resetPasswordBtn) {
    resetPasswordBtn.addEventListener("click", handleResetPassword);
  }

  // "View All" links
  document.querySelectorAll(".view-all").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const section = (e.currentTarget as HTMLElement).closest(".projects-section");
      if (section?.id === "projectsSection") {
        window.location.href = "/projects";
      } else {
        showUnderConstructionBanner();
      }
    });
  });

  // Clean up on page unload
  window.addEventListener("unload", cleanupListeners);
});

// ---- Listener cleanup ----

function cleanupListeners(): void {
  if (unsubscribeProfile) {
    unsubscribeProfile();
    unsubscribeProfile = null;
  }
  if (unsubscribeProjects) {
    unsubscribeProjects();
    unsubscribeProjects = null;
  }
  unsubscribeStats.forEach((unsub) => unsub());
  unsubscribeStats = [];
}

// ---- Auth state ----

async function handleAuthStateChanged(
  user: FirebaseUser | null,
): Promise<void> {
  cleanupListeners();

  if (!user) {
    window.location.replace("/login");
    return;
  }

  currentUid = user.uid;
  const cached = getCachedProfile();
  if (cached) {
    updateProfileUI(cached);
    populateFormData(cached);
  }
  const gridCaches = [
    { suffix: PROJECTS_CACHE_SUFFIX, id: "projectsGrid" },
    { suffix: GALLERY_CACHE_SUFFIX, id: "galleryGrid" },
    { suffix: NFTS_CACHE_SUFFIX, id: "nftsGrid" },
  ];
  const gridEmptyLabels: Record<string, string> = {
    projectsGrid: "No projects yet. Start creating!",
    galleryGrid: "No gallery items yet.",
    nftsGrid: "No NFTs yet.",
  };
  gridCaches.forEach(({ suffix, id }) => {
    const cachedItems = getCachedGrid(suffix);
    if (cachedItems) {
      renderGridItems(id, cachedItems, gridEmptyLabels[id] || "");
    }
  });

  let isFirstSnapshot = true;
  const userDocRef = doc(db, "users", user.uid);

  unsubscribeProfile = onSnapshot(
    userDocRef,
    async (docSnapshot) => {
      try {
        if (!docSnapshot.exists() && isFirstSnapshot) {
          const initialUserData: ProfileData = {
            uid: user.uid,
            email: user.email || "",
            username: "",
            displayName: user.displayName || "",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await setDoc(userDocRef, initialUserData);
          isFirstSnapshot = false;
          showWelcomeModal();
          return;
        }

        if (docSnapshot.exists()) {
          const userData: ProfileData = {
            ...docSnapshot.data(),
            uid: user.uid,
          };
          setCachedProfile(userData);
          updateProfileUI(userData);
          populateFormData(docSnapshot.data());
        }

        isFirstSnapshot = false;
      } catch (error) {
        console.error("Error processing profile snapshot:", error);
      }
    },
    (error) => {
      console.error("Error in profile listener:", error);
      if (error.code === "permission-denied") {
        cleanupListeners();
        showError(
          "You do not have permission to access this profile. Please log in again.",
        );
        signOut(auth);
        window.location.replace("/login");
      }
    },
  );

  setupProjectsListener(user.uid);
  setupStatsListeners(user.uid);
}

// ---- Projects listener ----

function setupProjectsListener(uid: string): void {
  const projectsRef = collection(db, "projects");
  const q = query(
    projectsRef,
    where("userId", "==", uid),
    orderBy("createdAt", "desc"),
    limit(5),
  );

  unsubscribeProjects = onSnapshot(
    q,
    async (snapshot) => {
      const projects: ProjectData[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      updateProjectsUI(projects);

      try {
        const countQuery = query(
          collection(db, "projects"),
          where("userId", "==", uid),
        );
        const countSnapshot = await getCountFromServer(countQuery);
        const projectCountEl = document.getElementById("projectCount");
        if (projectCountEl)
          projectCountEl.textContent = String(countSnapshot.data().count);
      } catch (err) {
        console.error("Error fetching project count:", err);
      }
    },
    (error) => {
      console.error("Error in projects listener:", error);
      const projectGrid = document.getElementById("projectsGrid");
      if (projectGrid) {
        projectGrid.innerHTML =
          '<p class="no-projects">No projects yet. Start creating!</p>';
      }
      if (error.code === "permission-denied") {
        cleanupListeners();
        showError(
          "You do not have permission to access projects. Please log in again.",
        );
        signOut(auth);
        window.location.replace("/login");
      }
    },
  );
}

// ---- Profile form submission ----

async function handleProfileFormSubmit(event: Event): Promise<void> {
  event.preventDefault();

  const user = auth.currentUser;
  if (!user) {
    showError("Please log in to update your profile.");
    return;
  }

  const formData = new FormData(event.target as HTMLFormElement);
  const updates: Record<string, unknown> = {
    displayName: formData.get("displayName") || "",
    bio: formData.get("bio") || "",
    location: formData.get("location") || "",
    website: formData.get("website") || "",
    githubUrl: formData.get("githubUrl") || "",
    twitterHandle: formData.get("twitterHandle") || "",
    blueskyHandle: formData.get("blueskyHandle") || "",
    instagramHandle: formData.get("instagramHandle") || "",
    hbarAddress: formData.get("hbarAddress") || "",
    updatedAt: new Date(),
  };

  const usernameInput = document.getElementById(
    "username",
  ) as HTMLInputElement | null;
  let claimingUsername = false;
  if (usernameInput && !usernameInput.readOnly) {
    const newUsername = ((formData.get("username") as string) || "")
      .trim()
      .toLowerCase();
    if (newUsername) {
      if (!/^[a-z0-9_-]{3,30}$/.test(newUsername)) {
        showError(
          "Username must be 3-30 characters and can only contain letters, numbers, underscores, and hyphens.",
        );
        return;
      }
      const usernameDocRef = doc(db, "usernames", newUsername);
      try {
        const usernameDoc = await getDoc(usernameDocRef);
        if (usernameDoc.exists()) {
          showError("That username is already taken. Please choose another.");
          return;
        }
      } catch (error) {
        console.error("Error checking username:", error);
        showError("Could not verify username availability. Please try again.");
        return;
      }
      updates.username = newUsername;
      claimingUsername = true;
    }
  }

  // Optimistic update
  const modal = document.getElementById("editProfileModal");
  if (modal) {
    modal.style.display = "none";
  }

  const cachedData = getCachedProfile() || {};
  const merged: ProfileData = { ...cachedData, ...updates, uid: user.uid };
  setCachedProfile(merged);
  updateProfileUI(merged);
  showSuccess("Profile updated successfully!");

  // Write to Firestore in background
  try {
    const userDocRef = doc(db, "users", user.uid);
    if (claimingUsername) {
      const batch = writeBatch(db);
      const usernameDocRef = doc(db, "usernames", updates.username as string);
      batch.set(usernameDocRef, { uid: user.uid, createdAt: new Date() });
      batch.set(userDocRef, updates, { merge: true });
      await batch.commit();
    } else {
      await setDoc(userDocRef, updates, { merge: true });
    }
  } catch (error) {
    console.error("Error saving profile to server:", error);
    if (claimingUsername) {
      const reverted: ProfileData = { ...merged, username: "" };
      setCachedProfile(reverted);
      updateProfileUI(reverted);
      showError("Username could not be claimed. Please try again.");
    } else {
      showSuccess(
        "Saved locally. Will sync when connection is restored.",
      );
    }
  }
}

// ---- Stats listeners ----

function setupStatsListeners(uid: string): void {
  const statCollections = [
    {
      name: "gallery",
      gridId: "galleryGrid",
      cacheSuffix: GALLERY_CACHE_SUFFIX,
    },
    { name: "nfts", gridId: "nftsGrid", cacheSuffix: NFTS_CACHE_SUFFIX },
  ];

  statCollections.forEach(({ name, gridId, cacheSuffix }) => {
    const statsQuery = query(
      collection(db, name),
      where("userId", "==", uid),
      limit(10),
    );

    const countQ = query(collection(db, name), where("userId", "==", uid));

    const unsub = onSnapshot(
      statsQuery,
      async (snapshot) => {
        const countEl = document.getElementById(`${name}Count`);
        try {
          const countSnapshot = await getCountFromServer(countQ);
          if (countEl) countEl.textContent = String(countSnapshot.data().count);
        } catch (err) {
          console.error(`Error fetching ${name} count:`, err);
          if (countEl) countEl.textContent = String(snapshot.size);
        }

        const emptyLabel = name === "nfts" ? "No NFTs yet." : "No gallery items yet.";
        const items: GridItemData[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name,
            thumbnailData: data.thumbnailData,
            imageData: data.imageData,
          };
        });
        renderGridItems(gridId, items, emptyLabel);
        setCachedGrid(cacheSuffix, items);
      },
      (error) => {
        console.error(`Error in ${name} listener:`, error);
        renderGridItems(
          gridId,
          [],
          name === "nfts" ? "No NFTs yet." : "No gallery items yet.",
        );
      },
    );

    unsubscribeStats.push(unsub);
  });
}

// ---- UI update functions ----

function updateProfileUI(userData: ProfileData): void {
  const usernameEl = document.getElementById("profileUsername");
  if (usernameEl) {
    usernameEl.textContent = userData.username || "Choose a username";
  }

  const displayNameEl = document.getElementById("profileDisplayName");
  if (displayNameEl) {
    displayNameEl.textContent = userData.displayName || "";
    displayNameEl.style.display = userData.displayName ? "block" : "none";
  }

  const bioEl = document.getElementById("profileBio");
  if (bioEl) {
    bioEl.textContent = userData.bio || "";
    bioEl.style.display = userData.bio ? "block" : "none";
  }

  const locationEl = document.getElementById("profileLocation");
  if (locationEl) {
    if (userData.location) {
      locationEl.textContent = "";
      const icon = document.createElement("i");
      icon.className = "fas fa-map-marker-alt";
      locationEl.appendChild(icon);
      locationEl.appendChild(document.createTextNode(" " + userData.location));
      locationEl.style.display = "block";
    } else {
      locationEl.style.display = "none";
    }
  }

  const hbarAddressEl = document.getElementById("hbarAddressDisplay");
  const hbarContainerEl = document.getElementById("hbarAddressContainer");
  if (hbarAddressEl && hbarContainerEl) {
    if (userData.hbarAddress) {
      hbarAddressEl.textContent = userData.hbarAddress;
      hbarContainerEl.style.display = "flex";
    } else {
      hbarContainerEl.style.display = "none";
    }
  }

  const socialLinksEl = document.getElementById("socialLinks");
  if (socialLinksEl) {
    socialLinksEl.innerHTML = "";

    if (userData.githubUrl) {
      const link = createSafeLink(
        userData.githubUrl,
        "GitHub",
        "fab fa-github",
      );
      if (link) socialLinksEl.appendChild(link);
    }

    if (userData.twitterHandle) {
      const handle = userData.twitterHandle.startsWith("@")
        ? userData.twitterHandle.slice(1)
        : userData.twitterHandle;
      const link = createSafeLink(
        `https://twitter.com/${encodeURIComponent(handle)}`,
        "Twitter/X",
        "fab fa-x-twitter",
      );
      if (link) socialLinksEl.appendChild(link);
    }

    if (userData.blueskyHandle) {
      const handle = userData.blueskyHandle.startsWith("@")
        ? userData.blueskyHandle.slice(1)
        : userData.blueskyHandle;
      const link = createSafeLink(
        `https://bsky.app/profile/${encodeURIComponent(handle)}`,
        "Bluesky",
        "fab fa-bluesky",
      );
      if (link) socialLinksEl.appendChild(link);
    }

    if (userData.instagramHandle) {
      const handle = userData.instagramHandle.startsWith("@")
        ? userData.instagramHandle.slice(1)
        : userData.instagramHandle;
      const link = createSafeLink(
        `https://instagram.com/${encodeURIComponent(handle)}`,
        "Instagram",
        "fab fa-instagram",
      );
      if (link) socialLinksEl.appendChild(link);
    }

    if (userData.website) {
      const link = createSafeLink(userData.website, "Website", "fas fa-globe");
      if (link) socialLinksEl.appendChild(link);
    }
  }
}

function populateFormData(userData: ProfileData | DocumentData): void {
  const form = document.getElementById("editProfileForm");
  if (!form) return;

  const displayNameInput = form.querySelector(
    "#displayName",
  ) as HTMLInputElement | null;
  if (displayNameInput)
    displayNameInput.value = (userData.displayName as string) || "";

  const usernameInput = form.querySelector(
    "#username",
  ) as HTMLInputElement | null;
  if (usernameInput) {
    usernameInput.value = (userData.username as string) || "";
    if (userData.username) {
      usernameInput.readOnly = true;
      usernameInput.style.backgroundColor = "#f0f0f0";
      usernameInput.style.cursor = "not-allowed";
      usernameInput.title = "Username cannot be changed once set";
    } else {
      usernameInput.readOnly = false;
      usernameInput.style.backgroundColor = "";
      usernameInput.style.cursor = "";
      usernameInput.title = "";
    }
  }

  const githubInput = form.querySelector(
    "#githubUrl",
  ) as HTMLInputElement | null;
  if (githubInput) githubInput.value = (userData.githubUrl as string) || "";

  const twitterInput = form.querySelector(
    "#twitterHandle",
  ) as HTMLInputElement | null;
  if (twitterInput)
    twitterInput.value = (userData.twitterHandle as string) || "";

  const blueskyInput = form.querySelector(
    "#blueskyHandle",
  ) as HTMLInputElement | null;
  if (blueskyInput)
    blueskyInput.value = (userData.blueskyHandle as string) || "";

  const instagramInput = form.querySelector(
    "#instagramHandle",
  ) as HTMLInputElement | null;
  if (instagramInput)
    instagramInput.value = (userData.instagramHandle as string) || "";

  const bioInput = form.querySelector("#bio") as HTMLTextAreaElement | null;
  if (bioInput) bioInput.value = (userData.bio as string) || "";

  const locationInput = form.querySelector(
    "#location",
  ) as HTMLInputElement | null;
  if (locationInput) locationInput.value = (userData.location as string) || "";

  const websiteInput = form.querySelector(
    "#website",
  ) as HTMLInputElement | null;
  if (websiteInput) websiteInput.value = (userData.website as string) || "";

  const hbarInput = form.querySelector(
    "#hbarAddress",
  ) as HTMLInputElement | null;
  if (hbarInput) hbarInput.value = (userData.hbarAddress as string) || "";
}

function populateFormFromUI(): void {
  const form = document.getElementById("editProfileForm");
  if (!form) return;

  const displayName = document.getElementById("profileDisplayName");
  const bio = document.getElementById("profileBio");
  const locationEl = document.getElementById("profileLocation");
  const hbar = document.getElementById("hbarAddressDisplay");

  const usernameInput = form.querySelector(
    "#username",
  ) as HTMLInputElement | null;
  const usernameEl = document.getElementById("profileUsername");
  if (usernameInput && usernameEl) {
    const text = usernameEl.textContent?.trim() || "";
    if (text && !text.includes("\u00a0") && text !== "Choose a username") {
      usernameInput.value = text;
      usernameInput.readOnly = true;
      usernameInput.title = "Username cannot be changed once set";
    } else {
      usernameInput.value = "";
      usernameInput.readOnly = false;
      usernameInput.title = "";
    }
  }

  const displayNameInput = form.querySelector(
    "#displayName",
  ) as HTMLInputElement | null;
  if (displayNameInput && displayName)
    displayNameInput.value = displayName.textContent?.trim() || "";

  const bioInput = form.querySelector("#bio") as HTMLTextAreaElement | null;
  if (bioInput && bio) bioInput.value = bio.textContent?.trim() || "";

  const locationInput = form.querySelector(
    "#location",
  ) as HTMLInputElement | null;
  if (locationInput && locationEl) {
    const locText = locationEl.textContent?.trim() || "";
    if (locText) locationInput.value = locText;
  }

  const hbarInput = form.querySelector(
    "#hbarAddress",
  ) as HTMLInputElement | null;
  if (hbarInput && hbar) hbarInput.value = hbar.textContent?.trim() || "";

  // Social links: read href attributes from rendered links
  const socialLinks = document.getElementById("socialLinks");
  if (socialLinks) {
    const links = socialLinks.querySelectorAll("a");
    links.forEach((link) => {
      const href = link.getAttribute("href") || "";
      let hostname = "";
      try {
        hostname = new URL(href).hostname;
      } catch {
        return;
      }
      if (hostname === "github.com" || hostname === "www.github.com") {
        const gi = form.querySelector("#githubUrl") as HTMLInputElement | null;
        if (gi) gi.value = href;
      } else if (
        ["twitter.com", "www.twitter.com", "x.com", "www.x.com"].includes(
          hostname,
        )
      ) {
        const ti = form.querySelector(
          "#twitterHandle",
        ) as HTMLInputElement | null;
        if (ti) ti.value = href.split("/").pop() || "";
      } else if (hostname === "bsky.app" || hostname === "www.bsky.app") {
        const bi = form.querySelector(
          "#blueskyHandle",
        ) as HTMLInputElement | null;
        if (bi) bi.value = href.split("/").pop() || "";
      } else if (
        hostname === "instagram.com" ||
        hostname === "www.instagram.com"
      ) {
        const ii = form.querySelector(
          "#instagramHandle",
        ) as HTMLInputElement | null;
        if (ii) ii.value = href.split("/").pop() || "";
      } else if (link.querySelector(".fa-globe")) {
        const wi = form.querySelector("#website") as HTMLInputElement | null;
        if (wi) wi.value = href;
      }
    });
  }
}

// ---- Projects UI ----

function updateProjectsUI(projects: ProjectData[]): void {
  const projectGrid = document.getElementById("projectsGrid");
  if (!projectGrid) return;

  projectGrid.innerHTML = "";
  if (projects.length === 0) {
    const p = document.createElement("p");
    p.className = "no-projects";
    p.textContent = "No projects yet. Start creating!";
    projectGrid.appendChild(p);
  } else {
    projects.forEach((project) => {
      const card = document.createElement("div");
      card.className = "project-card";
      card.dataset.projectId = project.id;

      const img = document.createElement("img");
      img.src = safeSrc(project.thumbnailData);
      img.alt = project.title || "Untitled";
      img.onerror = function (this: HTMLImageElement) {
        this.src = "/static/images/placeholder.png";
      };
      card.appendChild(img);

      const info = document.createElement("div");
      info.className = "project-info";
      const h3 = document.createElement("h3");
      h3.textContent = project.title || "Untitled";
      info.appendChild(h3);
      if (project.createdAt) {
        const dateSpan = document.createElement("span");
        dateSpan.className = "project-date";
        dateSpan.textContent = new Date(
          project.createdAt.seconds * 1000,
        ).toLocaleDateString();
        info.appendChild(dateSpan);
      }
      card.appendChild(info);

      // Action buttons
      const actions = document.createElement("div");
      actions.className = "project-actions";

      const openBtn = document.createElement("button");
      openBtn.className = "project-action-btn open-btn";
      openBtn.textContent = "Open";
      openBtn.title = "Open in canvas";
      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.location.href = `/canvas?project=${encodeURIComponent(project.title || "Untitled")}`;
      });
      actions.appendChild(openBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "project-action-btn delete-btn";
      deleteBtn.textContent = "Delete";
      deleteBtn.title = "Delete project";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleDeleteProject(project.id, project.title || "Untitled");
      });
      actions.appendChild(deleteBtn);

      card.appendChild(actions);
      projectGrid.appendChild(card);
    });
  }

  // Cache structured data, not raw HTML
  const cacheItems: GridItemData[] = projects.map((p) => ({
    id: p.id,
    title: p.title,
    thumbnailData: p.thumbnailData,
    createdAt: p.createdAt,
  }));
  setCachedGrid(PROJECTS_CACHE_SUFFIX, cacheItems);
}

async function handleDeleteProject(
  projectId: string,
  title: string,
): Promise<void> {
  const safeTitle = title.replace(/[\x00-\x1f\x7f-\x9f]/g, "").slice(0, 50);
  if (!confirm(`Delete "${safeTitle}"? This cannot be undone.`)) return;

  const user = auth.currentUser;
  if (!user) return;

  try {
    const token = await user.getIdToken();
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        (err as { error?: string }).error || `Delete failed (${res.status})`,
      );
    }
    showSuccess(`"${title}" deleted.`);
  } catch (err) {
    console.error("Delete project error:", err);
    showError(`Failed to delete project: ${(err as Error).message}`);
  }
}

// ---- Logout ----

async function handleLogout(e: Event): Promise<void> {
  e.preventDefault();

  try {
    cleanupListeners();
    clearCachedProfile();
    await signOut(auth);
    window.location.replace("/login");
  } catch (error) {
    console.error("Error signing out:", error);
    showError("Failed to sign out. Please try again.");
  }
}

// ---- Password reset ----

async function handleResetPassword(): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) return;

  try {
    await sendPasswordResetEmail(auth, user.email);
    showSuccess("Password reset email sent. Please check your inbox.");
  } catch (error) {
    console.error("Error sending reset email:", error);
    showError("Failed to send reset email. Please try again.");
  }
}

// ---- Welcome modal ----

function showWelcomeModal(): void {
  const modal = document.getElementById("editProfileModal");
  if (!modal) return;

  const modalHeader = modal.querySelector(".modal-header h2");
  if (modalHeader) {
    modalHeader.textContent = "Welcome to PaintBar! Complete Your Profile";
  }

  modal.style.display = "block";

  const restoreHeader = (): void => {
    if (modalHeader) {
      modalHeader.textContent = "Edit Profile";
    }
  };

  const closeBtn = modal.querySelector(".close-modal");
  const cancelBtn = modal.querySelector(".cancel-button");

  if (closeBtn) {
    closeBtn.addEventListener("click", restoreHeader, { once: true });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener("click", restoreHeader, { once: true });
  }
}

// ---- Banner ----

function showUnderConstructionBanner(): void {
  const existing = document.querySelector(".under-construction-banner");
  if (existing) return;

  const banner = document.createElement("div");
  banner.className = "under-construction-banner";
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.innerHTML = `
    <span>🚧 Under Construction — This feature is coming soon!</span>
    <button class="banner-close" aria-label="Close">&times;</button>
  `;
  document.body.prepend(banner);

  banner
    .querySelector(".banner-close")
    ?.addEventListener("click", () => banner.remove());
  setTimeout(() => banner.remove(), 5000);
}
