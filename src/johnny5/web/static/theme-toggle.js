// Theme toggle controller extracted from app.js
(function(global){
  const ThemeToggle = {
    init(viewer) {
      const indicator = document.getElementById('color-mode-selector');
      if (!indicator) return;
      indicator.innerHTML = '';
      const glyph = document.createElement('div');
      glyph.className = 'theme-glyph';
      indicator.appendChild(glyph);
      viewer.themeGlyph = glyph;
      const status = document.createElement('span');
      status.className = 'indicator-status';
      indicator.appendChild(status);
      const baseTitle = 'Toggle color scheme (light/dark/debug)';
      indicator.dataset.defaultTitle = baseTitle;
      indicator.title = baseTitle;
      indicator.setAttribute('role', 'button');
      indicator.tabIndex = 0;
      const initialMode = document.body.dataset.initialTheme || 'debug';
      this.applyTheme(viewer, initialMode);
      this.updateThemeGlyph(viewer, initialMode);
      indicator.addEventListener('click', () => {
        this.toggleTheme(viewer);
      });
      indicator.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.toggleTheme(viewer);
        }
      });
      this.setIndicatorReady();
    },
    applyTheme(viewer, mode) {
      const body = document.body;
      body.classList.remove('light-mode', 'dark-mode', 'debug-colors');
      let colorLink = document.querySelector('link[href*="/css/color/"]');
      if (!colorLink) {
        colorLink = document.createElement('link');
        colorLink.rel = 'stylesheet';
        const baseLink = document.querySelector('link[href="/static/css/0_layout.css"]');
        if (baseLink) {
          baseLink.insertAdjacentElement('afterend', colorLink);
        } else {
          document.head.appendChild(colorLink);
        }
      }
      colorLink.href = `/static/css/color/${mode}.css`;
      if (mode === 'light') {
        body.classList.add('light-mode');
      } else if (mode === 'debug') {
        body.classList.add('debug-colors');
      } else {
        body.classList.add('dark-mode');
      }
      this.updateThemeGlyph(viewer, mode);
    },
    toggleTheme(viewer) {
      const body = document.body;
      let currentMode = 'dark';
      if (body.classList.contains('light-mode')) currentMode = 'light';
      else if (body.classList.contains('debug-colors')) currentMode = 'debug';
      const nextMode = currentMode === 'light' ? 'dark' : (currentMode === 'dark' ? 'debug' : 'light');
      this.applyTheme(viewer, nextMode);
    },
    updateThemeGlyph(viewer, mode) {
      if (!viewer || !viewer.themeGlyph) return;
      if (mode === 'light') viewer.themeGlyph.textContent = '☀';
      else if (mode === 'debug') viewer.themeGlyph.textContent = '🐛';
      else viewer.themeGlyph.textContent = '☾';
    },
    ensureIndicatorStatusElement() {
      const indicator = document.getElementById('color-mode-selector');
      if (!indicator) return null;
      let status = indicator.querySelector('.indicator-status');
      if (!status) {
        status = document.createElement('span');
        status.className = 'indicator-status';
        indicator.appendChild(status);
      }
      return status;
    },
    setIndicatorLoading(message) {
      const indicator = document.getElementById('color-mode-selector');
      if (indicator) {
        const status = this.ensureIndicatorStatusElement();
        if (status) status.textContent = '⋯';
        const label = message || 'Loading…';
        indicator.title = label;
        indicator.classList.add('loading');
        indicator.classList.remove('error', 'ready');
      }
    },
    setIndicatorReady() {
      const indicator = document.getElementById('color-mode-selector');
      if (indicator) {
        const status = this.ensureIndicatorStatusElement();
        if (status) status.textContent = '';
        const baseTitle = indicator.dataset.defaultTitle || 'Toggle light/dark mode';
        indicator.title = baseTitle;
        indicator.classList.add('ready');
        indicator.classList.remove('loading', 'error');
      }
    },
    setIndicatorError(message) {
      const indicator = document.getElementById('color-mode-selector');
      if (indicator) {
        const status = this.ensureIndicatorStatusElement();
        if (status) status.textContent = '!';
        indicator.title = message || 'An error occurred';
        indicator.classList.add('error');
        indicator.classList.remove('loading', 'ready');
      }
    }
  };
  global.ThemeToggle = ThemeToggle;
})(window);
