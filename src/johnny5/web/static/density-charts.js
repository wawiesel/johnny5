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
     * This new version creates ONE canvas PER PAGE, matching the PDF layout.
     */
    renderStaticCharts() {
        const yDensityScroller = document.getElementById('y-density');
        const yDensityRight = document.getElementById('y-density-right');
        
        if (!yDensityScroller || !yDensityRight) return;

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

        // Loop through each page and create a matching canvas
        pageWrappers.forEach(wrapper => {
            const pageNum = parseInt(wrapper.dataset.pageNum, 10);
            const pageData = this.viewer.allDensityData[pageNum];
            const pageHeight = wrapper.offsetHeight;
            const data = (pageData && pageData.y) ? pageData.y : [];

            if (pageHeight <= 0) return; // Skip if page not rendered

            // --- 1. Create LEFT Y-Density Canvas for this page ---
            const canvas = document.createElement('canvas');
            canvas.style.width = '100%';
            canvas.style.height = `${pageHeight}px`;
            canvas.style.display = 'block';
            canvas.style.marginBottom = '5px'; // Match PDF page margin
            
            yDensityScroller.appendChild(canvas);
            this.renderPageDensityChart(canvas, data, globalMaxValue, pageHeight, '#4CAF50');

            // --- 2. Create RIGHT Y-Density Canvas for this page ---
            const rightCanvas = document.createElement('canvas');
            rightCanvas.style.width = '100%';
            rightCanvas.style.height = `${pageHeight}px`;
            rightCanvas.style.display = 'block';
            rightCanvas.style.marginBottom = '5px'; // Match PDF page margin
            
            yDensityRight.appendChild(rightCanvas);
            this.renderPageDensityChart(rightCanvas, data, globalMaxValue, pageHeight, '#2196F3');
        });
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
            const y = index * barHeight; // Simple top-to-bottom
            
            ctx.fillRect(x, y, barWidth, barHeight);
        });
    }
}

