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

    renderYDensityChart() {
        const canvas = document.getElementById('y-density-chart');
        if (!canvas) return;
        
        const pdfScroller = document.getElementById('pdf-scroller');
        if (!pdfScroller) return;

        // Use requestAnimationFrame to run *after* the browser has calculated layout
        requestAnimationFrame(() => {
            const totalPdfHeight = pdfScroller.scrollHeight;
            const parentWidth = canvas.parentElement.offsetWidth;
            
            if (totalPdfHeight <= 0 || parentWidth <= 0) return;
            
            const pageWrappers = document.querySelectorAll('.pdf-page-wrapper');
            if (pageWrappers.length === 0) return;

            console.log(`[renderYDensityChart] Rendering with PDF height: ${totalPdfHeight}`);

            const ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio;
            
            canvas.width = parentWidth * dpr;
            canvas.height = totalPdfHeight * dpr;
            ctx.scale(dpr, dpr);
            
            ctx.clearRect(0, 0, parentWidth, totalPdfHeight);
            
            let globalMaxValue = 0;
            const allPageData = [];
            
            pageWrappers.forEach(wrapper => {
                const pageNum = parseInt(wrapper.dataset.pageNum, 10);
                const pageData = this.viewer.allDensityData[pageNum];
                if (pageData && pageData.y && Array.isArray(pageData.y)) {
                    allPageData.push({ 
                        pageNum, 
                        data: pageData.y,
                        wrapperTop: wrapper.offsetTop,
                        wrapperHeight: wrapper.offsetHeight
                    });
                    const pageMax = Math.max(...pageData.y);
                    if (pageMax > globalMaxValue) {
                        globalMaxValue = pageMax;
                    }
                }
            });

            if (globalMaxValue === 0) return;

            ctx.fillStyle = '#4CAF50';

            allPageData.forEach((page, idx) => {
                const { data, wrapperTop, wrapperHeight } = page;
                if (!data || data.length === 0 || wrapperHeight <= 0) return;

                const barHeight = wrapperHeight / data.length;

                data.forEach((value, index) => {
                    const barWidth = (value / globalMaxValue) * parentWidth;
                    const x = parentWidth - barWidth;
                    const y = wrapperTop + (index * barHeight); 
                    ctx.fillRect(x, y, barWidth, barHeight);
                });

                // Draw page break line
                const pageEndY = wrapperTop + wrapperHeight;
                if (idx < allPageData.length - 1) {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(0, pageEndY);
                    ctx.lineTo(parentWidth, pageEndY);
                    ctx.stroke();
                }
            });
            
            canvas.style.width = parentWidth + 'px';
            canvas.style.height = totalPdfHeight + 'px';
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
     * Gathers Y-density data from all pages into a single array.
     */
    getAllYDensityData() {
        let combinedData = [];
        for (let pageNum = 1; pageNum <= this.viewer.totalPages; pageNum++) {
            const pageData = this.viewer.allDensityData[pageNum];
            if (pageData && pageData.y) {
                combinedData = combinedData.concat(pageData.y);
            }
        }
        return combinedData;
    }

    /**
     * Renders the RIGHT Y-density chart using ALL page data.
     */
    renderYDensityRightChart() {
        const canvas = document.getElementById('y-density-right-chart');
        if (!canvas) return;

        const pdfScroller = document.getElementById('pdf-scroller');
        if (!pdfScroller) return;

        // Use requestAnimationFrame for consistency
        requestAnimationFrame(() => {
            const totalPdfHeight = pdfScroller.scrollHeight;
            const parentWidth = canvas.parentElement.offsetWidth;

            if (totalPdfHeight <= 0 || parentWidth <= 0) return;

            const pageWrappers = document.querySelectorAll('.pdf-page-wrapper');
            if (pageWrappers.length === 0) return;

            const ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio;

            canvas.width = parentWidth * dpr;
            canvas.height = totalPdfHeight * dpr;
            ctx.scale(dpr, dpr);
            
            ctx.clearRect(0, 0, parentWidth, totalPdfHeight);
            
            let globalMaxValue = 0;
            const allPageData = [];
            pageWrappers.forEach(wrapper => {
                const pageNum = parseInt(wrapper.dataset.pageNum, 10);
                const pageData = this.viewer.allDensityData[pageNum]; 
                if (pageData && pageData.y && Array.isArray(pageData.y)) {
                    // Calculate position relative to pdf-scroller
                    const rect = wrapper.getBoundingClientRect();
                    const scrollerRect = pdfScroller.getBoundingClientRect();
                    const absoluteTop = rect.top - scrollerRect.top + pdfScroller.scrollTop;
                    
                    allPageData.push({ 
                        pageNum, 
                        data: pageData.y,
                        wrapperTop: absoluteTop,
                        wrapperHeight: wrapper.offsetHeight
                    });
                    const pageMax = Math.max(...pageData.y);
                    if (pageMax > globalMaxValue) {
                        globalMaxValue = pageMax;
                    }
                }
            });

            if (globalMaxValue === 0) return;

            ctx.fillStyle = '#2196F3';

            allPageData.forEach((page) => {
                const { data, wrapperTop, wrapperHeight } = page;
                if (!data || data.length === 0 || wrapperHeight <= 0) return;

                const barHeight = wrapperHeight / data.length;

                data.forEach((value, index) => {
                    const barWidth = (value / globalMaxValue) * parentWidth;
                    const x = parentWidth - barWidth;
                    const y = wrapperTop + (index * barHeight);
                    
                    ctx.fillRect(x, y, barWidth, barHeight);
                });
            });

            canvas.style.width = parentWidth + 'px';
            canvas.style.height = totalPdfHeight + 'px';
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
     */
    renderStaticCharts() {
        this.renderYDensityChart();
        this.renderYDensityRightChart();
    }
}

