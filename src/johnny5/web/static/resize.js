document.addEventListener('DOMContentLoaded', () => {
  const handle = document.querySelector('.ann-toggles-resize-handle');
  const pane = document.getElementById('ann-toggles');
  const annGrid = pane?.parentElement;
  
  if (!handle || !pane || !annGrid) return;

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
      // Control the 3rd row of #ann-col directly to avoid visual overflow
      annGrid.style.gridTemplateRows = `var(--topbar-size) 1fr ${newH}px`;
      pane.style.height = '';
      pane.style.minHeight = '';
      pane.style.maxHeight = '';
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try { handle.releasePointerCapture?.(e.pointerId); } catch {}
      document.body.classList.remove('resizing');
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
});
