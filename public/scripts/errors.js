// Warn user before page refresh or close
window.addEventListener('beforeunload', function(e) {
        e.preventDefault();
        e.returnValue = 'All changes will be lost on reload';
        return 'All changes will be lost on reload';
});
