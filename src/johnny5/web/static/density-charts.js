/* exported DensityCharts */
// Johnny5 Density Charts Module

/**
 * Manages rendering and scrolling of density charts for the web viewer
 */
class DensityCharts {
    constructor(viewer) {
        this.viewer = viewer;
        this.isSyncing = false;
    }

    syncYDensityScroll() {
        const pdfScroller = document.getElementById('pdf-scroller');
        const yDensity = document.getElementById('y-density');
        const xDensity = document.getElementById('x-density');
        
        if (!pdfScroller || !yDensity) return;
        
        let isSyncing = false;
        
        // Sync y-density scroll with pdf-scroller (one-way: pdf -> y-density)
        pdfScroller.addEventListener('scroll', () => {
            if (isSyncing) return;
            
            requestAnimationFrame(() => {
                // Since renderYDensityChart sets the canvas height to match the
                // total PDF scrollHeight, we can just map the scrollTop directly.
                isSyncing = true;
                yDensity.scrollTop = pdfScroller.scrollTop;
                
                // Sync horizontal scroll of x-density with pdf-scroller
                if (xDensity) {
                    xDensity.scrollLeft = pdfScroller.scrollLeft;
                }
                
                requestAnimationFrame(() => {
                    isSyncing = false;
                });
            });
        });
    }


    renderXDensityChart(densityData) {
        const canvas = document.getElementById('x-density-chart');
        if (!canvas) return;
        
        // Get the actual width of the current page's canvas
        const pageNum = this.viewer.currentPage;
        const pageWrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);
        if (!pageWrapper) return;
        
        const pageCanvas = pageWrapper.querySelector('canvas');
        if (!pageCanvas) return;
        
        const actualPageWidth = parseFloat(pageCanvas.style.width);
        
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio;
        
        canvas.width = actualPageWidth * dpr;
        canvas.height = canvas.offsetHeight * dpr;
        ctx.scale(dpr, dpr);
        
        const data = densityData.x;
        if (!data || data.length === 0) return;
        
        const maxValue = Math.max(...data);
        const barWidth = actualPageWidth / data.length;
        
        ctx.clearRect(0, 0, actualPageWidth, canvas.offsetHeight);
        ctx.fillStyle = '#4CAF50';
        
        data.forEach((value, index) => {
            const barHeight = (value / maxValue) * canvas.offsetHeight;
            const x = index * barWidth;
            const y = canvas.offsetHeight - barHeight;
            
            ctx.fillRect(x, y, barWidth, barHeight);
        });
        
        canvas.style.width = actualPageWidth + 'px';
    }

    renderXDensityRightChart(densityData) {
        const canvas = document.getElementById('x-density-right-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        canvas.width = canvas.offsetWidth * window.devicePixelRatio;
        canvas.height = canvas.offsetHeight * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        
        const data = densityData.x;
        if (!data || data.length === 0) return;
        
        const maxValue = Math.max(...data);
        const barWidth = canvas.offsetWidth / data.length;
        
        ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
        ctx.fillStyle = '#4CAF50';
        
        data.forEach((value, index) => {
            const barHeight = (value / maxValue) * canvas.offsetHeight;
            const x = index * barWidth;
            const y = canvas.offsetHeight - barHeight;
            
            ctx.fillRect(x, y, barWidth, barHeight);
        });
    }


    /**
     * Renders charts that update as the current page changes (X-axes).
     */
    updateDynamicCharts() {
        const pageNum = this.viewer.currentPage;
        const densityData = this.viewer.allDensityData[pageNum];
        
        if (!densityData) return;
        
        this.renderXDensityChart(densityData);
        this.renderXDensityRightChart(densityData);
    }

    /**
     * Renders charts that are static and match the full document (Y-axes).
     * This version CALCULATES height instead of reading it, avoiding race conditions.
     */
    async renderStaticCharts() {
        const yDensityScroller = document.getElementById('y-density');
        const yDensityRight = document.getElementById('y-density-right');
        
        if (!yDensityScroller || !yDensityRight || !this.viewer.pdfDoc) return;

        // Clear any old canvases
        yDensityScroller.innerHTML = '';
        yDensityRight.innerHTML = '';
        
        const pageWrappers = document.querySelectorAll('.pdf-page-wrapper');
        if (pageWrappers.length === 0) return;

        // Find the global max value for scaling *all* charts consistently
        let globalMaxValue = 0;
        pageWrappers.forEach(wrapper => {
            const pageNum = parseInt(wrapper.dataset.pageNum, 10);
            const pageData = this.viewer.allDensityData[pageNum];
            if (pageData && pageData.y && Array.isArray(pageData.y)) {
                const pageMax = Math.max(...pageData.y);
                if (pageMax > globalMaxValue) {
                    globalMaxValue = pageMax;
                }
            }
        });

        if (globalMaxValue === 0) return; // No data

        // Wait for PDF to fully render and get actual scrollHeight
        const pdfScroller = document.getElementById('pdf-scroller');
        await new Promise(resolve => requestAnimationFrame(() => resolve()));
        
        // Get the ACTUAL scrollable height from the PDF scroller
        const totalPdfHeight = pdfScroller.scrollHeight;
        const parentWidth = yDensityScroller.offsetWidth;
        
        if (totalPdfHeight <= 0 || parentWidth <= 0) return;
        
        console.log(`[renderStaticCharts] PDF scrollHeight=${totalPdfHeight}, parentWidth=${parentWidth}`);
        
        // --- Create SINGLE LEFT Y-Density Canvas for entire document ---
        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = `${totalPdfHeight}px`;
        yDensityScroller.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio;
        canvas.width = parentWidth * dpr;
        canvas.height = totalPdfHeight * dpr;
        ctx.scale(dpr, dpr);
        
        // Draw density bars and page breaks by accumulating actual heights
        let currentY = 0;
        for (let i = 0; i < pageWrappers.length; i++) {
            const wrapper = pageWrappers[i];
            const pageNum = parseInt(wrapper.dataset.pageNum, 10);
            const pageData = this.viewer.allDensityData[pageNum];
            const data = (pageData && pageData.y) ? pageData.y : [];
            
            // Get ACTUAL page height from the DOM
            const actualPageHeight = wrapper.offsetHeight;
            
            if (data.length > 0 && actualPageHeight > 0) {
                const barHeight = actualPageHeight / data.length;
                ctx.fillStyle = '#4CAF50';
                
                data.forEach((value, index) => {
                    const barWidth = (value / globalMaxValue) * parentWidth;
                    ctx.fillRect(parentWidth - barWidth, currentY + (index * barHeight), barWidth, barHeight);
                });
            }
            
            // Draw page break line (except after last page)
            if (i < pageWrappers.length - 1) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, currentY + actualPageHeight);
                ctx.lineTo(parentWidth, currentY + actualPageHeight);
                ctx.stroke();
            }
            
            currentY += actualPageHeight;
        }
        // Draw verification grid over the left Y-density canvas (align with PDF grid)
        this.drawHorizontalGrid(ctx, parentWidth, totalPdfHeight, (window.__GRID_STEP_PX || 50));
        
        // --- Create SINGLE RIGHT Y-Density Canvas for entire document ---
        const rightCanvas = document.createElement('canvas');
        rightCanvas.style.width = '100%';
        rightCanvas.style.height = `${totalPdfHeight}px`;
        yDensityRight.appendChild(rightCanvas);
        
        const rightCtx = rightCanvas.getContext('2d');
        rightCanvas.width = parentWidth * dpr;
        rightCanvas.height = totalPdfHeight * dpr;
        rightCtx.scale(dpr, dpr);
        
        // Draw for right canvas
        currentY = 0;
        for (let i = 0; i < pageWrappers.length; i++) {
            const wrapper = pageWrappers[i];
            const pageNum = parseInt(wrapper.dataset.pageNum, 10);
            const pageData = this.viewer.allDensityData[pageNum];
            const data = (pageData && pageData.y) ? pageData.y : [];
            
            const actualPageHeight = wrapper.offsetHeight;
            
            if (data.length > 0 && actualPageHeight > 0) {
                const barHeight = actualPageHeight / data.length;
                rightCtx.fillStyle = '#2196F3';
                
                data.forEach((value, index) => {
                    const barWidth = (value / globalMaxValue) * parentWidth;
                    rightCtx.fillRect(parentWidth - barWidth, currentY + (index * barHeight), barWidth, barHeight);
                });
            }
            
            currentY += actualPageHeight;
        }
        // Draw verification grid over the right Y-density canvas (align with PDF grid)
        this.drawHorizontalGrid(rightCtx, parentWidth, totalPdfHeight, (window.__GRID_STEP_PX || 50));
    }

    /**
     * Helper function to render density data onto a specific canvas for a single page.
     */
    renderPageDensityChart(canvas, data, globalMaxValue, pageHeight, color) {
        const parentWidth = canvas.parentElement.offsetWidth;
        if (parentWidth <= 0 || pageHeight <= 0) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio;

        canvas.width = parentWidth * dpr;
        canvas.height = pageHeight * dpr;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, parentWidth, pageHeight);
        
        if (!data || data.length === 0) return;
        
        ctx.fillStyle = color;
        const barHeight = pageHeight / data.length;

        data.forEach((value, index) => {
            const barWidth = (value / globalMaxValue) * parentWidth;
            const x = parentWidth - barWidth;
            const y = index * barHeight;
            
            ctx.fillRect(x, y, barWidth, barHeight);
        });
    }

    /**
     * Draws a horizontal grid every fixed pixel interval to visually verify
     * scroll synchronization with the PDF scroller. Uses device-pixel crisp lines.
     */
    drawHorizontalGrid(ctx, width, height, step) {
        const gridStep = step > 0 ? step : 50; // px
        const pdfContainer = document.getElementById('pdf-canvas-container');
        const style = pdfContainer ? window.getComputedStyle(pdfContainer) : null;
        const padTop = style ? (parseFloat(style.paddingTop) || 0) : 0;
        const yStart = (gridStep - (padTop % gridStep)) % gridStep;
        ctx.save();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        // 0.5px offset for crisp 1px lines
        for (let y = yStart; y <= height; y += gridStep) {
            ctx.beginPath();
            ctx.moveTo(0, Math.floor(y) + 0.5);
            ctx.lineTo(width, Math.floor(y) + 0.5);
            ctx.stroke();
        }
        ctx.restore();
    }
}

