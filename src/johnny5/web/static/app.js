// Johnny5 Web Viewer JavaScript

// (helper removed)

class Johnny5Viewer {
    constructor() {
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        this.canvas = null; // Will be created dynamically for each page
        this.ctx = null;
        this.websocket = null;
        this.structureData = null;
        this.densityData = null;
        this.allStructureData = {}; // Store structure data for all pages
        // Density data removed
        this.activeLabels = new Set(); // Currently enabled labels
        this.allLabels = []; // All available labels from document
        this.labelColors = {}; // Color scheme for each label type
        
        // Density charts removed
        
        // Redirect console output to log window
        this.redirectConsoleToLog();
        
        this.init();
    }
    
    redirectConsoleToLog() {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        
        console.log = (...args) => {
            originalLog.apply(console, args);
            this.addLogEntry('left', args.join(' '), 'debug');
        };
        
        console.error = (...args) => {
            originalError.apply(console, args);
            this.addLogEntry('left', args.join(' '), 'error');
        };
        
        console.warn = (...args) => {
            originalWarn.apply(console, args);
            this.addLogEntry('left', args.join(' '), 'warning');
        };
    }

    async init() {
        console.log('Johnny5 Web Viewer initializing...');
        
        // Initialize PDF.js
        await this.initPDFJS();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Connect to WebSocket for logs
        this.connectWebSocket();
        
        // Auto-load test PDF
        await this.loadTestPDF();
        
        console.log('Johnny5 Web Viewer initialized');
    }

    async initPDFJS() {
        // Configure PDF.js worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        // Set default scale to 1.0; fitWidth() will calculate the correct initial scale
        this.scale = 1.0;
    }

    setupEventListeners() {
        // Image panel indicators
        document.getElementById('indicator-i').addEventListener('click', () => this.toggleImagePanel('i'));
        document.getElementById('indicator-d').addEventListener('click', () => this.toggleImagePanel('d'));
        document.getElementById('indicator-e').addEventListener('click', () => this.toggleImagePanel('e'));
        document.getElementById('indicator-r').addEventListener('click', () => this.toggleImagePanel('r'));
        
        // PDF file input
        const fileInput = document.getElementById('pdf-file-input');
        const loadBtn = document.getElementById('load-pdf-btn');
        const fileNameDisplay = document.getElementById('current-file-name');
        
        loadBtn.addEventListener('click', () => {
            fileInput.click();
        });
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                fileNameDisplay.textContent = file.name;
                this.addLogEntry('left', `Loading PDF: ${file.name}`);
                this.loadNewPDF(file);
            }
        });
        
        // PDF controls (minimal overlay)
        document.getElementById('zoom-in').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoom-out').addEventListener('click', () => this.zoomOut());
        document.getElementById('fit-width').addEventListener('click', () => this.fitWidth());
        document.getElementById('fit-height').addEventListener('click', () => this.fitHeight());
        
        // Options toggle
        document.getElementById('options-toggle').addEventListener('click', () => this.toggleOptions());
        
        // Log copy button
        document.getElementById('log-copy-button').addEventListener('click', () => this.copyLog());
        
        // Page count overlay updates on scroll
        const scroller = document.getElementById('pdf-scroller');
        scroller.addEventListener('scroll', () => {
            this.updateCurrentPage();
        });
        
        // Left ruler scroll sync handled in drawLeftPanelRuler()
        
        // Trackpad/wheel zoom support
        this.setupTrackpadSupport();
        
        // Scroll synchronization (to be implemented)
        
        // Label toggle controls
        document.getElementById('select-all-labels').addEventListener('click', () => this.selectAllLabels());
        document.getElementById('deselect-all-labels').addEventListener('click', () => this.deselectAllLabels());

        // Keep left ruler style in lockstep with viewer styles (no CSS duplication)
        this.setupRulerStyleSync();
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/logs`;
        
        this.websocket = new WebSocket(wsUrl);
        
        this.websocket.onopen = () => {
            console.log('WebSocket connected');
            this.addLogEntry('left', 'WebSocket connected', 'info');
        };
        
        this.websocket.onmessage = (event) => {
            try {
                const logEntry = JSON.parse(event.data);
                this.addLogEntry(logEntry.pane, logEntry.message, logEntry.level.toLowerCase());
            } catch (e) {
                console.error('Failed to parse log entry:', e);
            }
        };
        
        this.websocket.onclose = () => {
            console.log('WebSocket disconnected');
            this.addLogEntry('left', 'WebSocket disconnected', 'warning');
        };
        
        this.websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.addLogEntry('left', 'WebSocket error', 'error');
        };
    }

    async loadPDF() {
        try {
            console.log('Loading PDF...');
            this.addLogEntry('left', 'Loading PDF...', 'info');
            
            const loadingTask = pdfjsLib.getDocument('/api/pdf');
            this.pdfDoc = await loadingTask.promise;
            this.totalPages = this.pdfDoc.numPages;
            
            console.log(`PDF loaded: ${this.totalPages} pages`);
            this.addLogEntry('left', `PDF loaded: ${this.totalPages} pages`, 'info');
            
            // Update UI
            this.updatePageInfo();
            this.updateNavigationButtons();
            
            // Render first page
            await this.renderPage(this.currentPage);
            
        } catch (error) {
            console.error('Failed to load PDF:', error);
            this.addLogEntry('left', `Failed to load PDF: ${error.message}`, 'error');
        }
    }

    async renderPage() {
        // This method is deprecated - using renderAllPages() instead
        // Keeping for compatibility but redirecting to renderAllPages
        console.log('renderPage() called but using renderAllPages() instead');
        await this.renderAllPages();
    }

    async loadTestPDF() {
        try {
            console.log('Auto-loading test PDF...');
            this.addLogEntry('left', 'Auto-loading test PDF: 02-split_table.pdf');
            
            // Load test PDF from server - the server is already serving the multi-page PDF
            const loadingTask = pdfjsLib.getDocument('/api/pdf');
            this.pdfDoc = await loadingTask.promise;
            this.totalPages = this.pdfDoc.numPages;
            this.currentPage = 1;
            
            console.log(`Test PDF loaded successfully. Pages: ${this.totalPages}`);
            this.addLogEntry('left', `Test PDF loaded successfully. Pages: ${this.totalPages}`);
            
            // Fit to width (this will set the scale and render all pages)
            await this.fitWidth();
            
            // Load structure and density data for all pages
            await this.loadAllPageData();
            
        } catch (error) {
            console.error('Error loading test PDF:', error);
            this.addLogEntry('left', `Error loading test PDF: ${error.message}`, 'error');
        }
    }
    
    async loadPageData() {
        // This method is deprecated - using loadAllPageData() instead
        // Keeping for compatibility but should not be used
        console.log('loadPageData() called but using loadAllPageData() instead');
        await this.loadAllPageData();
    }
    
    async loadAllPageData() {
        try {
            let loadedCount = 0;
            // Load structure and density data for all pages
            for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
                try {
                    const structureResponse = await fetch(`/api/structure/${pageNum}`);
                    
                    if (structureResponse.ok) {
                        const structureData = await structureResponse.json();
                        this.allStructureData[pageNum] = structureData;
                        loadedCount++;
                    }
                } catch (error) {
                    console.log(`Failed to load data for page ${pageNum}: ${error.message}`);
                }
            }
            
            if (loadedCount > 0) {
                this.addLogEntry('left', `Loaded structure data for ${loadedCount} pages`);
                
                // After loading all data, extract unique labels and build toggle UI
                this.extractUniqueLabels();
                this.renderLabelToggles();
                
                // Render annotations for all pages
                this.renderAllAnnotations();
                
                // Replace y-density with left-side PDF-coordinate ruler instead of charts
                await Promise.resolve();
            } else {
                this.addLogEntry('left', 'No structure data available. Run disassemble command first.', 'warning');
            }
        } catch (error) {
            this.addLogEntry('left', `Failed to load page data: ${error.message}`, 'error');
        }
    }

    renderAnnotations() {
        if (!this.structureData || !this.structureData.page) return;
        
        const overlayContainer = document.getElementById('overlay-container');
        const annotationList = document.getElementById('annotation-list');
        
        // Clear existing annotations
        overlayContainer.innerHTML = '';
        annotationList.innerHTML = '';
        this.clearConnectionLines();
        
        const page = this.structureData.page;
        const canvasRect = this.canvas.getBoundingClientRect();
        
        // Calculate scale factor for overlay positioning
        const scaleX = canvasRect.width / page.width;
        const scaleY = canvasRect.height / page.height;
        
        page.elements.forEach((element, index) => {
            if (!element.bbox || element.bbox.length !== 4) return;
            
            const [x0, y0, x1, y1] = element.bbox;
            
            // Create overlay element
            const overlay = document.createElement('div');
            overlay.className = 'annotation-overlay';
            overlay.style.left = `${x0 * scaleX}px`;
            overlay.style.top = `${y0 * scaleY}px`;
            overlay.style.width = `${(x1 - x0) * scaleX}px`;
            overlay.style.height = `${(y1 - y0) * scaleY}px`;
            overlay.dataset.index = index;
            
            overlay.addEventListener('click', () => this.selectAnnotation(index));
            
            overlayContainer.appendChild(overlay);
            
            // Create annotation list item
            const listItem = document.createElement('div');
            listItem.className = 'annotation-item';
            listItem.dataset.index = index;
            
            const typeDiv = document.createElement('div');
            typeDiv.className = 'annotation-type';
            typeDiv.textContent = element.type || 'Unknown';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'annotation-content';
            contentDiv.textContent = element.content || 'No content';
            
            listItem.appendChild(typeDiv);
            listItem.appendChild(contentDiv);
            listItem.addEventListener('click', () => this.selectAnnotation(index));
            
            annotationList.appendChild(listItem);
            
            // Create connection line
            this.createConnectionLine(overlay, listItem, index);
        });
        
        // Show annotations gutter if we have elements
        if (page.elements.length > 0) {
            document.querySelector('.annotations-gutter .not-implemented').style.display = 'none';
            document.querySelector('.annotations-gutter h4').style.display = 'block';
            annotationList.style.display = 'block';
        }
    }
    
    createConnectionLine(overlay, listItem, index) {
        const connectionLine = document.createElement('div');
        connectionLine.className = 'connection-line';
        connectionLine.dataset.index = index;
        
        // Position the connection line
        this.updateConnectionLinePosition(connectionLine, overlay, listItem);
        
        // Add to overlay container
        document.getElementById('overlay-container').appendChild(connectionLine);
        
        // Update position on scroll and resize
        const updatePosition = () => this.updateConnectionLinePosition(connectionLine, overlay, listItem);
        window.addEventListener('scroll', updatePosition);
        window.addEventListener('resize', updatePosition);
    }
    
    updateConnectionLinePosition(connectionLine, overlay, listItem) {
        const overlayRect = overlay.getBoundingClientRect();
        const listItemRect = listItem.getBoundingClientRect();
        const containerRect = document.getElementById('overlay-container').getBoundingClientRect();
        
        // Calculate positions relative to the overlay container
        const startX = overlayRect.right - containerRect.left;
        const startY = overlayRect.top + overlayRect.height / 2 - containerRect.top;
        const endX = listItemRect.left - containerRect.left;
        const endY = listItemRect.top + listItemRect.height / 2 - containerRect.top;
        
        // Calculate line properties
        const length = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        const angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;
        
        // Position and style the line
        connectionLine.style.left = `${startX}px`;
        connectionLine.style.top = `${startY}px`;
        connectionLine.style.width = `${length}px`;
        connectionLine.style.height = '2px';
        connectionLine.style.transformOrigin = '0 0';
        connectionLine.style.transform = `rotate(${angle}deg)`;
    }
    
    clearConnectionLines() {
        const connectionLines = document.querySelectorAll('.connection-line');
        connectionLines.forEach(line => line.remove());
    }

    selectAnnotation(index, pageNum = null) {
        // Remove previous selection
        document.querySelectorAll('.annotation-overlay.selected, .annotation-item.selected, .connection-line.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Add selection to clicked annotation and its connection line
        const selector = pageNum ? `[data-index="${index}"][data-page="${pageNum}"]` : `[data-index="${index}"]`;
        document.querySelectorAll(selector).forEach(el => {
            el.classList.add('selected');
        });
    }

    // Density chart rendering moved to DensityCharts module

    async previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            await this.renderPage(this.currentPage);
            this.updatePageInfo();
            this.updateNavigationButtons();
        }
    }

    async nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            await this.renderPage(this.currentPage);
            this.updatePageInfo();
            this.updateNavigationButtons();
        }
    }

    zoomIn() {
        this.scale = Math.min(this.scale * 1.2, 20.0); // Allow zoom up to 20x
        this.renderAllPages().then(async () => {
            
        });
        this.updateZoomInfo();
    }

    zoomOut() {
        this.scale = Math.max(this.scale / 1.2, 0.1);
        this.renderAllPages().then(async () => {
            
        });
        this.updateZoomInfo();
    }
    
    async renderAllPages() {
        if (!this.pdfDoc) {
            console.error('No PDF document loaded');
            return;
        }
        
        console.log(`Starting to render ${this.totalPages} pages at scale ${this.scale}`);
        this.addLogEntry('left', `Rendering ${this.totalPages} pages...`);
        
        const container = document.getElementById('pdf-canvas-container');
        if (!container) {
            console.error('PDF canvas container not found');
            return;
        }
        
        container.innerHTML = ''; // Clear existing content
        
        // Render pages sequentially to preserve page order
        // (This is important for proper visual ordering)
        try {
            this.pageViewportHeights = {};
            this.pageViewportWidths = {};
            for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
                try {
                    await this.renderPageToContainer(pageNum, container);
                } catch (error) {
                    console.error(`Failed to render page ${pageNum}:`, error);
                    this.addLogEntry('left', `Failed to render page ${pageNum}: ${error.message}`, 'error');
                }
            }
            
            console.log(`Successfully rendered all ${this.totalPages} pages`);
            this.addLogEntry('left', `Successfully rendered ${this.totalPages} pages`);
            
            // Update the page counter after initial render
            this.updateCurrentPage();

            // Lock panel height to scroller viewport before drawing
            const scroller = document.getElementById('pdf-scroller');
            const yPanel = document.getElementById('y-density');
            if (yPanel && scroller) {
                yPanel.style.height = scroller.clientHeight + 'px';
            }

            // Draw verification grid overlay aligned to PDF scroll space
            await this.drawPdfGrid();
            // Draw left ruler inside the y-density panel aligned to PDF coordinates
            await this.drawLeftPanelRuler();
        } catch (error) {
            console.error('Error rendering pages:', error);
            this.addLogEntry('left', `Error rendering pages: ${error.message}`, 'error');
        }
    }
    
    async renderPageToContainer(pageNum, container) {
        if (!container) {
            throw new Error('Container is null');
        }
        
        const page = await this.pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: this.scale });
        
        console.log(`Rendering page ${pageNum}: ${viewport.width}x${viewport.height}`);
        
        // Create a page wrapper div for better spacing and debugging
        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'pdf-page-wrapper';
        pageWrapper.dataset.pageNum = pageNum;
        pageWrapper.style.marginBottom = '5px';
        pageWrapper.style.position = 'relative';
        
        // Create canvas with high-DPI support
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
            throw new Error('Failed to get 2d context');
        }
        
        // Get the screen's pixel ratio for high-DPI rendering
        const outputScale = window.devicePixelRatio || 1;
        
        // Set CANVAS PIXEL size (backing store) - multiplied by devicePixelRatio for crisp rendering
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        
        // Set CANVAS DISPLAY size (CSS) - explicit pixel sizes allow zoom beyond container width
        canvas.style.width = Math.floor(viewport.width) + 'px';
        canvas.style.height = Math.floor(viewport.height) + 'px';
        canvas.style.display = 'block';
        canvas.style.margin = '0';
        canvas.style.boxShadow = 'none';
        canvas.style.borderRadius = '0';
        // Removed maxWidth constraint to allow zooming beyond container width
        
        // Create the transform for high-DPI rendering
        const transform = outputScale !== 1
            ? [outputScale, 0, 0, outputScale, 0, 0]
            : null;
        
        // Render page with high-DPI transform
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport,
            transform: transform
        };
        
        await page.render(renderContext).promise;
        this.pageViewportHeights[pageNum] = viewport.height; // CSS px at current scale
        this.pageViewportWidths[pageNum] = viewport.width;
        pageWrapper.appendChild(canvas);
        
        if (container && typeof container.appendChild === 'function') {
            container.appendChild(pageWrapper);
        } else {
            throw new Error('Container.appendChild is not a function or container is null');
        }
        
        console.log(`Page ${pageNum} rendered successfully at ${Math.round(this.scale * 100)}% (devicePixelRatio: ${outputScale})`);
    }
    
    async fitWidth() {
        if (!this.pdfDoc) return;
        
        // Wait for container to have dimensions
        await new Promise(resolve => {
            const checkContainer = () => {
                const container = document.getElementById('pdf-viewer');
                if (container && container.clientWidth > 0) {
                    resolve();
                } else {
                    requestAnimationFrame(checkContainer);
                }
            };
            checkContainer();
        });
        
        const page = await this.pdfDoc.getPage(1);
        const viewport = page.getViewport({ scale: 1.0 });
        const container = document.getElementById('pdf-viewer');
        // Use 10px padding (5px left/right) from .pdf-canvas-container
        const containerWidth = container.clientWidth - 10;
        
        // Calculate scale for width
        this.scale = containerWidth / viewport.width;
        
        console.log(`Fit width: container=${containerWidth}, page=${viewport.width}, scale=${this.scale}`);
        this.addLogEntry('left', `Fitting to width: ${Math.round(this.scale * 100)}%`);
        
        await this.renderAllPages(); // Await the render
        this.updateZoomInfo();
    }
    
    async fitHeight() {
        if (!this.pdfDoc) return;

        const page = await this.pdfDoc.getPage(1);
        const viewport = page.getViewport({ scale: 1.0 });
        const container = document.getElementById('pdf-viewer');

        // container.clientHeight - 10px (5px top + 5px bottom padding)
        const containerHeight = container.clientHeight - 10;

        // Calculate scale for height
        this.scale = containerHeight / viewport.height;
        
        console.log(`Fit height: container=${containerHeight}, page=${viewport.height}, scale=${this.scale}`);
        this.addLogEntry('left', `Fitting to height: ${Math.round(this.scale * 100)}%`);
        
        await this.renderAllPages();
        this.updateZoomInfo();
    }

    // Observe style/layout changes to mirror gaps/background to the left ruler via logic
    setupRulerStyleSync() {
        const container = document.getElementById('pdf-canvas-container');
        const scroller  = document.getElementById('pdf-scroller');
        if (!container || !scroller) return;

        const refresh = () => {
            // Recompute padding/background and per-page gaps
            this.drawLeftPanelRuler();
        };

        // Observe container style/class changes
        try {
            this._rulerContainerObserver?.disconnect?.();
        } catch {}
        if (window.MutationObserver) {
            const containerObserver = new window.MutationObserver(refresh);
            containerObserver.observe(container, { attributes: true, attributeFilter: ['style', 'class'] });
            this._rulerContainerObserver = containerObserver;
        }

        // Observe page wrapper additions/removals, and watch each wrapper's style/class
        try {
            this._rulerListObserver?.disconnect?.();
        } catch {}
        const observeWrappers = () => {
            container.querySelectorAll('.pdf-page-wrapper').forEach(wrapper => {
                if (wrapper._rulerObserverAttached) return;
                if (window.MutationObserver) {
                    const o = new window.MutationObserver(refresh);
                    o.observe(wrapper, { attributes: true, attributeFilter: ['style', 'class'] });
                    wrapper._rulerObserverAttached = true;
                    wrapper._rulerObserver = o;
                }
            });
        };
        observeWrappers();
        if (window.MutationObserver) {
            const listObserver = new window.MutationObserver(() => {
                observeWrappers();
                refresh();
            });
            listObserver.observe(container, { childList: true });
            this._rulerListObserver = listObserver;
        }

        // Observe layout/size changes for container/scroller
        if (window.ResizeObserver) {
            try {
                this._rulerResizeObserver?.disconnect?.();
            } catch {}
            const ro = new window.ResizeObserver(() => refresh());
            ro.observe(container);
            ro.observe(scroller);
            this._rulerResizeObserver = ro;
        }
    }

    updatePageInfo() {
        document.getElementById('page-info').textContent = `Page ${this.currentPage} of ${this.totalPages}`;
    }

    updateNavigationButtons() {
        document.getElementById('prev-page').disabled = this.currentPage <= 1;
        document.getElementById('next-page').disabled = this.currentPage >= this.totalPages;
    }

    updateZoomInfo() {
        document.getElementById('zoom-level').textContent = `${Math.round(this.scale * 100)}%`;
    }

    // Shared helpers for grid/ruler coordinate math
    _getWrapperOffset(wrapper, scroller) {
        const wr = wrapper.getBoundingClientRect();
        const sr = scroller.getBoundingClientRect();
        return {
            x: (wr.left - sr.left) + scroller.scrollLeft,
            y: (wr.top  - sr.top)  + scroller.scrollTop,
        };
    }

    _pdfToScroller(viewport, off, xPdf, yPdf) {
        const [vx, vy] = viewport.convertToViewportPoint(xPdf, yPdf);
        return { x: off.x + vx, y: off.y + vy };
    }

    _snapX(x) { return Math.floor(x) + 0.5; }
    _snapY(y) { return Math.floor(y) + 0.5; }

  async drawPdfGrid() {
    const scroller  = document.getElementById('pdf-scroller');
    const container = document.getElementById('pdf-canvas-container');
    if (!scroller || !container || !this.pdfDoc) return;
  
    let gridCanvas = document.getElementById('pdf-grid');
    if (!gridCanvas) {
      gridCanvas = document.createElement('canvas');
      gridCanvas.id = 'pdf-grid';
      scroller.appendChild(gridCanvas);
    }
    const width  = container.scrollWidth;
    const height = container.scrollHeight || container.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
  
    gridCanvas.style.width  = `${width}px`;
    gridCanvas.style.height = `${height}px`;
    gridCanvas.width  = Math.floor(width  * dpr);
    gridCanvas.height = Math.floor(height * dpr);
  
    const ctx = gridCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 0.5;
  
    const pdfStep = 15;
    const wrappers = container.querySelectorAll('.pdf-page-wrapper');
  
    for (const wrapper of wrappers) {
      const pageNum = +wrapper.dataset.pageNum;
      const page = await this.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: this.scale });
  
      const [x0, y0, x1, y1] = page.view;
      const pageWidth  = x1 - x0;
      const pageHeight = y1 - y0;
  
            const off = this._getWrapperOffset(wrapper, scroller);
  
            // --- Draw grid lines (ensure style is reset for each page) ---
            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.lineWidth = 0.5;
      // horizontal
      for (let yPdf = 0; yPdf <= pageHeight + 1e-6; yPdf += pdfStep) {
                const p0 = this._pdfToScroller(viewport, off, 0, yPdf);
                const p1 = this._pdfToScroller(viewport, off, pageWidth, yPdf);
        ctx.beginPath();
                ctx.moveTo(this._snapX(p0.x), this._snapY(p0.y));
                ctx.lineTo(this._snapX(p1.x), this._snapY(p1.y));
        ctx.stroke();
      }
  
      // vertical
      for (let xPdf = 0; xPdf <= pageWidth + 1e-6; xPdf += pdfStep) {
                const p0 = this._pdfToScroller(viewport, off, xPdf, 0);
                const p1 = this._pdfToScroller(viewport, off, xPdf, pageHeight);
        ctx.beginPath();
                ctx.moveTo(this._snapX(p0.x), this._snapY(p0.y));
                ctx.lineTo(this._snapX(p1.x), this._snapY(p1.y));
        ctx.stroke();
      }
  
      // --- Axes (red) ---
      ctx.strokeStyle = 'rgba(220,0,0,0.9)';
      ctx.lineWidth = 1.5;
  
      // X-axis (PDF y=0)
            const pX0 = this._pdfToScroller(viewport, off, 0, 0);
            const pX1 = this._pdfToScroller(viewport, off, pageWidth, 0);
      ctx.beginPath();
            ctx.moveTo(this._snapX(pX0.x), this._snapY(pX0.y));
            ctx.lineTo(this._snapX(pX1.x), this._snapY(pX1.y));
      ctx.stroke();
  
      // Y-axis (PDF x=0)
            const pY0 = this._pdfToScroller(viewport, off, 0, 0);
            const pY1 = this._pdfToScroller(viewport, off, 0, pageHeight);
      ctx.beginPath();
            ctx.moveTo(this._snapX(pY0.x), this._snapY(pY0.y));
            ctx.lineTo(this._snapX(pY1.x), this._snapY(pY1.y));
      ctx.stroke();
  
            // No extra reference lines
    }
  }
  
  async drawLeftPanelRuler() {
    const yPanel   = document.getElementById('y-density');
    const scroller = document.getElementById('pdf-scroller');
    const container = document.getElementById('pdf-canvas-container');
    if (!yPanel || !scroller || !container || !this.pdfDoc) return;
  
    yPanel.innerHTML = '';
  
    const cs = getComputedStyle(container);
    const padColor = cs.backgroundColor || 'rgb(214,153,218)';
    const dpr = window.devicePixelRatio || 1;
    const pdfStep = 15;
    const panelWidth = Math.max(36, yPanel.clientWidth || 36);
  
    const wrappers = Array.from(container.querySelectorAll('.pdf-page-wrapper'));
    if (wrappers.length === 0) return;
  
    // Build a measured model of the scroll content
    const items = [];
    const getY = (w) => this._getWrapperOffset(w, scroller).y;
  
    // Top gap (includes container top padding)
    const firstTop = Math.round(getY(wrappers[0]));
    if (firstTop > 0) items.push({ type: 'gap', h: firstTop });
  
    for (let i = 0; i < wrappers.length; i++) {
      const w = wrappers[i];
      const pageNum = +w.dataset.pageNum;
      const canvas = w.querySelector('canvas');
      const hCss = canvas ? Math.round(canvas.getBoundingClientRect().height) : Math.round(w.offsetHeight);
      const top = Math.round(getY(w));
      const bottom = top + hCss;
  
      items.push({ type: 'page', h: hCss, pageNum });
  
      // Gap to next page, or trailing bottom gap to end of content
      const nextTop = (i + 1 < wrappers.length) ? Math.round(getY(wrappers[i + 1])) : null;
      const gapH = nextTop !== null
        ? Math.max(0, nextTop - bottom)                                 // collapsed inter-page margin
        : Math.max(0, Math.round(container.scrollHeight) - bottom);     // bottom padding / tail
      if (gapH > 0) items.push({ type: 'gap', h: gapH });
    }
  
    // Paint the stack
    const stack = document.createElement('div');
    stack.style.display = 'block';
    stack.style.width = '100%';
    yPanel.appendChild(stack);
  
    for (const it of items) {
      if (it.type === 'gap') {
        const gap = document.createElement('div');
        gap.style.height = `${it.h}px`;
        gap.style.background = padColor;        // pink
        stack.appendChild(gap);
        continue;
      }
  
      // Page segment
      const seg = document.createElement('canvas');
      seg.style.display = 'block';
      seg.style.width = '100%';
      seg.style.height = `${it.h}px`;
      seg.width  = Math.floor(panelWidth * dpr);
      seg.height = Math.floor(it.h * dpr);
      stack.appendChild(seg);
  
      const ctx = seg.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, panelWidth, it.h);
  
      // Draw grid using the actual PDF→viewport map
      const page = await this.pdfDoc.getPage(it.pageNum);
      const viewport = page.getViewport({ scale: this.scale });
      const [, y0, , y1] = page.view;
      const pageHeightPdf = y1 - y0;
  
      // gray lines every 15 PDF units
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      for (let yPdf = 0; yPdf <= pageHeightPdf + 1e-6; yPdf += pdfStep) {
        const [, yLocal] = viewport.convertToViewportPoint(0, yPdf);
        const y = Math.floor(yLocal) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(panelWidth, y);
        ctx.stroke();
      }
  
      // red origin
      ctx.strokeStyle = 'rgba(220,0,0,0.9)';
      ctx.lineWidth = 1.5;
      const [, yOrigin] = viewport.convertToViewportPoint(0, 0);
      const y0px = Math.floor(yOrigin) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y0px);
      ctx.lineTo(panelWidth, y0px);
      ctx.stroke();
    }
  
    // Scroll sync
    if (!this._rulerScrollHandler) {
      this._rulerScrollHandler = () => { yPanel.scrollTop = scroller.scrollTop; };
      scroller.addEventListener('scroll', this._rulerScrollHandler);
    }
    yPanel.scrollTop = scroller.scrollTop;
  }
  
  

    addLogEntry(pane, message, level = 'info') {
        const logContent = document.getElementById(`${pane}-log-content`);
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${level}`;
        
        const timestamp = new Date().toLocaleTimeString();
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        logContent.appendChild(logEntry);
        logContent.scrollTop = logContent.scrollHeight;
        
        // Keep only last 100 entries
        while (logContent.children.length > 100) {
            logContent.removeChild(logContent.firstChild);
        }
    }

    clearLog(pane) {
        const logContent = document.getElementById(`${pane}-log-content`);
        logContent.innerHTML = '<div class="log-entry">Log cleared</div>';
    }

    // File input controls will be implemented later in the options panel
    
    toggleImagePanel(type) {
        const panel = document.getElementById(`indicator-${type}`);
        const isActive = panel.classList.contains('active');
        
        // Toggle active state
        if (isActive) {
            panel.classList.remove('active');
            this.addLogEntry('left', `Image panel ${type} deactivated`);
        } else {
            panel.classList.add('active');
            this.addLogEntry('left', `Image panel ${type} activated`);
        }
    }
    
    setupTrackpadSupport() {
        const pdfScroller = document.getElementById('pdf-scroller');
        let lastWheelTime = 0;
        
        pdfScroller.addEventListener('wheel', (e) => {
            // Check if this is a zoom gesture (Ctrl/Cmd + wheel)
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const now = Date.now();
                if (now - lastWheelTime < 100) return; // Throttle zoom
                lastWheelTime = now;
                
                if (e.deltaY < 0) {
                    this.zoomIn();
                } else {
                    this.zoomOut();
                }
            } else {
                // Regular scrolling - allow smooth scrolling
                // Don't prevent default to allow native smooth scrolling
            }
        }, { passive: false });
        
        // Add keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            const pdfScroller = document.getElementById('pdf-scroller');
            switch(e.key) {
                case 'ArrowUp':
                case 'PageUp':
                    e.preventDefault();
                    pdfScroller.scrollBy({ top: -pdfScroller.clientHeight * 0.8, behavior: 'smooth' });
                    break;
                case 'ArrowDown':
                case 'PageDown':
                    e.preventDefault();
                    pdfScroller.scrollBy({ top: pdfScroller.clientHeight * 0.8, behavior: 'smooth' });
                    break;
                case 'Home':
                    e.preventDefault();
                    pdfScroller.scrollTo({ top: 0, behavior: 'smooth' });
                    break;
                case 'End':
                    e.preventDefault();
                    pdfScroller.scrollTo({ top: pdfScroller.scrollHeight, behavior: 'smooth' });
                    break;
            }
        });
    }
    
    async loadNewPDF(file) {
        try {
            this.addLogEntry('left', 'Loading new PDF file...');
            
            // Create object URL for the file
            const fileUrl = URL.createObjectURL(file);
            
            // Load PDF with PDF.js
            const loadingTask = pdfjsLib.getDocument(fileUrl);
            this.pdfDoc = await loadingTask.promise;
            this.totalPages = this.pdfDoc.numPages;
            this.currentPage = 1;
            
            this.addLogEntry('left', `PDF loaded successfully. Pages: ${this.totalPages}`);
            
            // Render all pages
            await this.renderAllPages();
            
            // Load structure and density data for the new PDF
            await this.loadAllPageData();
            
            // Clean up object URL
            URL.revokeObjectURL(fileUrl);
            
        } catch (error) {
            this.addLogEntry('left', `Error loading PDF: ${error.message}`, 'error');
            console.error('Error loading PDF:', error);
        }
    }

    updateCurrentPage() {
        const scroller = document.getElementById('pdf-scroller');
        const pageWrappers = document.querySelectorAll('.pdf-page-wrapper');
        const overlay = document.getElementById('page-count-overlay');
        
        if (!scroller || pageWrappers.length === 0 || !overlay) return;

        // Get the vertical center of the scroller's visible area
        const scrollerCenter = scroller.scrollTop + (scroller.clientHeight / 2);

        let closestPage = 1;
        let minDistance = Infinity;

        pageWrappers.forEach(wrapper => {
            const pageTop = wrapper.offsetTop;
            const pageCenter = pageTop + (wrapper.offsetHeight / 2);
            
            // Find which page's center is closest to the scroller's center
            const distance = Math.abs(pageCenter - scrollerCenter);

            if (distance < minDistance) {
                minDistance = distance;
                closestPage = parseInt(wrapper.dataset.pageNum, 10);
            }
        });

        // Only update if page changed
        if (this.currentPage !== closestPage) {
            this.currentPage = closestPage;
            overlay.textContent = `${this.currentPage} / ${this.totalPages}`;
            // No dynamic density charts
        }
    }

    toggleOptions() {
        const optionsPanel = document.getElementById('options');
        const toggleButton = document.getElementById('options-toggle');
        const logPanel = document.getElementById('log');
        
        if (optionsPanel.classList.contains('options-collapsed')) {
            optionsPanel.classList.remove('options-collapsed');
            logPanel.classList.remove('log-expanded');
            toggleButton.textContent = '▼';
            optionsPanel.style.height = '';
        } else {
            optionsPanel.classList.add('options-collapsed');
            logPanel.classList.add('log-expanded');
            toggleButton.textContent = '▶';
            optionsPanel.style.height = '25px'; // Show a sliver
        }
    }

    copyLog() {
        const logContent = document.getElementById('left-log-content');
        const text = logContent.innerText;
        
        navigator.clipboard.writeText(text).then(() => {
            const copyButton = document.getElementById('log-copy-button');
            const originalText = copyButton.textContent;
            copyButton.textContent = 'Copied!';
            setTimeout(() => {
                copyButton.textContent = originalText;
            }, 1000);
        }).catch(err => {
            console.error('Failed to copy log:', err);
        });
    }
    
    // New methods for density and labels
    
    extractUniqueLabels() {
        const labelSet = new Set();
        
        // Scan all pages for element types
        for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
            if (this.allStructureData[pageNum] && this.allStructureData[pageNum].page) {
                const page = this.allStructureData[pageNum].page;
                if (page.elements) {
                    page.elements.forEach(element => {
                        if (element.type) {
                            labelSet.add(element.type);
                        }
                    });
                }
            }
        }
        
        this.allLabels = Array.from(labelSet).sort();
        
        // Default: all labels active
        this.activeLabels = new Set(this.allLabels);
    }
    
    syncYDensityScroll() {
        const pdfScroller = document.getElementById('pdf-scroller');
        const yDensity = document.getElementById('y-density');
        
        if (!pdfScroller || !yDensity) return;
        
        let isSyncing = false;
        
        // Sync y-density scroll with pdf-scroller (one-way: pdf -> y-density)
        pdfScroller.addEventListener('scroll', () => {
            if (isSyncing) return;
            
            requestAnimationFrame(() => {
                const pdfMaxScroll = pdfScroller.scrollHeight - pdfScroller.clientHeight;
                const scrollPercent = pdfMaxScroll > 0 ? pdfScroller.scrollTop / pdfMaxScroll : 0;
                
                const yDensityMaxScroll = yDensity.scrollHeight - yDensity.clientHeight;
                if (yDensityMaxScroll > 0) {
                    isSyncing = true;
                    yDensity.scrollTop = scrollPercent * yDensityMaxScroll;
                    requestAnimationFrame(() => {
                        isSyncing = false;
                    });
                }
            });
        });
    }
    
    renderLabelToggles() {
        const container = document.getElementById('label-checkboxes');
        container.innerHTML = '';
        
        // Define colors for each label type
        const colorScheme = {
            'text': 'rgba(33, 150, 243, 0.3)',
            'title': 'rgba(76, 175, 80, 0.3)',
            'section_header': 'rgba(255, 152, 0, 0.3)',
            'table': 'rgba(244, 67, 54, 0.3)',
            'figure': 'rgba(156, 39, 176, 0.3)',
            'list_item': 'rgba(0, 188, 212, 0.3)',
            'default': 'rgba(158, 158, 158, 0.3)'
        };
        
        this.allLabels.forEach(label => {
            const item = document.createElement('div');
            item.className = 'label-checkbox-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `label-${label}`;
            checkbox.checked = this.activeLabels.has(label);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.activeLabels.add(label);
                } else {
                    this.activeLabels.delete(label);
                }
                this.filterAnnotationsByLabels();
            });
            
            const labelEl = document.createElement('label');
            labelEl.htmlFor = checkbox.id;
            
            const swatch = document.createElement('span');
            swatch.className = 'label-color-swatch';
            swatch.style.backgroundColor = colorScheme[label] || colorScheme['default'];
            
            labelEl.appendChild(swatch);
            labelEl.appendChild(document.createTextNode(label));
            
            item.appendChild(checkbox);
            item.appendChild(labelEl);
            container.appendChild(item);
        });
    }
    
    selectAllLabels() {
        document.querySelectorAll('#label-checkboxes input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = true;
        });
        this.activeLabels = new Set(this.allLabels);
        this.filterAnnotationsByLabels();
    }
    
    deselectAllLabels() {
        document.querySelectorAll('#label-checkboxes input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });
        this.activeLabels.clear();
        this.filterAnnotationsByLabels();
    }
    
    filterAnnotationsByLabels() {
        // Hide/show overlays, annotations, and lines based on active labels
        document.querySelectorAll('.annotation-overlay').forEach(overlay => {
            const elementType = overlay.dataset.elementType;
            if (!elementType || this.activeLabels.has(elementType)) {
                overlay.style.display = '';
            } else {
                overlay.style.display = 'none';
            }
        });
        
        document.querySelectorAll('.annotation-item').forEach(item => {
            const elementType = item.dataset.elementType;
            if (!elementType || this.activeLabels.has(elementType)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
        
        document.querySelectorAll('.connection-line').forEach(line => {
            const elementType = line.dataset.elementType;
            if (!elementType || this.activeLabels.has(elementType)) {
                line.style.display = '';
            } else {
                line.style.display = 'none';
            }
        });
    }
    
    renderAllAnnotations() {
        // Render bounding boxes and annotations for all pages
        this.clearConnectionLines();
        
        for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
            if (this.allStructureData[pageNum] && this.allStructureData[pageNum].page) {
                this.renderAnnotationsForPage(pageNum);
            }
        }
    }
    
    renderAnnotationsForPage(pageNum) {
        const structureData = this.allStructureData[pageNum];
        if (!structureData || !structureData.page) return;
        
        const page = structureData.page;
        const pageWrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);
        
        if (!pageWrapper) return;
        
        // Create overlay container for this page if it doesn't exist
        let overlayContainer = pageWrapper.querySelector('.page-overlay-container');
        if (!overlayContainer) {
            overlayContainer = document.createElement('div');
            overlayContainer.className = 'page-overlay-container';
            overlayContainer.style.position = 'absolute';
            overlayContainer.style.top = '0';
            overlayContainer.style.left = '0';
            overlayContainer.style.width = '100%';
            overlayContainer.style.height = '100%';
            overlayContainer.style.pointerEvents = 'none';
            pageWrapper.style.position = 'relative';
            pageWrapper.appendChild(overlayContainer);
        }
        
        overlayContainer.innerHTML = '';
        
        const canvas = pageWrapper.querySelector('canvas');
        if (!canvas) return;
        
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvasRect.width / page.width;
        const scaleY = canvasRect.height / page.height;
        
        page.elements.forEach((element, index) => {
            if (!element.bbox || element.bbox.length !== 4) return;
            
            const [x0, y0, x1, y1] = element.bbox;
            
            // Create overlay element
            const overlay = document.createElement('div');
            overlay.className = 'annotation-overlay';
            overlay.style.position = 'absolute';
            overlay.style.left = `${x0 * scaleX}px`;
            overlay.style.top = `${y0 * scaleY}px`;
            overlay.style.width = `${(x1 - x0) * scaleX}px`;
            overlay.style.height = `${(y1 - y0) * scaleY}px`;
            overlay.dataset.page = pageNum;
            overlay.dataset.index = index;
            overlay.dataset.elementType = element.type || 'unknown';
            
            // Apply color based on type
            const color = this.getColorForType(element.type);
            overlay.style.borderColor = color.replace('0.3', '1');
            overlay.style.backgroundColor = color;
            
            overlay.addEventListener('click', () => this.selectAnnotation(index, pageNum));
            
            overlayContainer.appendChild(overlay);
        });
    }
    
    getColorForType(type) {
        const colorScheme = {
            'text': 'rgba(33, 150, 243, 0.3)',
            'title': 'rgba(76, 175, 80, 0.3)',
            'section_header': 'rgba(255, 152, 0, 0.3)',
            'table': 'rgba(244, 67, 54, 0.3)',
            'figure': 'rgba(156, 39, 176, 0.3)',
            'list_item': 'rgba(0, 188, 212, 0.3)',
        };
        return colorScheme[type] || 'rgba(158, 158, 158, 0.3)';
    }
    
    // All density chart methods moved to density-charts.js module
}

// Initialize the viewer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Johnny5Viewer();
});
