
(function() {
  try {
    var localTheme = localStorage.getItem('theme');
    // Default to 'light' if no local preference is set.
    // Only enable dark mode if explicitly set to 'dark'.
    if (localTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();
