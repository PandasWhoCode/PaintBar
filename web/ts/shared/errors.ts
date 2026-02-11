// ============================================================
// Warn user before page refresh or close (canvas unsaved work)
// ============================================================

window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
  e.preventDefault();
  e.returnValue = 'All changes will be lost on reload';
  return 'All changes will be lost on reload';
});
