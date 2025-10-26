// Johnny5 Web Viewer JavaScript

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
        document.getElementById('pdf-scroller').addEventListener('scroll', () => this.updateCurrentPage());
        
        // Trackpad/wheel zoom support
        this.setupTrackpadSupport();
        
        // Scroll synchronization (to be implemented)
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

    async renderPage(pageNum) {
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
        try {
            // Load structure data
            const structureResponse = await fetch(`/api/structure/${this.currentPage}`);
            if (structureResponse.ok) {
                this.structureData = await structureResponse.json();
                this.renderAnnotations();
            }
            
            // Load density data
            const densityResponse = await fetch(`/api/density/${this.currentPage}`);
            if (densityResponse.ok) {
                this.densityData = await densityResponse.json();
                this.renderDensityCharts();
            }
            
        } catch (error) {
            console.error('Failed to load page data:', error);
            this.addLogEntry('left', `Failed to load page data: ${error.message}`, 'error');
        }
    }
    
    async loadAllPageData() {
        try {
            // Load structure and density data for all pages
            for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
                try {
                    const structureResponse = await fetch(`/api/structure/${pageNum}`);
                    const densityResponse = await fetch(`/api/density/${pageNum}`);
                    
                    if (structureResponse.ok) {
                        const structureData = await structureResponse.json();
                        this.addLogEntry('left', `Loaded structure data for page ${pageNum}`);
                    }
                    
                    if (densityResponse.ok) {
                        const densityData = await densityResponse.json();
                        this.addLogEntry('left', `Loaded density data for page ${pageNum}`);
                    }
                } catch (error) {
                    this.addLogEntry('left', `Failed to load data for page ${pageNum}: ${error.message}`, 'error');
                }
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
        const canvasContainerRect = this.canvas.parentElement.getBoundingClientRect();
        
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

    selectAnnotation(index) {
        // Remove previous selection
        document.querySelectorAll('.annotation-overlay.selected, .annotation-item.selected, .connection-line.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Add selection to clicked annotation and its connection line
        document.querySelectorAll(`[data-index="${index}"]`).forEach(el => {
            el.classList.add('selected');
        });
    }

    renderDensityCharts() {
        if (!this.densityData) return;
        
        this.renderXDensityChart();
        this.renderYDensityChart();
    }

    renderXDensityChart() {
        const canvas = document.getElementById('x-density-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        // Set canvas size
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        
        const data = this.densityData.x;
        if (!data || data.length === 0) return;
        
        const maxValue = Math.max(...data);
        const barWidth = canvas.width / data.length;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#4CAF50';
        
        data.forEach((value, index) => {
            const barHeight = (value / maxValue) * canvas.height;
            const x = index * barWidth;
            const y = canvas.height - barHeight;
            
            ctx.fillRect(x, y, barWidth, barHeight);
        });
    }

    renderYDensityChart() {
        const canvas = document.getElementById('y-density-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        // Set canvas size
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        
        const data = this.densityData.y;
        if (!data || data.length === 0) return;
        
        const maxValue = Math.max(...data);
        const barHeight = canvas.height / data.length;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#2196F3';
        
        data.forEach((value, index) => {
            const barWidth = (value / maxValue) * canvas.width;
            const x = canvas.width - barWidth;
            const y = index * barHeight;
            
            ctx.fillRect(x, y, barWidth, barHeight);
        });
    }

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
        this.renderAllPages();
        this.updateZoomInfo();
    }

    zoomOut() {
        this.scale = Math.max(this.scale / 1.2, 0.1);
        this.renderAllPages();
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
        canvas.style.margin = '0 auto';
        canvas.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        canvas.style.borderRadius = '4px';
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
        let isZooming = false;
        
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
            
            // Render the first page
            await this.renderPage(this.currentPage);
            
            // Load structure and density data for the new PDF
            await this.loadPageData();
            
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

        this.currentPage = closestPage;
        overlay.textContent = `${this.currentPage} / ${this.totalPages}`;
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
}

// Initialize the viewer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Johnny5Viewer();
});
