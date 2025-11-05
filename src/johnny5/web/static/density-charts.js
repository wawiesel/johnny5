/* exported DensityCharts */
// Johnny5 Density Charts Module

/**
 * Manages rendering and scrolling of density charts for the web viewer
 */
class DensityCharts {
    constructor(viewer) {
        this.viewer = viewer;
    }

    _getThemeColors() {
        const styles = getComputedStyle(document.body);
        const fill = styles.getPropertyValue('--density-fill').trim();
        return { fill };
    }

    /**
     * Renders a density profile as a filled step function
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array} profile - Array of [axis_coord, density] tuples
     * @param {Object} config - Configuration object
     * @param {string} config.axis - 'x' or 'y' (which axis the profile is for)
     * @param {string} config.orientation - 'vertical' (left bar) or 'horizontal' (top bar)
     * @param {number} config.axis0 - Start coordinate of the axis in PDF coordinates
     * @param {number} config.axisLength - Length of the axis in PDF coordinates
     * @param {number} config.axisStartScreen - Start position of the axis on screen
     * @param {number} config.axisLengthScreen - Length of the axis on screen
     * @param {number} config.densityMaxScreen - Maximum screen dimension for density (width for vertical, height for horizontal)
     * @param {number} config.densityStartScreen - Start position for density bars (right edge for vertical, bottom edge for horizontal)
     * @param {string} config.color - Fill color for the density chart
     */
    _renderDensityStepFunction(ctx, profile, config) {
        const { axis, orientation, axis0, axisLength, axisStartScreen, axisLengthScreen, densityMaxScreen, densityStartScreen, color } = config;
        
        if (profile.length === 0) return;
        
        ctx.fillStyle = color;
        ctx.beginPath();
        
        if (orientation === 'vertical') {
            // Left bar: horizontal bars extending from right edge
            // Start at bottom-right
            ctx.moveTo(densityStartScreen, axisStartScreen + axisLengthScreen);
            
            for (let i = 0; i < profile.length; i++) {
                const point = profile[i];
                const [axisCoordPdf, density] = Array.isArray(point) && point.length === 2 ? point : [null, point];
                
                if (axisCoordPdf !== null && axisCoordPdf >= 0 && axisCoordPdf <= axisLength) {
                    const axisScreen = axisStartScreen + ((axisCoordPdf - axis0) * (axisLengthScreen / axisLength));
                    const densityScreen = densityStartScreen - (Math.max(0, Math.min(1, density)) * densityMaxScreen);
                    
                    if (i === 0) {
                        ctx.lineTo(densityScreen, axisScreen);
                    } else {
                        const prevPoint = profile[i - 1];
                        const [prevAxisCoordPdf, prevDensity] = Array.isArray(prevPoint) && prevPoint.length === 2 ? prevPoint : [null, prevPoint];
                        
                        if (prevAxisCoordPdf !== null) {
                            const prevDensityScreen = densityStartScreen - (Math.max(0, Math.min(1, prevDensity)) * densityMaxScreen);
                            ctx.lineTo(prevDensityScreen, axisScreen);
                            ctx.lineTo(densityScreen, axisScreen);
                        }
                    }
                }
            }
            
            // Close path back to bottom-right
            ctx.lineTo(densityStartScreen, axisStartScreen + axisLengthScreen);
        } else {
            // Top bar: vertical bars extending from bottom edge
            // Start at bottom-left
            ctx.moveTo(axisStartScreen, densityStartScreen);
            
            for (let i = 0; i < profile.length; i++) {
                const point = profile[i];
                const [axisCoordPdf, density] = Array.isArray(point) && point.length === 2 ? point : [null, point];
                
                if (axisCoordPdf !== null && axisCoordPdf >= 0 && axisCoordPdf <= axisLength) {
                    const axisScreen = axisStartScreen + ((axisCoordPdf - axis0) * (axisLengthScreen / axisLength));
                    const densityScreen = densityStartScreen - (Math.max(0, Math.min(1, density)) * densityMaxScreen);
                    
                    if (i === 0) {
                        ctx.lineTo(axisScreen, densityScreen);
                    } else {
                        const prevPoint = profile[i - 1];
                        const [prevAxisCoordPdf, prevDensity] = Array.isArray(prevPoint) && prevPoint.length === 2 ? prevPoint : [null, prevPoint];
                        
                        if (prevAxisCoordPdf !== null) {
                            const prevDensityScreen = densityStartScreen - (Math.max(0, Math.min(1, prevDensity)) * densityMaxScreen);
                            ctx.lineTo(axisScreen, prevDensityScreen);
                            ctx.lineTo(axisScreen, densityScreen);
                        }
                    }
                }
            }
            
            // Close path back to bottom-right
            ctx.lineTo(axisStartScreen + axisLengthScreen, densityStartScreen);
        }
        
        ctx.closePath();
        ctx.fill();
    }

    async renderAllDensityCharts() {
        await this.renderPdfYDensityChart();
        
        // Render X-density chart for current page if data is available
        const pageNum = this.viewer.currentPage;
        const densityData = this.viewer.allDensityData[pageNum];
        if (densityData) {
            this.renderPdfXDensityChart(densityData);
        }
    }
    
    /**
     * Renders x-density chart in pdf-x-density panel (top bar).
     * Shows x-density for the current page, similar to how pdf-y-density works.
     */
    renderPdfXDensityChart(densityData) {
        const xDensityPanel = document.getElementById('pdf-x-density');
        if (!xDensityPanel || !this.viewer.pdfDoc) return;
        
        // Remove existing x-density overlay if any
        const existingCanvas = xDensityPanel.querySelector('.x-density-overlay-canvas');
        if (existingCanvas) existingCanvas.remove();
        
        const pageNum = this.viewer.currentPage;
        const pageWrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);
        if (!pageWrapper) return;
        
        const pageCanvas = pageWrapper.querySelector('canvas');
        if (!pageCanvas) return;
        
        const actualPageWidth = parseFloat(pageCanvas.style.width);
        const topBarHeight = xDensityPanel.offsetHeight || 36;
        
        if (actualPageWidth <= 0 || topBarHeight <= 0) return;
        
        // Find the row container that holds the grid/ruler (created by drawTopPanelRuler)
        const row = xDensityPanel.querySelector('div');
        if (!row) {
            console.warn(`[renderPdfXDensityChart] Row not found in x-density panel`);
            return;
        }
        
        // Get page's position relative to the PDF scroller (same coordinate system as the row)
        const scroller = document.getElementById('pdf-scroller');
        if (!scroller) {
            console.warn(`[renderPdfXDensityChart] Scroller not found`);
            return;
        }
        
        // Use viewer's helper method to get page position relative to scroller
        // The row's width matches container.scrollWidth, and row scrolls with scroller
        let pageLeftInRow;
        if (this.viewer._getWrapperOffset) {
            const off = this.viewer._getWrapperOffset(pageWrapper, scroller);
            pageLeftInRow = off.x;
        } else {
            // Fallback calculation
            const wr = pageWrapper.getBoundingClientRect();
            const sr = scroller.getBoundingClientRect();
            pageLeftInRow = (wr.left - sr.left) + scroller.scrollLeft;
        }
        
        
        // Create canvas for current page's x-density
        const canvas = document.createElement('canvas');
        canvas.className = 'x-density-overlay-canvas';
        // Static styles in CSS, only dynamic values here
        canvas.style.left = `${pageLeftInRow}px`;
        canvas.style.width = `${actualPageWidth}px`;
        canvas.style.height = `${topBarHeight}px`;
        row.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio;
        canvas.width = actualPageWidth * dpr;
        canvas.height = topBarHeight * dpr;
        ctx.scale(dpr, dpr);
        
        const profile = (densityData && densityData.x) ? densityData.x : [];
        if (profile.length === 0) return;
        
        // Render x-density for current page using shared function
        const theme = this._getThemeColors();

        this.viewer.pdfDoc.getPage(pageNum).then(page => {
            const viewport = page.getViewport({ scale: this.viewer.scale });
            const [x0, , x1] = page.view;
            const pageWidthPdf = x1 - x0;
            
            this._renderDensityStepFunction(ctx, profile, {
                axis: 'x',
                orientation: 'horizontal',
                axis0: x0,
                axisLength: pageWidthPdf,
                axisStartScreen: 0,
                axisLengthScreen: actualPageWidth,
                densityMaxScreen: topBarHeight,
                densityStartScreen: topBarHeight,
                color: theme.fill
            });
        }).catch(err => console.error(`Error rendering pdf-x-density for page ${pageNum}:`, err));
    }

    /**
     * Renders pdf-y-density chart (left bar) for all pages.
     * This is static and shows y-density for the entire document.
     */
    async renderPdfYDensityChart() {
        const yDensityScroller = document.getElementById('pdf-y-density');
        
        if (!yDensityScroller || !this.viewer.pdfDoc) return;

        // Remove existing density overlay canvas (keep grid)
        const existingCanvas = yDensityScroller.querySelector('.density-overlay-canvas');
        const theme = this._getThemeColors();
        if (existingCanvas) existingCanvas.remove();
        
        const pageWrappers = document.querySelectorAll('.pdf-page-wrapper');
        if (pageWrappers.length === 0) return;

        // Y-density values are now fractions (0.0-1.0) representing horizontal coverage
        // No need to find global max - values are already normalized
        // But we'll use 1.0 as the max for consistent scaling
        const globalMaxValue = 1.0;

        // Wait for PDF to fully render and get actual scrollHeight
        const pdfScroller = document.getElementById('pdf-scroller');
        await new Promise(resolve => requestAnimationFrame(() => resolve()));
        
        // Get the ACTUAL scrollable height from the PDF scroller
        const totalPdfHeight = pdfScroller.scrollHeight;
        const parentWidth = yDensityScroller.offsetWidth;
        
        if (totalPdfHeight <= 0 || parentWidth <= 0) return;
        
        
        // --- Create SINGLE LEFT Y-Density Canvas as OVERLAY for entire document ---
        const canvas = document.createElement('canvas');
        canvas.className = 'density-overlay-canvas';
        // Static styles in CSS, only dynamic values here
        canvas.style.height = `${totalPdfHeight}px`;
        yDensityScroller.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio;
        // Clamp canvas backing store to prevent compositor issues
        // CSS height stays at totalPdfHeight for proper display, but backing store is limited
        const MAX_CANVAS_HEIGHT = 32767; // Conservative 2D canvas axis cap
        const effectiveDpr = Math.min(dpr, MAX_CANVAS_HEIGHT / totalPdfHeight);
        canvas.width = Math.floor(parentWidth * effectiveDpr);
        canvas.height = Math.min(Math.floor(totalPdfHeight * effectiveDpr), MAX_CANVAS_HEIGHT);
        ctx.scale(effectiveDpr, effectiveDpr);
        
        // Draw density bars with gaps matching PDF page gaps
        if (!pdfScroller) return;
        
        const getY = (w) => {
            const wr = w.getBoundingClientRect();
            const sr = pdfScroller.getBoundingClientRect();
            return (wr.top - sr.top) + pdfScroller.scrollTop;
        };
        
        // Render density as filled line plot for each page
        let currentY = 0;
        const renderPromises = [];
        
        for (let i = 0; i < pageWrappers.length; i++) {
            const wrapper = pageWrappers[i];
            const pageNum = parseInt(wrapper.dataset.pageNum, 10);
            const pageData = this.viewer.allDensityData[pageNum];
            const profile = (pageData && pageData.y) ? pageData.y : [];
            
            // Get Y position of this page wrapper in the scroller
            const pageTop = Math.round(getY(wrapper));
            
            // If there's a gap before this page, leave it empty
            if (pageTop > currentY) {
                currentY = pageTop;
            }
            
            const actualPageHeight = wrapper.offsetHeight;
            const pageStartY = currentY;
            
            if (profile.length > 0 && actualPageHeight > 0) {
                // Profile is now [(y_coord_pdf, density), ...] - step function format
                // Get page viewport to transform PDF coordinates
                const renderPromise = this.viewer.pdfDoc.getPage(pageNum).then(page => {
                    const viewport = page.getViewport({ scale: this.viewer.scale });
                    const [, y0, , y1] = page.view;
                    const pageHeightPdf = y1 - y0;
                    const scaleY = actualPageHeight / pageHeightPdf;
                    
                    
                    // Use shared function to render y-density profile
                    this._renderDensityStepFunction(ctx, profile, {
                        axis: 'y',
                        orientation: 'vertical',
                        axis0: y0,
                        axisLength: pageHeightPdf,
                        axisStartScreen: pageStartY,
                        axisLengthScreen: actualPageHeight,
                        densityMaxScreen: parentWidth,
                        densityStartScreen: parentWidth,
                        color: theme.fill
                    });
                }).catch(err => console.error(`Error rendering density for page ${pageNum}:`, err));
                
                renderPromises.push(renderPromise);
            }
            
            currentY += actualPageHeight;
            
            // Check for gap to next page
            if (i + 1 < pageWrappers.length) {
                const nextWrapper = pageWrappers[i + 1];
                const nextPageTop = Math.round(getY(nextWrapper));
                const gapSize = nextPageTop - currentY;
                if (gapSize > 0) {
                    currentY = nextPageTop;
                }
            }
        }
        
        // Wait for all pages to render
        await Promise.all(renderPromises);
    }


    /**
     * Dumps all y-density data to a JSON file on disk via server endpoint
     */
    async dumpYDensityToFile() {
        try {
            const response = await fetch('/api/dump-density', { method: 'POST' });
            const result = await response.json();
            
            if (result.success) {
                console.log(`[density-charts] Dumped y-density data for ${result.pages_dumped} pages to: ${result.file_path}`);
                return result;
            } else {
                console.error(`[density-charts] Failed to dump density data: ${result.error}`);
                return result;
            }
        } catch (error) {
            console.error(`[density-charts] Error dumping density data:`, error);
            return { error: error.message };
        }
    }
}
