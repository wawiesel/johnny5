document.addEventListener('DOMContentLoaded', () => {
  const attachTopEdgeResize = (handleSelector, targetSelector) => {
    document.querySelectorAll(handleSelector).forEach(handle => {
      const pane = handle.closest(targetSelector);
      if (!pane) return;
      // Find the scrolling content container inside the pane
      const scrollEl = pane.querySelector('.pdf-log-scroll-container, .rec-log-content, .log-scroll-container');
      const isAnn = targetSelector === '#ann-toggles';
      const annGrid = isAnn ? pane.parentElement : null;

      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const startY = e.clientY;
        const startH = pane.getBoundingClientRect().height;
        const minH = 25;
        const maxH = Math.max(minH, Math.floor(window.innerHeight * 0.9));
        handle.setPointerCapture?.(e.pointerId);
        document.body.classList.add('resizing');

        const onMove = (ev) => {
          const dy = ev.clientY - startY;
          let newH = startH - dy; // drag up decreases height; down increases
          if (newH < minH) newH = minH;
          if (newH > maxH) newH = maxH;
          if (isAnn && annGrid) {
            // Control the 3rd row of #ann-col directly to avoid visual overflow
            annGrid.style.gridTemplateRows = `var(--topbar-size) 1fr ${newH}px`;
            pane.style.height = '';
            pane.style.minHeight = '';
            pane.style.maxHeight = '';
          } else {
            pane.style.height = newH + 'px';
            // For CSS Grid items, also constrain via min/max to ensure track respects item size
            pane.style.minHeight = newH + 'px';
            pane.style.maxHeight = newH + 'px';
          }
          // Keep latest line in view (stick to bottom)
          if (scrollEl) {
            scrollEl.scrollTop = scrollEl.scrollHeight;
          }
        };

        const onUp = (ev) => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          try { handle.releasePointerCapture?.(e.pointerId); } catch {}
          if (!isAnn) {
            // Remove max constraint to allow future growth
            const finalH = pane.getBoundingClientRect().height;
            pane.style.minHeight = finalH + 'px';
            pane.style.maxHeight = '';
          }
          if (scrollEl) {
            scrollEl.scrollTop = scrollEl.scrollHeight;
          }
          document.body.classList.remove('resizing');
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    });
  };

  // PDF log
  attachTopEdgeResize('.pdf-log-resize-handle', '#pdf-log');
  // REC log
  attachTopEdgeResize('.rec-log-resize-handle', '#rec-log');
  // ANN toggles
  attachTopEdgeResize('.ann-toggles-resize-handle', '#ann-toggles');
});


