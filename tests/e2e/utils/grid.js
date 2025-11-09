/**
 * Shared helpers for interacting with the PDF grid overlay during Playwright tests.
 * These helpers run inside the browser context via page.evaluate to avoid duplicating
 * canvas sampling logic across specs.
 */

// Helper function to check if a pixel is part of the grid
// Defined here for reference, but inlined in each function for serialization
function isGridPixel(R, G, B, A) {
  if (A === 0) return false;
  const isGray = Math.abs(R - G) <= 5 && Math.abs(G - B) <= 5 && R < 230;
  const isRed = R > 180 && G < 100 && B < 100;
  const isCyan = R < 120 && G > 170 && B > 170;
  const isGreen = R < 120 && G > 170 && B < 120;
  return isGray || isRed || isCyan || isGreen;
}

function rowHasGridFn({ absoluteY, left, right, containerId = 'pdf-grid' }) {
  function isGridPixel(R, G, B, A) {
    if (A === 0) return false;
    const isGray = Math.abs(R - G) <= 5 && Math.abs(G - B) <= 5 && R < 230;
    const isRed = R > 180 && G < 100 && B < 100;
    const isCyan = R < 120 && G > 170 && B > 170;
    const isGreen = R < 120 && G > 170 && B < 120;
    return isGray || isRed || isCyan || isGreen;
  }
  const container = document.getElementById(containerId);
  if (!container) return false;
  const canvases = Array.from(container.querySelectorAll('canvas'));
  if (!canvases.length) return false;
  for (const canvas of canvases) {
    const rect = canvas.getBoundingClientRect();
    if (absoluteY < rect.top || absoluteY > rect.bottom) continue;
    const ctx = canvas.getContext('2d');
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const sampleLeft = Math.max(rect.left, left);
    const sampleRight = Math.min(rect.right, right);
    if (sampleRight <= sampleLeft) continue;
    const sx = Math.max(0, Math.floor((sampleLeft - rect.left) * scaleX));
    const ex = Math.min(canvas.width, Math.ceil((sampleRight - rect.left) * scaleX));
    const centerY = Math.round((absoluteY - rect.top) * scaleY);
    const sampleHeight = Math.max(1, Math.round(scaleY * 2) + 1);
    const sy = Math.max(0, Math.min(canvas.height - sampleHeight, centerY - Math.floor(sampleHeight / 2)));
    const width = Math.max(1, ex - sx);
    const rowData = ctx.getImageData(sx, sy, width, sampleHeight).data;
    for (let i = 0; i < rowData.length; i += 4) {
      if (rowData[i + 3] > 0) return true;
    }
  }
  return false;
}

function columnHasGridFn({ absoluteX, top, bottom, containerId = 'pdf-grid' }) {
  function isGridPixel(R, G, B, A) {
    if (A === 0) return false;
    const isGray = Math.abs(R - G) <= 5 && Math.abs(G - B) <= 5 && R < 230;
    const isRed = R > 180 && G < 100 && B < 100;
    const isCyan = R < 120 && G > 170 && B > 170;
    const isGreen = R < 120 && G > 170 && B < 120;
    return isGray || isRed || isCyan || isGreen;
  }
  const container = document.getElementById(containerId);
  if (!container) return false;
  const canvases = Array.from(container.querySelectorAll('canvas'));
  if (!canvases.length) return false;
  for (const canvas of canvases) {
    const rect = canvas.getBoundingClientRect();
    if (absoluteX < rect.left || absoluteX > rect.right) continue;
    const ctx = canvas.getContext('2d');
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const sampleTop = Math.max(rect.top, top);
    const sampleBottom = Math.min(rect.bottom, bottom);
    if (sampleBottom <= sampleTop) continue;
    const sy = Math.max(0, Math.floor((sampleTop - rect.top) * scaleY));
    const ey = Math.min(canvas.height, Math.ceil((sampleBottom - rect.top) * scaleY));
    const centerX = Math.round((absoluteX - rect.left) * scaleX);
    const sampleWidth = Math.max(1, Math.round(scaleX * 2) + 1);
    const sx = Math.max(0, Math.min(canvas.width - sampleWidth, centerX - Math.floor(sampleWidth / 2)));
    const colData = ctx.getImageData(sx, sy, sampleWidth, Math.max(1, ey - sy)).data;
    for (let i = 0; i < colData.length; i += 4) {
      if (colData[i + 3] > 0) return true;
    }
  }
  return false;
}

function hasGridPixelFn({ x, y, padding = 0, containerId = 'pdf-grid' }) {
  function isGridPixel(R, G, B, A) {
    if (A === 0) return false;
    const isGray = Math.abs(R - G) <= 5 && Math.abs(G - B) <= 5 && R < 230;
    const isRed = R > 180 && G < 100 && B < 100;
    const isCyan = R < 120 && G > 170 && B > 170;
    const isGreen = R < 120 && G > 170 && B < 120;
    return isGray || isRed || isCyan || isGreen;
  }
  const container = document.getElementById(containerId);
  if (!container) return false;
  const canvases = Array.from(container.querySelectorAll('canvas'));
  if (!canvases.length) return false;
  for (const canvas of canvases) {
    const rect = canvas.getBoundingClientRect();
    if (x < rect.left - padding || x > rect.right + padding) continue;
    if (y < rect.top - padding || y > rect.bottom + padding) continue;
    const ctx = canvas.getContext('2d');
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const localX = Math.max(0, Math.min(canvas.width - 1, Math.round((x - rect.left) * scaleX)));
    const localY = Math.max(0, Math.min(canvas.height - 1, Math.round((y - rect.top) * scaleY)));
    const size = Math.max(1, Math.round(padding * Math.max(scaleX, scaleY) * 2) + 1);
    const half = Math.floor(size / 2);
    const sx = Math.max(0, localX - half);
    const sy = Math.max(0, localY - half);
    const width = Math.min(canvas.width - sx, size);
    const height = Math.min(canvas.height - sy, size);
    const data = ctx.getImageData(sx, sy, width, height).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0 && isGridPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        return true;
      }
    }
  }
  return false;
}

function sampleGridAreaFn({ x, y, width = 1, height = 1, containerId = 'pdf-grid' }) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  const canvases = Array.from(container.querySelectorAll('canvas'));
  if (!canvases.length) return null;
  for (const canvas of canvases) {
    const rect = canvas.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
    const ctx = canvas.getContext('2d');
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const sx = Math.max(0, Math.round((x - rect.left) * scaleX - (width * scaleX) / 2));
    const sy = Math.max(0, Math.round((y - rect.top) * scaleY - (height * scaleY) / 2));
    const w = Math.max(1, Math.round(width * scaleX));
    const h = Math.max(1, Math.round(height * scaleY));
    const clampedW = Math.min(canvas.width - sx, w);
    const clampedH = Math.min(canvas.height - sy, h);
    if (clampedW <= 0 || clampedH <= 0) continue;
    const image = ctx.getImageData(sx, sy, clampedW, clampedH);
    return {
      data: Array.from(image.data),
      width: image.width,
      height: image.height,
    };
  }
  return null;
}

function findHorizontalGridLineFn({ searchTop = 0, searchBottom = Number.POSITIVE_INFINITY, containerId = 'pdf-grid' }) {
  function isGridPixel(R, G, B, A) {
    if (A === 0) return false;
    const isGray = Math.abs(R - G) <= 5 && Math.abs(G - B) <= 5 && R < 230;
    const isRed = R > 180 && G < 100 && B < 100;
    const isCyan = R < 120 && G > 170 && B > 170;
    const isGreen = R < 120 && G > 170 && B < 120;
    return isGray || isRed || isCyan || isGreen;
  }
  const container = document.getElementById(containerId);
  if (!container) return null;
  const canvases = Array.from(container.querySelectorAll('canvas'));
  if (!canvases.length) return null;
  for (const canvas of canvases) {
    const rect = canvas.getBoundingClientRect();
    const top = Math.max(rect.top, searchTop);
    const bottom = Math.min(rect.bottom, searchBottom);
    if (bottom <= top) continue;
    const ctx = canvas.getContext('2d');
    const scaleY = canvas.height / rect.height;
    const scaleX = canvas.width / rect.width;
    const startY = Math.max(0, Math.floor((top - rect.top) * scaleY));
    const endY = Math.min(canvas.height, Math.ceil((bottom - rect.top) * scaleY));
    for (let row = startY; row < endY; row += Math.max(1, Math.floor(scaleY))) {
      const data = ctx.getImageData(0, row, canvas.width, 1).data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0 && isGridPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) {
          const xPx = (i / 4) / scaleX + rect.left;
          const yPx = row / scaleY + rect.top;
          return { x: xPx, y: yPx };
        }
      }
    }
  }
  return null;
}

function findVerticalGridLineFn({ searchLeft = 0, searchRight = Number.POSITIVE_INFINITY, containerId = 'pdf-grid' }) {
  function isGridPixel(R, G, B, A) {
    if (A === 0) return false;
    const isGray = Math.abs(R - G) <= 5 && Math.abs(G - B) <= 5 && R < 230;
    const isRed = R > 180 && G < 100 && B < 100;
    const isCyan = R < 120 && G > 170 && B > 170;
    const isGreen = R < 120 && G > 170 && B < 120;
    return isGray || isRed || isCyan || isGreen;
  }
  const container = document.getElementById(containerId);
  if (!container) return null;
  const canvases = Array.from(container.querySelectorAll('canvas'));
  if (!canvases.length) return null;
  for (const canvas of canvases) {
    const rect = canvas.getBoundingClientRect();
    const left = Math.max(rect.left, searchLeft);
    const right = Math.min(rect.right, searchRight);
    if (right <= left) continue;
    const ctx = canvas.getContext('2d');
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const startX = Math.max(0, Math.floor((left - rect.left) * scaleX));
    const endX = Math.min(canvas.width, Math.ceil((right - rect.left) * scaleX));
    for (let col = startX; col < endX; col += Math.max(1, Math.floor(scaleX))) {
      const data = ctx.getImageData(col, 0, 1, canvas.height).data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0 && isGridPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) {
          const yPx = (i / 4) / scaleY + rect.top;
          const xPx = col / scaleX + rect.left;
          return { x: xPx, y: yPx };
        }
      }
    }
  }
  return null;
}

function waitForGridReadyFn(containerId = 'pdf-grid') {
  const container = document.getElementById(containerId);
  return !!(container && container.querySelector('canvas'));
}

module.exports = {
  waitForGridReady: async (page, timeout = 10000, containerId = 'pdf-grid') => {
    await page.waitForSelector(`#${containerId}`, { timeout });
    await page.waitForFunction(waitForGridReadyFn, containerId, { timeout });
  },
  rowHasGrid: (page, args) => page.evaluate(rowHasGridFn, args),
  columnHasGrid: (page, args) => page.evaluate(columnHasGridFn, args),
  hasGridPixel: (page, args) => page.evaluate(hasGridPixelFn, args),
  sampleGridArea: (page, args) => page.evaluate(sampleGridAreaFn, args),
  findHorizontalGridLine: (page, args = {}) => page.evaluate(findHorizontalGridLineFn, args),
  findVerticalGridLine: (page, args = {}) => page.evaluate(findVerticalGridLineFn, args),
};
