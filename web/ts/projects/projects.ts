// ============================================================
// Projects page — displays all user projects in a full grid
// ============================================================

import { auth, db, signOut } from "../shared/firebase-init";
import { showSuccess, showError, bindUnderConstruction } from "../shared/toast";
import { applyProfileImage } from "../shared/gravatar";
import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  orderBy,
  type Unsubscribe,
} from "firebase/firestore";
import type { User as FirebaseUser } from "firebase/auth";

// ---- Types ----

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

let unsubscribeProjects: Unsubscribe | null = null;
let unsubscribeUserProfile: Unsubscribe | null = null;

// ---- Cache ----

const PROJECTS_CACHE_KEY_PREFIX = "paintbar_projects_all_";
let currentUid: string | null = null;

function cacheKey(): string | null {
  return currentUid ? `${PROJECTS_CACHE_KEY_PREFIX}${currentUid}` : null;
}

function getCachedProjects(): ProjectData[] | null {
  try {
    const key = cacheKey();
    if (!key) return null;
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCachedProjects(projects: ProjectData[]): void {
  try {
    const key = cacheKey();
    if (key) localStorage.setItem(key, JSON.stringify(projects));
  } catch {
    /* quota exceeded */
  }
}

function clearCache(): void {
  const key = cacheKey();
  if (key) localStorage.removeItem(key);
}

// ---- Sanitization helpers ----

function safeSrc(src: string | undefined): string {
  if (!src) return "/static/images/placeholder.png";
  if (src.startsWith("data:image/")) return src;
  try {
    const parsed = new URL(src);
    if (parsed.protocol === "http:" || parsed.protocol === "https:")
      return parsed.href;
  } catch {
    /* invalid URL */
  }
  return "/static/images/placeholder.png";
}

// ---- Auth state ----

function handleAuthStateChanged(user: FirebaseUser | null): void {
  if (!user) {
    cleanupListeners();
    window.location.replace("/login");
    return;
  }

  currentUid = user.uid;

  // Listen for profile changes to update nav Gravatar
  setupNavProfileListener(user.uid, user.email || "");

  // Render from cache immediately
  const cached = getCachedProjects();
  if (cached) {
    renderProjects(cached);
  }

  // Set up real-time listener (no limit — show all projects)
  setupProjectsListener(user.uid);
}

// ---- Projects listener ----

function setupProjectsListener(uid: string): void {
  const projectsRef = collection(db, "projects");
  const q = query(
    projectsRef,
    where("userId", "==", uid),
    orderBy("createdAt", "desc"),
  );

  unsubscribeProjects = onSnapshot(
    q,
    (snapshot) => {
      const projects: ProjectData[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      renderProjects(projects);

      // Cache structured data
      const cacheItems: ProjectData[] = projects.map((p) => ({
        id: p.id,
        title: p.title,
        thumbnailData: p.thumbnailData,
        createdAt: p.createdAt,
      }));
      setCachedProjects(cacheItems);
    },
    (error) => {
      console.error("Error in projects listener:", error);
      const grid = document.getElementById("projectsGrid");
      if (grid) {
        grid.innerHTML =
          '<p class="no-projects">Failed to load projects.</p>';
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

// ---- Render ----

function renderProjects(projects: ProjectData[]): void {
  const grid = document.getElementById("projectsGrid");
  if (!grid) return;

  grid.innerHTML = "";
  if (projects.length === 0) {
    const p = document.createElement("p");
    p.className = "no-projects";
    p.textContent = "No projects yet. Start creating!";
    grid.appendChild(p);
    return;
  }

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
    grid.appendChild(card);
  });
}

// ---- Delete ----

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
    clearCache();
    await signOut(auth);
    window.location.replace("/login");
  } catch (error) {
    console.error("Error signing out:", error);
    showError("Failed to sign out. Please try again.");
  }
}

// ---- Cleanup ----

function setupNavProfileListener(uid: string, email: string): void {
  const userDocRef = doc(db, "users", uid);
  unsubscribeUserProfile = onSnapshot(
    userDocRef,
    (snapshot) => {
      const navPic = document.querySelector(".nav-profile-pic") as HTMLImageElement | null;
      if (!navPic) return;
      const useGravatar = snapshot.exists() && snapshot.data()?.useGravatar === true;
      applyProfileImage(navPic, email, useGravatar, 80);
    },
    (error) => {
      console.error("Error in nav profile listener:", error);
    },
  );
}

function cleanupListeners(): void {
  if (unsubscribeProjects) {
    unsubscribeProjects();
    unsubscribeProjects = null;
  }
  if (unsubscribeUserProfile) {
    unsubscribeUserProfile();
    unsubscribeUserProfile = null;
  }
}

// ---- DOMContentLoaded ----

document.addEventListener("DOMContentLoaded", () => {
  // Under construction menu items
  bindUnderConstruction("publicGalleryBtn", "paintbarNftsBtn");

  // Set up auth state listener
  auth.onAuthStateChanged(handleAuthStateChanged);

  // Logout button
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }

  // Clean up on page unload
  window.addEventListener("unload", cleanupListeners);
});
