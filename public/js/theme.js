(function () {
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function updateIcon(btn) {
    btn.textContent = currentTheme() === 'light' ? '🌙' : '☀️';
  }

  window.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;

    updateIcon(btn);

    btn.addEventListener('click', function () {
      const next = currentTheme() === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      updateIcon(btn);
    });
  });
})();
