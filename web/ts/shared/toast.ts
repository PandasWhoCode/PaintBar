// ============================================================
// Shared toast notification utility — replaces alert() calls
// ============================================================

type ToastType = "success" | "error" | "info";

const TOAST_DURATION_MS: Record<ToastType, number> = {
  success: 3000,
  error: 5000,
  info: 4000,
};

/**
 * Shows a non-blocking toast notification.
 * Removes any existing toast of the same type before showing a new one.
 */
export function showToast(message: string, type: ToastType = "info"): void {
  const className = `toast-message toast-${type}`;
  const existing = document.querySelector(`.toast-${type}`);
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = className;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), TOAST_DURATION_MS[type]);
}

/**
 * Shows a success toast notification.
 */
export function showSuccess(message: string): void {
  showToast(message, "success");
}

/**
 * Shows an error toast notification.
 */
export function showError(message: string): void {
  showToast(message, "error");
}

/**
 * Shows an info toast notification.
 */
export function showInfo(message: string): void {
  showToast(message, "info");
}

/**
 * Binds "under construction" click handlers to elements by ID.
 * Clicking any of the listed elements shows an info toast.
 */
export function bindUnderConstruction(...ids: string[]): void {
  ids.forEach((id) => {
    document.getElementById(id)?.addEventListener("click", (e) => {
      e.preventDefault();
      showInfo("\u{1F6A7} This feature is under construction. Stay tuned!");
    });
  });
}
