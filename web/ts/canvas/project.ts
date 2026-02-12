// ============================================================
// ProjectManager — handles saving canvas projects to the server
// ============================================================

import { auth } from "../shared/firebase-init";
import type { PaintBar } from "./app";

/** Response from POST /api/projects */
interface CreateProjectResult {
  projectId: string;
  uploadURL?: string;
  duplicate: boolean;
}

/** Thumbnail max dimension in pixels */
const THUMBNAIL_MAX_SIZE = 256;

/**
 * ProjectManager handles the full save-project flow:
 * 1. Hash the canvas PNG blob (SHA-256)
 * 2. Generate a thumbnail
 * 3. POST /api/projects (dedup check + get signed upload URL)
 * 4. PUT the PNG blob to the signed URL
 * 5. POST /api/projects/{id}/confirm-upload
 */
export class ProjectManager {
  private paintBar: PaintBar;

  // Modal elements
  private modal: HTMLElement | null;
  private closeBtn: HTMLElement | null;
  private cancelBtn: HTMLElement | null;
  private confirmBtn: HTMLButtonElement | null;
  private openBtn: HTMLElement | null;
  private titleInput: HTMLInputElement | null;
  private tagsInput: HTMLInputElement | null;
  private publicCheckbox: HTMLInputElement | null;
  private statusEl: HTMLElement | null;

  private saving = false;
  private loadedProjectId: string | null = null;

  constructor(paintBar: PaintBar) {
    this.paintBar = paintBar;

    this.modal = document.getElementById("saveProjectModal");
    this.closeBtn = document.getElementById("closeSaveProjectBtn");
    this.cancelBtn = document.getElementById("cancelSaveProject");
    this.confirmBtn = document.getElementById(
      "confirmSaveProject",
    ) as HTMLButtonElement | null;
    this.openBtn = document.getElementById("saveProjectBtn");
    this.titleInput = document.getElementById(
      "projectTitle",
    ) as HTMLInputElement | null;
    this.tagsInput = document.getElementById(
      "projectTags",
    ) as HTMLInputElement | null;
    this.publicCheckbox = document.getElementById(
      "projectPublic",
    ) as HTMLInputElement | null;
    this.statusEl = document.getElementById("saveProjectStatus");

    this.setupEventListeners();
  }

  /**
   * Set the loaded project context so re-saves update the existing project
   * instead of creating a new one. Pre-fills the title input.
   */
  setLoadedProject(projectId: string, title: string): void {
    this.loadedProjectId = projectId;
    if (this.titleInput) this.titleInput.value = title;
  }

  private setupEventListeners(): void {
    this.openBtn?.addEventListener("click", () => this.showModal());
    this.closeBtn?.addEventListener("click", () => this.hideModal());
    this.cancelBtn?.addEventListener("click", () => this.hideModal());
    this.confirmBtn?.addEventListener("click", () => this.saveProject());
  }

  private showModal(): void {
    this.modal?.classList.remove("hidden");
    this.clearStatus();
    this.titleInput?.focus();
  }

  private hideModal(): void {
    if (this.saving) return;
    this.modal?.classList.add("hidden");
    this.clearStatus();
  }

  private setStatus(message: string, type: "info" | "success" | "error"): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.className = `save-project-status ${type}`;
    this.statusEl.classList.remove("hidden");
  }

  private clearStatus(): void {
    if (!this.statusEl) return;
    this.statusEl.className = "save-project-status hidden";
    this.statusEl.textContent = "";
  }

  private setButtonsDisabled(disabled: boolean): void {
    if (this.confirmBtn) this.confirmBtn.disabled = disabled;
    if (this.cancelBtn)
      (this.cancelBtn as HTMLButtonElement).disabled = disabled;
    if (this.closeBtn) (this.closeBtn as HTMLButtonElement).disabled = disabled;
  }

  /**
   * Get the current user's Firebase ID token for API authentication.
   */
  private async getIdToken(): Promise<string> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Not authenticated");
    }
    return user.getIdToken();
  }

  /**
   * Export the canvas (drawing + opaque background) as a PNG Blob.
   */
  private getCanvasBlob(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = this.paintBar.canvas.width;
      tempCanvas.height = this.paintBar.canvas.height;
      const ctx = tempCanvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not create temp canvas context"));
        return;
      }

      // Composite: opaque background + drawing layer
      ctx.drawImage(this.paintBar.opaqueBgCanvas, 0, 0);
      ctx.drawImage(this.paintBar.canvas, 0, 0);

      tempCanvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to export canvas as PNG"));
        }
      }, "image/png");
    });
  }

  /**
   * Compute SHA-256 hex digest of a Blob.
   */
  private async hashBlob(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Generate a base64-encoded thumbnail from the canvas.
   */
  private generateThumbnail(): string {
    const srcCanvas = this.paintBar.canvas;
    const srcBg = this.paintBar.opaqueBgCanvas;

    const scale = Math.min(
      THUMBNAIL_MAX_SIZE / srcCanvas.width,
      THUMBNAIL_MAX_SIZE / srcCanvas.height,
      1,
    );
    const w = Math.round(srcCanvas.width * scale);
    const h = Math.round(srcCanvas.height * scale);

    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = w;
    thumbCanvas.height = h;
    const ctx = thumbCanvas.getContext("2d")!;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(srcBg, 0, 0, w, h);
    ctx.drawImage(srcCanvas, 0, 0, w, h);

    return thumbCanvas.toDataURL("image/png");
  }

  /**
   * Parse comma-separated tags from the input.
   */
  private parseTags(): string[] {
    const raw = this.tagsInput?.value ?? "";
    return raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)
      .slice(0, 20);
  }

  /**
   * Main save flow.
   */
  private async saveProject(): Promise<void> {
    if (this.saving) return;

    const title = this.titleInput?.value.trim() ?? "";
    if (!title) {
      this.setStatus("Title is required.", "error");
      this.titleInput?.focus();
      return;
    }

    this.saving = true;
    this.setButtonsDisabled(true);

    try {
      // Step 1: Export canvas + hash
      this.setStatus("Preparing canvas...", "info");
      const blob = await this.getCanvasBlob();
      const contentHash = await this.hashBlob(blob);
      const thumbnailData = this.generateThumbnail();
      const tags = this.parseTags();
      const isPublic = this.publicCheckbox?.checked ?? false;

      // Step 2: Create project via API
      this.setStatus("Creating project...", "info");
      const token = await this.getIdToken();
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          contentHash,
          thumbnailData,
          width: this.paintBar.canvas.width,
          height: this.paintBar.canvas.height,
          isPublic,
          tags,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ||
            `Server error (${createRes.status})`,
        );
      }

      const result: CreateProjectResult = await createRes.json();

      if (result.duplicate) {
        this.setStatus(
          "Project already saved (duplicate detected).",
          "success",
        );
        this.saving = false;
        this.setButtonsDisabled(false);
        setTimeout(() => this.hideModal(), 1500);
        return;
      }

      // Step 3: Upload blob to signed URL (POST for emulator, PUT for production)
      if (result.uploadURL) {
        this.setStatus("Uploading canvas...", "info");
        const isEmulator = result.uploadURL.includes("uploadType=media");
        const uploadRes = await fetch(result.uploadURL, {
          method: isEmulator ? "POST" : "PUT",
          headers: { "Content-Type": "image/png" },
          body: blob,
        });

        if (!uploadRes.ok) {
          throw new Error(`Upload failed (${uploadRes.status})`);
        }

        // Step 4: Confirm upload
        this.setStatus("Confirming upload...", "info");
        const confirmRes = await fetch(
          `/api/projects/${result.projectId}/confirm-upload`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!confirmRes.ok) {
          const err = await confirmRes.json().catch(() => ({}));
          throw new Error(
            (err as { error?: string }).error ||
              `Confirm failed (${confirmRes.status})`,
          );
        }
      }

      this.setStatus("Project saved!", "success");
      setTimeout(() => this.hideModal(), 1500);
    } catch (err) {
      console.error("Save project error:", err);
      this.setStatus(
        err instanceof Error ? err.message : "Failed to save project.",
        "error",
      );
    } finally {
      this.saving = false;
      this.setButtonsDisabled(false);
    }
  }
}
