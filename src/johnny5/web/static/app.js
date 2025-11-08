// Johnny5 Web Viewer JavaScript
/* global EventSource, FormData, localStorage, ThemeToggle */

// (helper removed)

class Johnny5Viewer {
    constructor() {
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        this.eventSource = null;
        this.allStructureData = {}; // Store structure data for all pages (keyed by cache_key)
        this.allDensityData = {}; // Store density data for all pages (keyed by cache_key)
        this.loadedPages = new Set(); // Track which pages have been loaded
        this.renderedCanvases = new Set(); // Track which page canvases have been rendered (for virtualization)
        this.activeLabels = new Set(); // Currently enabled labels
        this.memoryMonitorInterval = null; // Memory monitoring timer
        this.memoryHighWarningLogged = false; // Track if we've logged high memory warning
        this.allLabels = []; // All available labels from document
        this.labelColors = {}; // Color scheme for each label type
        this.pdfLogInitialized = false; // Track if we've cleared placeholder text
        this.recLogInitialized = false; // Track if we've cleared rec log placeholder text
        this.highlightedLabels = new Set(); // Labels with persistent highlight
        this.hoveredToggleLabel = null; // Currently hovered toggle label
        this.bboxPadding = 2; // Padding for bounding box expansion (in pixels)
        this.loadedDoclingOptions = null; // Options used for currently loaded disassembly data
        this.refreshButton = null; // Reference to refresh button for indicator management
        this.disassemblyComplete = false; // Track if disassembly is complete (don't load data until ready)
        this.refreshFailed = false; // Track if the last refresh attempt failed
        
        // Multi-user support: instance identification
        this.instanceId = this._getOrCreateInstanceId();
        
        // Multi-PDF support: PDF identification
        this.pdfChecksum = null; // Current PDF checksum
        
        // Multi-option-set support: track all requested option sets
        this.requestIdMap = {}; // request_id -> {cache_key, options, status}
        this.cacheKeyStatus = {}; // cache_key -> {status, queue_position, progress, estimated_time}
        this.currentCacheKey = null; // Currently displayed cache_key
        
        // Status line for polling updates
        this.statusLineElement = null;
        this.statusPollInterval = null;
        this.cleanupTimeouts = []; // Track timeouts for cleanup
        // Overlay configurations (structured for future multiple sets like 'fixup')
        this.overlayConfigs = {
            primary: {
                bboxPadding: this.bboxPadding,
                bboxOpacity: 1,
                labelOpacity: 1,
            },
        };
        this.isRendering = false; // Flag to prevent concurrent renderAllPages calls
        this.themeGlyph = null;

        // Cache for frequently-accessed DOM elements (reduces repeated queries)
        this._elementCache = {};

        // Track containers that need clearing on document reload
        this.clearableContainers = {
            byId: [
                'pdf-canvas-container',
                'overlay-container', 
                'annotation-list',
                'pdf-y-density',
                'pdf-x-density',
                'ann-list-grid-stack'
            ],
            byClass: [
                '.ann-toggles-container'
            ],
            bySelector: [
                '.pdf-page-wrapper',
                '.pdf-page-overlay-container'
            ]
        };

        // Initialize density charts if available
        this.densityCharts = null;
        if (typeof DensityCharts !== 'undefined') {
            this.densityCharts = new DensityCharts(this);
            // Expose dump method globally for easy console access
            if (this.densityCharts) {
                window.dumpYDensity = async () => await this.densityCharts.dumpYDensityToFile();
            }
        }

        // Redirect console output to log window
        // Initialize global settings bucket (stable surface for runtime tweaks)
        window.J5 = window.J5 || {};
        window.J5.settings = window.J5.settings || { pdfStep: 15 };

        this.redirectConsoleToLog();

        this.init();

        // Scroll log to bottom to set initial state
        // this.scrollLogToBottom('left'); // Function removed - was causing errors
    }

    redirectConsoleToLog() {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        console.log = (...args) => {
            originalLog.apply(console, args);
            this.addPdfLogEntry(args.join(' '), 'info');
        };

        console.error = (...args) => {
            originalError.apply(console, args);
            this.addPdfLogEntry(args.join(' '), 'error');
        };

        console.warn = (...args) => {
            originalWarn.apply(console, args);
            this.addPdfLogEntry(args.join(' '), 'warning');
        };
    }

    // Helper method to get cached DOM elements (reduces repeated getElementById calls)
    _getElement(id) {
        if (!this._elementCache[id]) {
            this._elementCache[id] = document.getElementById(id);
        }
        return this._elementCache[id];
    }

    // Clear element cache (call when DOM elements are recreated)
    _clearElementCache() {
        this._elementCache = {};
    }

    // Generate or retrieve instance_id from localStorage
    _getOrCreateInstanceId() {
        const key = 'jny5_instance_id';
        let instanceId = localStorage.getItem(key);
        if (!instanceId) {
            // Generate UUID v4
            instanceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            localStorage.setItem(key, instanceId);
        }
        return instanceId;
    }

    // Helper to build API URLs with common query parameters
    _buildApiUrl(endpoint, params = {}) {
        const baseParams = {
            pdf_checksum: this.pdfChecksum,
            instance_id: this.instanceId,
            ...params
        };
        
        const queryString = Object.entries(baseParams)
            .filter(([, value]) => value != null) // Remove null/undefined params
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
        
        return `${endpoint}${queryString ? '?' + queryString : ''}`;
    }

    // Helper to make API calls with consistent error handling
    async _apiCall(url, options = {}) {
        let response;
        try {
            response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
        } catch (error) {
            throw new Error(`Network error: ${error.message}`);
        }
        
        let result;
        try {
            result = await response.json();
        } catch {
            // Response is not JSON (might be HTML error page, etc.)
            const text = await response.text().catch(() => 'Unable to read response');
            throw new Error(`Invalid JSON response (${response.status}): ${text.substring(0, 100)}`);
        }
        
        if (!response.ok || (result.success === false)) {
            throw new Error(result.error || `API call failed: ${response.statusText}`);
        }
        
        return result;
    }

    // Disassembly indicator state management
    updateRefreshIndicator(state) {
        if (!this.refreshButton) return;
        if (this.refreshButton.classList.contains('error') && state === 'up-to-date') {
            return;
        }

        // Remove all state classes
        this.refreshButton.classList.remove('up-to-date', 'needs-run', 'processing', 'error');

        // Add the new state class
        if (state) {
            this.refreshButton.classList.add(state);
        }
    }

    /**
     * Restore density charts after grid updates.
     * This is called whenever density grids are redrawn to ensure charts remain visible.
     */
    async _restoreDensityCharts() {
        if (this.densityCharts && Object.keys(this.allDensityData).length > 0) {
            await this.densityCharts.renderAllDensityCharts();
        }
    }

    getCurrentDoclingOptions() {
        return {
            enableOcr: !!document.getElementById('docling-ocr-cb')?.checked
        };
    }

    optionsMatch(options1, options2) {
        if (!options1 || !options2) return false;
        return options1.enableOcr === options2.enableOcr;
    }

    checkAndUpdateIndicator() {
        const current = this.getCurrentDoclingOptions();
        if (this.optionsMatch(current, this.loadedDoclingOptions)) {
            this.updateRefreshIndicator('up-to-date');
        } else {
            this.updateRefreshIndicator('needs-run');
        }
    }

    async populateLayoutModels(selectElement) {
        try {
            const response = await fetch('/api/layout-models');
            const data = await response.json();

            if (data.models && Array.isArray(data.models)) {
                // Clear existing options
                selectElement.innerHTML = '';

                // Add each model as an option with description in title
                data.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.name;
                    option.textContent = model.name;
                    option.title = model.description;
                    selectElement.appendChild(option);
                });

                // Set default value from settings or use 'pubtables'
                const defaultModel = (window.J5.settings.docling?.layoutModel) || 'pubtables';
                if (selectElement.querySelector(`option[value="${defaultModel}"]`)) {
                    selectElement.value = defaultModel;
                } else {
                    selectElement.value = data.models[0]?.name || 'pubtables';
                }
            }
        } catch (error) {
            console.error('Failed to load layout models:', error);
            // Fallback to hardcoded list
            const fallbackModels = ['pubtables', 'doclaynet'];
            fallbackModels.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                selectElement.appendChild(option);
            });
            selectElement.value = 'pubtables';
        }
    }

    // Common method to trigger disassembly refresh
    async _triggerRefresh(options, forceRefresh = true) {
        if (!this.pdfChecksum) {
            throw new Error('PDF checksum not available');
        }

        this.refreshFailed = false;

        // Format options for log message
        const optionsDesc = this._formatOptionsDescription(options);
        
        // Log request initiation
        this.addPdfLogEntry(`requesting option set ${optionsDesc} -> checksum=...`, 'info');

        let result;
        try {
            result = await this._apiCall(
                this._buildApiUrl('/api/disassemble-refresh', { force: forceRefresh }),
                {
                    method: 'POST',
                    body: JSON.stringify(options)
                }
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.addPdfLogEntry(`Disassembly refresh failed: ${message}`, 'error');
            if (this._isCurrentOptionSet(options)) {
                this.updateRefreshIndicator('error');
                this.refreshFailed = true;
                this._stopStatusPolling();
            }
            throw error;
        }

        // Handle response: {cache_key, cache_exists, request_id}
        const { cache_key, cache_exists, request_id } = result;
        
        // Validate cache_key
        if (!cache_key) {
            throw new Error('Server did not return cache_key');
        }
        
        // Update log with cache_key
        this.addPdfLogEntry(`requesting option set ${optionsDesc} -> checksum=${cache_key}`, 'info');

        // Store request_id mapping
        if (request_id) {
            this.requestIdMap[request_id] = {
                cache_key,
                options,
                status: 'pending'
            };
            
            // Start polling for status if job is in progress
            this._startStatusPolling(cache_key);
        }

        // Update cache_key status
        this._updateCacheKeyStatus(cache_key, {
            status: cache_exists ? 'completed' : 'pending',
            cache_key,
            options
        });

        // Set current cache_key if this is the active option set
        if (this._isCurrentOptionSet(options)) {
            this.currentCacheKey = cache_key;
            if (cache_exists) {
                this.updateRefreshIndicator('up-to-date');
                this.addPdfLogEntry(`options checksum=${cache_key} in cache, ready to view`, 'info');
            } else {
                this.updateRefreshIndicator('processing');
                this.addPdfLogEntry(`options checksum=${cache_key} not in cache, computing`, 'info');
            }
        }

        return result;
    }

    // Format options as human-readable string for logs
    _formatOptionsDescription(options) {
        if (options.enableOcr === undefined) {
            throw new Error('Docling options missing required property: enableOcr');
        }
        return `{OCR=${options.enableOcr ? 'on' : 'off'}}`;
    }

    // Check if options match currently displayed option set
    _isCurrentOptionSet(options) {
        if (!this.loadedDoclingOptions) return true; // First load
        return JSON.stringify(options) === JSON.stringify(this.loadedDoclingOptions);
    }

    // Check if cache_key is the currently displayed one
    _isCurrentCacheKey(cache_key) {
        return cache_key && cache_key === this.currentCacheKey;
    }

    // Update cache_key status (DRY helper)
    _updateCacheKeyStatus(cache_key, updates) {
        if (!cache_key) return;
        this.cacheKeyStatus[cache_key] = {
            ...this.cacheKeyStatus[cache_key],
            ...updates
        };
    }

    // Handle job completion/error (DRY helper)
    _handleJobCompletion(cache_key, status, options, error = null) {
        if (!cache_key) return;

        if (status === 'completed' && this.refreshFailed) {
            return;
        }

        const optionsDesc = this._formatOptionsDescription(options);
        
        // Update cache_key status
        this._updateCacheKeyStatus(cache_key, {
            status,
            progress: status === 'completed' ? 1.0 : 0.0
        });

        if (status === 'completed') {
            this.addPdfLogEntry(`options checksum=${cache_key} (options set ${optionsDesc}) ready`, 'info');
            
            if (this._isCurrentCacheKey(cache_key)) {
                this.updateRefreshIndicator('up-to-date');
                this.loadedDoclingOptions = options;
                this.disassemblyComplete = true;
                this.loadedPages.clear();
                
                this.loadAllPageData().catch(err => {
                    console.error('Error loading page data after disassembly:', err);
                    this.addPdfLogEntry(`Error loading annotations: ${err.message}`, 'error');
                    this.updateRefreshIndicator('error');
                });
            }
        } else if (status === 'error') {
            this.addPdfLogEntry(`options checksum=${cache_key} (options set ${optionsDesc}) failed: ${error || 'Unknown error'}`, 'error');
            
            if (this._isCurrentCacheKey(cache_key)) {
                this.updateRefreshIndicator('error');
            }
        }
    }

    async triggerAutoRefresh() {
        // On page load, check if cache exists for current options
        // If cache exists, load it immediately. If not, run disassembly automatically (no force refresh).
        if (!this.pdfChecksum) {
            this.addPdfLogEntry('PDF checksum not available for auto-refresh', 'warning');
            return;
        }

        try {
            const options = this.getCurrentDoclingOptions();
            const optionsDesc = this._formatOptionsDescription(options);
            
            // Check if cache exists for these options
            const result = await this._apiCall(
                this._buildApiUrl('/api/check-cache'),
                {
                    method: 'POST',
                    body: JSON.stringify(options)
                }
            );
            
            const { cache_key, cache_exists } = result;

            // Validate cache_key
            if (!cache_key) {
                throw new Error('Server did not return cache_key');
            }

            if (cache_exists) {
                // Cache exists - load it immediately
                this.addPdfLogEntry(`requesting option set ${optionsDesc} -> checksum=${cache_key}`, 'info');
                this.addPdfLogEntry(`options checksum=${cache_key} in cache, ready to view`, 'info');
                
                // Load cache data
                const loadResult = await this._apiCall(
                    this._buildApiUrl('/api/load-cache', { cache_key }),
                    { method: 'POST' }
                );
                
                if (loadResult.success) {
                    this.currentCacheKey = cache_key;
                    this._updateCacheKeyStatus(cache_key, { status: 'completed', cache_key, options });
                    this.loadedDoclingOptions = options;
                    this.updateRefreshIndicator('up-to-date');
                    
                    // Mark disassembly as complete and load data
                    this.disassemblyComplete = true;
                    await this.loadAllPageData();
                }
            } else {
                // No cache - run disassembly automatically (without force refresh)
                this.addPdfLogEntry(`requesting option set ${optionsDesc} -> checksum=...`, 'info');
                this.updateRefreshIndicator('processing');
                await this._triggerRefresh(options, false);
            }
        } catch (error) {
            this.addPdfLogEntry(`Auto-refresh check failed: ${error.message}`, 'error');
            this.updateRefreshIndicator('error');
        }
    }

    // Compute the maximum allowed scale so the page does not exceed the viewer width
    async _getMaxScale() {
        if (!this.pdfDoc) return this.scale;
        const container = document.getElementById('pdf-viewer');
        if (!container) return this.scale;
        const page = await this.pdfDoc.getPage(1);
        const viewportAtOne = page.getViewport({ scale: 1.0 });
        // Keep a tiny margin on both sides (5px each)
        const innerWidth = Math.max(0, container.clientWidth - 10);
        if (viewportAtOne.width === 0) return this.scale;
        return innerWidth / viewportAtOne.width;
    }

    async init() {

        // Initialize PDF.js
        await this.initPDFJS();

        // Setup theme toggle before wiring other UI events
        this.initializeThemeToggle();

        // Setup event listeners
        this.setupEventListeners();

        // Connect to SSE for logs
        this.connectEventStream();

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this._stopStatusPolling();
            if (this.disassemblyPollInterval) {
                clearInterval(this.disassemblyPollInterval);
                this.disassemblyPollInterval = null;
            }
            // Clear all pending cleanup timeouts
            this.cleanupTimeouts.forEach(timeout => clearTimeout(timeout));
            this.cleanupTimeouts = [];
            if (this.eventSource) {
                this.eventSource.close();
            }
        });

        // Load PDF from server (from CLI command)
        await this.loadServerPDF();

        // Scroll pdf-log to bottom on initial load
        // this.scrollLogToBottom('left'); // Function removed - was causing errors

    }

    async initPDFJS() {
        // Configure PDF.js worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        // Set default scale to 1.0; fitWidth() will calculate the correct initial scale
        this.scale = 1.0;
        // Track last fit mode so external resizes can reapply internal behavior
        this.lastFitMode = 'width';
    }

    setupEventListeners() {
        // Image panel indicators (renamed)
        const recIndicator = document.getElementById('rec-indicator');
        if (recIndicator) recIndicator.addEventListener('click', () => this.toggleImagePanel('r'));

        // PDF file input
        const fileInput = document.getElementById('pdf-file-input');
        const loadBtn = document.getElementById('load-pdf-btn');
        const fileNameDisplay = document.getElementById('current-file-name');

        if (!fileInput) {
            console.error('pdf-file-input element not found!');
        }
        if (!loadBtn) {
            console.error('load-pdf-btn element not found!');
        }

        if (loadBtn) {
            loadBtn.addEventListener('click', () => {
                console.log('Load button clicked');
                if (fileInput) {
                    fileInput.click();
                }
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                console.log('File input changed', e.target.files);
                const file = e.target.files[0];
                if (file) {
                    try {
                        // Immediately clear workspace and show loading
                        this.setIndicatorLoading('Clearing...');
                        this.clearPreviousDocument();

                        if (fileNameDisplay) {
                            fileNameDisplay.textContent = file.name;
                        }

                        // Upload file to server (triggers background disassembly)
                        await this.uploadPDF(file);

                        // Load and render PDF
                        // Skip auto-refresh since disassembly is already running from upload
                        this.setIndicatorLoading('Loading...');
                        await this.loadNewPDF(true);
                        
                        // Check cache - if disassembly is in progress, SSE will handle completion
                        await this.triggerAutoRefresh();
                    } catch (error) {
                        this.addPdfLogEntry(`Failed to load PDF: ${error.message}`, 'error');
                        console.error('Error in file upload handler:', error);
                        this.setIndicatorError();
                    }
                }
                // Reset file input so same file can be selected again
                e.target.value = '';
            });
        }

        // PDF controls (minimal overlay)
        document.getElementById('zoom-in').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoom-out').addEventListener('click', () => this.zoomOut());
        document.getElementById('fit-width').addEventListener('click', () => this.fitWidth());
        document.getElementById('fit-height').addEventListener('click', () => this.fitHeight());

        // Page navigation controls
        document.getElementById('page-prev').addEventListener('click', () => this.prevPage());
        document.getElementById('page-next').addEventListener('click', () => this.nextPage());
        document.getElementById('page-input').addEventListener('change', (e) => {
            const pageNum = parseInt(e.target.value);
            if (pageNum >= 1 && pageNum <= this.totalPages) {
                this.goToPage(pageNum);
            } else {
                // Reset to current page if invalid
                e.target.value = this.currentPage;
            }
        });
        document.getElementById('page-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.target.blur(); // Trigger change event
            }
        });

        // Options toggle
        document.getElementById('pdf-options-toggle').addEventListener('click', () => this.toggleOptions());

        // PDF log copy button
        const pdfLogCopyBtn = document.getElementById('pdf-log-copy-btn');
        if (pdfLogCopyBtn) {
            pdfLogCopyBtn.addEventListener('click', () => this.copyLogToClipboard());
        }

        // Options: PDF grid step control (live-updatable)
        try {
            const optionsPanel = document.getElementById('pdf-options');
            if (optionsPanel) {
                // Existing grid step control appended to first row with loader/name/checksum
                const pdfControls = optionsPanel.querySelector('.pdf-controls');
                const loadBtnEl = document.getElementById('load-pdf-btn');
                const firstGroup = loadBtnEl ? loadBtnEl.closest('.pdf-control-group') : null;

                // Create checksum and modified chips if not present
                if (firstGroup) {
                    // Wrap filename display into a stacked field with overtext if not already
                    const fileNameEl = document.getElementById('current-file-name');
                    if (fileNameEl && !fileNameEl.closest('.pdf-info-field')) {
                        const fileField = document.createElement('div');
                        fileField.className = 'pdf-info-field';
                        const fileLab = document.createElement('div');
                        fileLab.className = 'pdf-info-label';
                        fileLab.textContent = 'FILENAME';
                        // Move the filename span inside the field
                        const parentGroup = fileNameEl.parentElement;
                        fileField.appendChild(fileLab);
                        fileField.appendChild(fileNameEl);
                        if (parentGroup) parentGroup.insertBefore(fileField, parentGroup.querySelector('#pdf-checksum-field'));
                        fileNameEl.classList.add('pdf-info-value');
                    }
                    if (!document.getElementById('pdf-checksum-field')) {
                        const field = document.createElement('div');
                        field.className = 'pdf-info-field';
                        const lab = document.createElement('div'); lab.className = 'pdf-info-label'; lab.textContent = 'CHECKSUM';
                        const val = document.createElement('span'); val.id = 'pdf-checksum-value'; val.className = 'pdf-info-value'; val.textContent = '--';
                        field.id = 'pdf-checksum-field';
                        field.appendChild(lab); field.appendChild(val);
                        firstGroup.appendChild(field);
                    }
                    // No modified time (unreliable from server); omit that field

                // Create grid field as a stacked info field like the others
                if (!document.getElementById('pdf-grid-field')) {
                    const gridField = document.createElement('div');
                    gridField.className = 'pdf-info-field';
                    gridField.id = 'pdf-grid-field';
                    const gridLab = document.createElement('div');
                    gridLab.className = 'pdf-info-label';
                    gridLab.textContent = 'GRID';
                    const gridInput = document.createElement('input');
                    gridInput.type = 'number';
                    gridInput.id = 'pdf-step-input';
                    gridInput.min = '1';
                    gridInput.max = '500';
                    gridInput.step = '1';
                    gridInput.value = String((window.J5 && window.J5.settings && window.J5.settings.pdfStep) || 15);
                    gridInput.className = 'pdf-info-value';
                    gridInput.style.width = '80px';

                    let redrawTimer = null;
                    const applyValue = () => {
                        const val = Number(gridInput.value);
                        if (!Number.isFinite(val) || val <= 0) return;
                        window.J5.settings.pdfStep = val;
                        window.clearTimeout(redrawTimer);
                        redrawTimer = setTimeout(async () => {
                            await this.drawPdfGrid();
                            await this.drawPdfYDensityGrid();
                            await this.drawAnnotationListGrid();
                        }, 10);
                    };

                    gridInput.addEventListener('change', applyValue);
                    gridInput.addEventListener('input', applyValue);

                    // Add checkbox to toggle grid visibility (beside input on left)
                    const gridCheckbox = document.createElement('input');
                    gridCheckbox.type = 'checkbox';
                    gridCheckbox.id = 'pdf-grid-toggle';
                    gridCheckbox.checked = (window.J5 && window.J5.settings && window.J5.settings.showPdfGrid !== false); // default to true
                    gridCheckbox.style.cursor = 'pointer';
                    
                    gridCheckbox.addEventListener('change', () => {
                        window.J5.settings.showPdfGrid = gridCheckbox.checked;
                        const pdfGrid = document.getElementById('pdf-grid');
                        if (pdfGrid) {
                            pdfGrid.style.display = gridCheckbox.checked ? 'block' : 'none';
                        }
                    });

                    // Create wrapper for checkbox and input (side by side)
                    const gridControlsWrapper = document.createElement('div');
                    gridControlsWrapper.className = 'pdf-grid-controls-wrapper';
                    gridControlsWrapper.style.display = 'flex';
                    gridControlsWrapper.style.alignItems = 'center';
                    gridControlsWrapper.style.gap = '4px';
                    gridControlsWrapper.appendChild(gridCheckbox);
                    gridControlsWrapper.appendChild(gridInput);

                    gridField.appendChild(gridLab);
                    gridField.appendChild(gridControlsWrapper);
                    // Insert grid before checksum
                    const checksumField = firstGroup.querySelector('#pdf-checksum-field');
                    if (checksumField) {
                        firstGroup.insertBefore(gridField, checksumField);
                    } else {
                        firstGroup.appendChild(gridField);
                    }
                }
                } else {
                    // Fallback: if structure changed, keep a separate minimal group
                    const group = document.createElement('div');
                    group.className = 'pdf-control-group';
                    const label = document.createElement('label');
                    label.textContent = 'GRID';
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.id = 'pdf-step-input';
                    input.min = '1';
                    input.max = '500';
                    input.step = '1';
                    input.value = String((window.J5 && window.J5.settings && window.J5.settings.pdfStep) || 15);
                    input.style.width = '80px';
                    let redrawTimer = null;
                    const applyValue = () => {
                        const val = Number(input.value);
                        if (!Number.isFinite(val) || val <= 0) return;
                        window.J5.settings.pdfStep = val;
                        window.clearTimeout(redrawTimer);
                        redrawTimer = setTimeout(async () => {
                            await this.drawPdfGrid();
                            await this.drawPdfYDensityGrid();
                        }, 10);
                    };
                    input.addEventListener('change', applyValue);
                    input.addEventListener('input', applyValue);
                    const gridStack = document.createElement('div');
                    gridStack.className = 'pdf-control-group stacked';
                    gridStack.appendChild(label);
                    gridStack.appendChild(input);
                    group.appendChild(gridStack);
                    if (pdfControls) pdfControls.appendChild(group); else optionsPanel.appendChild(group);
                }

                // Disassemble subpanel (outlined)
                const subpanel = document.createElement('div');
                subpanel.className = 'disassemble-subpanel';
                const subTitle = document.createElement('div');
                subTitle.className = 'disassemble-tab';
                subTitle.textContent = 'DISASSEMBLE';
                subpanel.appendChild(subTitle);
                const subRow = document.createElement('div');
                subRow.className = 'disassemble-row';

                // Disassemble button (first)
                const refreshGroup = document.createElement('div');
                refreshGroup.className = 'pdf-control-group';
                const refreshLabel = document.createElement('label');
                refreshLabel.textContent = '\u00A0'; // Non-breaking space for consistent spacing
                
                const refreshButton = document.createElement('button');
                refreshButton.className = 'pdf-control-btn disassemble-btn needs-run'; // Start with needs-run
                refreshButton.textContent = 'Refresh';
                refreshButton.title = 'Refresh disassembly with selected options';

                // Store reference for indicator management
                this.refreshButton = refreshButton;

                refreshGroup.appendChild(refreshLabel);
                refreshGroup.appendChild(refreshButton);
                subRow.appendChild(refreshGroup);

                // OCR checkbox
                const ocrGroup = document.createElement('div');
                ocrGroup.className = 'pdf-control-group';
                const ocrLabel = document.createElement('label');
                ocrLabel.textContent = 'OCR';
                const ocrCheckbox = document.createElement('input');
                ocrCheckbox.type = 'checkbox';
                ocrCheckbox.id = 'docling-ocr-cb';
                ocrCheckbox.checked = !!(window.J5.settings.docling?.enableOcr);
                ocrGroup.appendChild(ocrLabel);
                ocrGroup.appendChild(ocrCheckbox);
                subRow.appendChild(ocrGroup);

                // Set up change listeners to check cache and load if available
                const onOptionChange = async () => {
                    const options = this.getCurrentDoclingOptions();

                    // Check if these options match what's currently loaded
                    if (this.optionsMatch(options, this.loadedDoclingOptions)) {
                        this.updateRefreshIndicator('up-to-date');
                        return;
                    }

                    // Options changed - try to load from cache
                    try {
                        const response = await fetch('/api/load-cache', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(options)
                        });

                        const result = await response.json();

                        if (result.success) {
                            // Cache loaded successfully - update state and reload page data
                            this.addPdfLogEntry(
                                `Loaded cache (${result.pages} pages, OCR: ${result.options.enable_ocr ? 'on' : 'off'})`,
                                'info'
                            );
                            this.loadedDoclingOptions = options;
                            this.updateRefreshIndicator('up-to-date');

                            // Reload all page data with new structure
                            await this.loadAllPageData();
                        } else {
                            // No cache - show red indicator (needs processing)
                            this.updateRefreshIndicator('needs-run');
                        }
                    } catch (error) {
                        console.error('Error loading cache:', error);
                        this.updateRefreshIndicator('needs-run');
                    }
                };

                ocrCheckbox.addEventListener('change', onOptionChange);
                refreshButton.addEventListener('click', async () => {
                    if (!this.pdfDoc) {
                        this.addPdfLogEntry('No PDF loaded', 'warning');
                        return;
                    }

                    try {
                        refreshButton.disabled = true;

                        // Get current options and persist
                        const options = this.getCurrentDoclingOptions();
                        window.J5.settings.docling = options;
                        try { localStorage.setItem('jny5-docling', JSON.stringify(options)); } catch {}

                        await this._triggerRefresh(options);
                        // SSE will trigger loadAllPageData() when disassembly completes
                        // Indicator will be updated to 'up-to-date' when SSE confirms completion
                    } catch (error) {
                        this.addPdfLogEntry(`Failed to start refresh: ${error.message}`, 'error');
                        this.updateRefreshIndicator('error');
                    } finally {
                        refreshButton.disabled = false;
                    }
                });
                
                // Bounding box padding control (second real option, right after grid step)
                const bboxGroup = document.createElement('div');
                bboxGroup.className = 'pdf-control-group';

                const bboxLabel = document.createElement('label');
                bboxLabel.textContent = 'Size';

                const bboxPaddingRng = document.createElement('input');
                bboxPaddingRng.type = 'range';
                bboxPaddingRng.min = '0';
                bboxPaddingRng.max = '20';
                bboxPaddingRng.value = String(this.bboxPadding);
                bboxPaddingRng.id = 'bbox-padding-range';
                bboxPaddingRng.addEventListener('input', (e) => {
                    const v = parseInt(e.target.value, 10) || 0;
                    this.bboxPadding = v;
                    this.overlayConfigs.primary.bboxPadding = v;
                    const num = document.getElementById('bbox-padding-number');
                    if (num) num.value = String(v);
                    this.updateAllBoundingBoxes();
                });

                const bboxPaddingNum = document.createElement('input');
                bboxPaddingNum.type = 'number';
                bboxPaddingNum.id = 'bbox-padding-number';
                bboxPaddingNum.min = '0';
                bboxPaddingNum.max = '20';
                bboxPaddingNum.step = '1';
                bboxPaddingNum.style.width = '60px';
                bboxPaddingNum.value = String(this.bboxPadding);
                bboxPaddingNum.addEventListener('change', (e) => {
                    const v = parseInt(e.target.value, 10);
                    if (Number.isFinite(v)) {
                        this.bboxPadding = Math.max(0, Math.min(20, v));
                        this.overlayConfigs.primary.bboxPadding = this.bboxPadding;
                        bboxPaddingRng.value = String(this.bboxPadding);
                        e.target.value = String(this.bboxPadding);
                        this.updateAllBoundingBoxes();
                    }
                });

                // Wrap multiple controls in a container for horizontal layout
                const bboxControlsWrapper = document.createElement('div');
                bboxControlsWrapper.className = 'pdf-controls-wrapper';
                bboxControlsWrapper.appendChild(bboxPaddingRng);
                bboxControlsWrapper.appendChild(bboxPaddingNum);

                bboxGroup.appendChild(bboxLabel);
                bboxGroup.appendChild(bboxControlsWrapper);

                subRow.appendChild(bboxGroup);

                // Combined overlay opacity control (bboxes, labels, lines)
                const overlayOpacityGroup = document.createElement('div');
                overlayOpacityGroup.className = 'pdf-control-group';

                const overlayOpacityLabel = document.createElement('label');
                overlayOpacityLabel.textContent = 'Opacity';

                const overlayOpacityRng = document.createElement('input');
                overlayOpacityRng.type = 'range';
                overlayOpacityRng.min = '0';
                overlayOpacityRng.max = '1';
                overlayOpacityRng.step = '0.05';
                // Use average of existing or any single current value
                const initialOverlayOpac = this.overlayConfigs.primary.overlayOpacity ?? this.overlayConfigs.primary.bboxOpacity ?? this.overlayConfigs.primary.labelOpacity ?? 1;
                this.overlayConfigs.primary.overlayOpacity = initialOverlayOpac;
                overlayOpacityRng.value = String(initialOverlayOpac);
                overlayOpacityRng.id = 'overlay-opacity-range';

                const applyOverlayOpacity = (val) => {
                    this.overlayConfigs.primary.overlayOpacity = val;
                    // Update CSS vars for broader styling reuse
                    document.body.style.setProperty('--bbox-opacity', String(val));
                    document.body.style.setProperty('--label-opacity', String(val));
                    document.body.style.setProperty('--line-opacity', String(val));

                    // Toggle visibility when fully transparent for performance
                    const toggle = (nodeList) => {
                        nodeList.forEach(el => {
                            if (val <= 0) {
                                el.style.display = 'none';
                            } else {
                                el.style.display = '';
                                el.style.opacity = String(val);
                            }
                        });
                    };
                    toggle(document.querySelectorAll('.pdf-bbox-overlay'));
                    toggle(document.querySelectorAll('.ann-list-item, .ann-list-item .ann-code'));
                    toggle(document.querySelectorAll('#connection-lines-overlay .connection-line'));
                };

                overlayOpacityRng.addEventListener('input', (e) => {
                    applyOverlayOpacity(parseFloat(e.target.value) || 0);
                });

                overlayOpacityGroup.appendChild(overlayOpacityLabel);
                overlayOpacityGroup.appendChild(overlayOpacityRng);

                subRow.appendChild(overlayOpacityGroup);

                subpanel.appendChild(subRow);
                if (pdfControls) {
                    pdfControls.appendChild(subpanel);
                } else {
                    optionsPanel.appendChild(subpanel);
                }
            }
        } catch { }

        // Page count overlay updates on scroll
        const scroller = this._getElement('pdf-scroller');
        if (scroller) {
            scroller.addEventListener('scroll', () => {
                this.updateCurrentPage();
            });
        }

        // Left ruler scroll sync handled in drawPdfYDensityGrid()

        // Trackpad/wheel zoom support
        this.setupTrackpadSupport();

        // Scroll synchronization (to be implemented)

        // Keep left ruler style in lockstep with viewer styles (no CSS duplication)
        this.setupRulerStyleSync();
        // Keep pages centered and reapply internal fit behavior on external resize
        window.addEventListener('resize', () => {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(async () => {
                try {
                    if (this.lastFitMode === 'width') {
                        await this.fitWidth();
                    } else if (this.lastFitMode === 'height') {
                        await this.fitHeight();
                    } else {
                        // Manual zoom: clamp to maxScale and rerender
                        const maxScale = await this._getMaxScale();
                        if (this.scale > maxScale) this.scale = maxScale;
                        await this.renderAllPages();
                        this.updateZoomInfo();
                    }
                } catch { }
            }, 120);
        });
    }

    connectEventStream() {
        // Connect to SSE with instance_id for filtered notifications
        this.eventSource = new EventSource(`/api/events?instance_id=${encodeURIComponent(this.instanceId)}`);

        this.eventSource.onopen = () => {
            // Connection established
        };

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                // Handle job completion notification
                if (data.type === 'job_complete') {
                    const { request_id, cache_key, status, error } = data;
                    
                    // Validate data
                    if (!cache_key || !request_id) {
                        console.warn('Invalid job_complete notification:', data);
                        return;
                    }
                    
                    // Find the request in our mapping (handle duplicate notifications gracefully)
                    const requestInfo = this.requestIdMap[request_id];
                    if (!requestInfo) {
                        // Notification for a request we don't know about (maybe from previous session)
                        console.warn(`Received notification for unknown request_id: ${request_id}`);
                        return;
                    }
                    
                    // Skip if we've already processed this status (handle duplicate SSE messages)
                    if (requestInfo.status === status) {
                        return;
                    }
                    
                    const { options } = requestInfo;
                    
                    // Update request status
                    requestInfo.status = status;
                    
                    // Handle completion/error using DRY helper
                    this._handleJobCompletion(cache_key, status, options, error);
                    
                    // Stop status polling for this cache_key
                    this._stopStatusPolling();
                    
                    // Cleanup: Remove from requestIdMap after a delay (keep for a bit in case of retries)
                    const cleanupTimeout = setTimeout(() => {
                        if (this.requestIdMap[request_id]?.status === status) {
                            delete this.requestIdMap[request_id];
                        }
                        // Remove from tracking array
                        const idx = this.cleanupTimeouts.indexOf(cleanupTimeout);
                        if (idx > -1) this.cleanupTimeouts.splice(idx, 1);
                    }, 60000); // Clean up after 1 minute
                    this.cleanupTimeouts.push(cleanupTimeout);
                    
                    return;
                }
            } catch (e) {
                this.addPdfLogEntry(`Event parse error: ${e.message}`, 'error');
            }
        };

        this.eventSource.onerror = () => {
            this.addPdfLogEntry('Event stream error - will auto-reconnect', 'warning');
            // EventSource automatically reconnects
        };
    }

    startDisassemblyPolling() {
        /**
         * Poll disassembly status as fallback when WebSocket fails
         */
        if (this.disassemblyPollInterval) {
            return; // Already polling
        }

        // Poll every 2 seconds to check if disassembly completed
        this.disassemblyPollInterval = setInterval(() => {
            this.checkDisassemblyStatus().then(isComplete => {
                if (isComplete) {
                    // Disassembly completed, load annotations
                    clearInterval(this.disassemblyPollInterval);
                    this.disassemblyPollInterval = null;
                    // Completion already logged by server
                    this.loadAllPageData().catch(error => {
                        console.error('Error loading page data after disassembly:', error);
                        this.addPdfLogEntry(`Error loading annotations: ${error.message}`, 'error');
                    });
                }
            }).catch(error => {
                console.error('Error in disassembly polling:', error);
            });
        }, 2000); // Poll every 2 seconds
    }

    initializeThemeToggle() { ThemeToggle.init(this); }

    applyTheme(mode) { ThemeToggle.applyTheme(this, mode); }

    toggleTheme() { ThemeToggle.toggleTheme(this); }

    updateThemeGlyph(mode) { ThemeToggle.updateThemeGlyph(this, mode); }

    ensureIndicatorStatusElement() { return ThemeToggle.ensureIndicatorStatusElement(); }

    setIndicatorLoading(message) { ThemeToggle.setIndicatorLoading(message); }

    setIndicatorReady() { ThemeToggle.setIndicatorReady(); }

    setIndicatorError(message) { ThemeToggle.setIndicatorError(message); }

    // Stop status polling and cleanup
    _stopStatusPolling() {
        if (this.statusPollInterval) {
            clearInterval(this.statusPollInterval);
            this.statusPollInterval = null;
        }
        this.updateStatusLine(null); // Hide status line
            this.refreshFailed = false;
    }

    // Start polling for status updates (for progress indicators)
    _startStatusPolling(cache_key) {
        if (!this.pdfChecksum || !cache_key) return;
        
        // Clear existing polling if any
        this._stopStatusPolling();
        
        // Store the cache_key we're polling for (to handle race conditions)
        const pollingCacheKey = cache_key;
        let consecutiveFailures = 0;
        const MAX_CONSECUTIVE_FAILURES = 5; // Stop after 5 consecutive failures
        
        // Poll every 3 seconds for status updates
        this.statusPollInterval = setInterval(async () => {
            // Check if we're still polling for the same cache_key (handle race condition)
            // Only stop if cache_key was removed entirely (not just if currentCacheKey changed)
            // This allows polling for background jobs even if user switched to different option set
            if (!this.cacheKeyStatus[pollingCacheKey]) {
                // Cache key was removed, stop polling
                this._stopStatusPolling();
                return;
            }
            if (this.refreshFailed) {
                this._stopStatusPolling();
                return;
            }
            
            // Check if job is already completed/errored (avoid unnecessary polling)
            const cachedStatus = this.cacheKeyStatus[pollingCacheKey]?.status;
            if (cachedStatus === 'completed' || cachedStatus === 'error') {
                this._stopStatusPolling();
                return;
            }
            
            try {
                const statusData = await this._apiCall(
                    this._buildApiUrl('/api/disassembly-status', { cache_key: pollingCacheKey })
                );
                    
                // Reset failure counter on success
                consecutiveFailures = 0;
                    
                // Update cache_key status
                this._updateCacheKeyStatus(pollingCacheKey, statusData);
                
                // Update status line if this is the current cache_key
                if (this._isCurrentCacheKey(pollingCacheKey)) {
                    this.updateStatusLine(statusData);
                    
                    // Update indicator based on status
                    if (statusData.status === 'completed') {
                        this.updateRefreshIndicator('up-to-date');
                    } else if (statusData.status === 'error') {
                        this.updateRefreshIndicator('error');
                    }
                }
                
                // Stop polling if job is completed or errored
                if (statusData.status === 'completed' || statusData.status === 'error') {
                    this._stopStatusPolling();
                }
            } catch (error) {
                consecutiveFailures++;
                console.warn(`Error polling status (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, error);
                
                // Stop polling after too many consecutive failures (likely network issue or server down)
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    console.error('Stopping status polling due to repeated failures');
                    this._stopStatusPolling();
                    if (this._isCurrentCacheKey(pollingCacheKey)) {
                        this.updateRefreshIndicator('error');
                        this.addPdfLogEntry('Status polling failed - check connection', 'error');
                    }
                }
            }
        }, 3000); // Poll every 3 seconds
    }

    async checkDisassemblyStatus() {
        /**
         * Check disassembly status for current cache_key
         * Returns true if disassembly is complete, false if still pending/in progress
         */
        if (!this.pdfChecksum || !this.currentCacheKey) {
            return false;
        }
        
        try {
            const status = await this._apiCall(
                this._buildApiUrl('/api/disassembly-status', { cache_key: this.currentCacheKey })
            );
            return status.status === 'completed';
        } catch (error) {
            console.warn('Error checking disassembly status:', error);
            return false;
        }
    }

    async loadServerPDF() {
        await this.loadPDFFromServer();
    }

    async loadPDFFromServer(skipAutoRefresh = false) {
        try {
            this.setIndicatorLoading('Loading...');

            // Get PDF info from server to display filename
            let pdfName = 'PDF';
            try {
                const info = await this._apiCall('/api/pdf-info');
                const displayName = (info.display_name || '').trim();
                if (displayName) {
                    pdfName = displayName;
                } else {
                    const pathStr = info.pdf_path || '';
                    pdfName = pathStr.split('/').pop() || pathStr.split('\\').pop() || 'PDF';
                }
                // Update checksum and store for later use
                if (info.checksum) {
                    this.pdfChecksum = info.checksum;
                    const sumVal = document.getElementById('pdf-checksum-value');
                    if (sumVal) {
                        sumVal.textContent = String(info.checksum);
                        sumVal.title = String(info.checksum);
                    }
                }
            } catch (e) {
                console.warn('Could not fetch PDF info:', e);
            }


            // Load PDF from server immediately (don't wait for disassembly)
            // Use pdfChecksum if available, otherwise use cache buster
            const pdfUrl = this.pdfChecksum 
                ? this._buildApiUrl('/api/pdf', { pdf_checksum: this.pdfChecksum })
                : `/api/pdf?t=${Date.now()}`; // Fallback cache buster if checksum not available

            const loadingTask = pdfjsLib.getDocument(pdfUrl);
            this.pdfDoc = await loadingTask.promise;
            this.totalPages = this.pdfDoc.numPages;
            this.currentPage = 1;

            this.addPdfLogEntry(`Loading: ${pdfName} (${this.totalPages} pages)`, 'info');

            // Reflect loaded file name in UI
            const fileNameDisplay = document.getElementById('current-file-name');
            if (fileNameDisplay) fileNameDisplay.textContent = pdfName;

            // Initialize page navigation (will show 0 rendered pages initially)
            this.updatePageNavigation();

            // Initialize pageViewportHeights if not already initialized
            if (!this.pageViewportHeights) {
                this.pageViewportHeights = {};
            }
            if (!this.pageViewportWidths) {
                this.pageViewportWidths = {};
            }

            // Fit to width and render PDF first (so user sees something immediately)
            // This will also create placeholders and update scrollbar height
            await this.fitWidth();

            // Trigger automatic refresh with default options on page load
            // Skip if disassembly is already running (e.g., from upload)
            if (!skipAutoRefresh) {
                await this.triggerAutoRefresh();
            }

            // Note: checkDisassemblyStatus and manual loading removed
            // Auto-refresh handles the full flow: red → yellow pulsing → green

            this.setIndicatorReady();

            // Start memory monitoring
            this.startMemoryMonitoring();

        } catch (error) {
            console.error('Error loading PDF:', error);
            this.addPdfLogEntry(`Error loading PDF: ${error.message}`, 'error');
            this.setIndicatorError();
        }
    }

    startMemoryMonitoring() {
        // Clear any existing monitor
        if (this.memoryMonitorInterval) {
            clearInterval(this.memoryMonitorInterval);
        }

        // Update function
        const updateMemory = () => {
            if (!this.renderedCanvases) return;

            const annProgress = document.getElementById('ann-progress');
            if (!annProgress) return;

            const canvasCount = this.renderedCanvases.size;
            let totalMemoryMB = 0;

            // Calculate total canvas memory
            document.querySelectorAll('canvas.pdf-page-canvas').forEach(canvas => {
                totalMemoryMB += (canvas.width * canvas.height * 4) / (1024 * 1024);
            });

            // Display canvas memory and warn if getting high
            let memoryText = `${totalMemoryMB.toFixed(1)} MB [${canvasCount} pages]`;
            const memoryWarning = totalMemoryMB > 500 || canvasCount > 30;
            if (memoryWarning) {
                memoryText = `⚠ ${memoryText}`;
            }
            annProgress.textContent = memoryText;
            
            // Log warning if memory is getting high
            if (totalMemoryMB > 1000 && !this.memoryHighWarningLogged) {
                this.addPdfLogEntry(`High memory usage: ${totalMemoryMB.toFixed(1)}MB canvas memory. Consider reducing zoom or scrolling to unload pages.`, 'warning');
                this.memoryHighWarningLogged = true;
            } else if (totalMemoryMB <= 1000 && this.memoryHighWarningLogged) {
                this.memoryHighWarningLogged = false;
            }
        };

        // Update memory stats in ann-progress every 5 seconds
        this.memoryMonitorInterval = setInterval(updateMemory, 5000);
        
        // Update immediately on first call
        updateMemory();
    }


    async loadPageData(pageNum) {
        /**
         * Load structure and density data for a single page
         * Returns true if data was loaded, false if already loaded or failed
         * Only loads data if disassembly is complete
         */
        // Don't try to load data until disassembly is complete
        if (!this.disassemblyComplete) {
            return false;
        }
        
        if (this.loadedPages.has(pageNum)) {
            return false; // Already loaded
        }

        if (!this.currentCacheKey) {
            // No cache_key available yet - skip loading
            return false;
        }

        try {
            // Load structure and density data in parallel
            const [structureResponse, densityResponse] = await Promise.all([
                fetch(this._buildApiUrl(`/api/structure/${pageNum}`, { cache_key: this.currentCacheKey })),
                fetch(this._buildApiUrl(`/api/density/${pageNum}`, { cache_key: this.currentCacheKey }))
            ]);

            let dataLoaded = false;

            if (structureResponse.ok) {
                const structureData = await structureResponse.json();
                // Check if response contains an error (expected during disassembly)
                if (structureData.error) {
                    // Structure data not available yet - this is normal during disassembly
                    // Don't log or mark as error, just skip silently
                } else {
                    this.allStructureData[pageNum] = structureData;
                    dataLoaded = true;
                    // Update checksum from disassembled lossless JSON metadata if present
                    try {
                        const checksum = structureData?.metadata?._checksum || structureData?.metadata?.checksum;
                        const sumVal = document.getElementById('pdf-checksum-value');
                        if (sumVal && checksum) {
                            sumVal.textContent = String(checksum);
                            sumVal.title = String(checksum);
                        }
                    } catch {}
                }
            }

            if (densityResponse.ok) {
                const densityData = await densityResponse.json();
                if (!densityData.error) {
                    this.allDensityData[pageNum] = densityData;
                    dataLoaded = true;
                }
            }

            // Only mark as loaded if we actually got data
            // This allows retrying later when disassembly completes
            if (dataLoaded) {
                this.loadedPages.add(pageNum);
                return true;
            }
            
            // Data not available yet - return false but don't log (expected during disassembly)
            return false;
        } catch (error) {
            // Network errors are unexpected - only log if it's not a fetch error during disassembly
            // "Failed to fetch" usually means the request was aborted or server is busy
            if (!error.message.includes('Failed to fetch')) {
                console.warn(`Unexpected error loading data for page ${pageNum}: ${error.message}`);
            }
            return false;
        }
    }

    async loadVisiblePages() {
        /**
         * Load data for currently visible pages plus a buffer
         * Asymmetric buffer: 2 pages back, 8 forward (users scroll forward more)
         * Also unloads pages outside the buffer to save memory
         */
        const BUFFER_BACK = 2;    // Pages to keep behind current
        const BUFFER_FORWARD = 8; // Pages to keep ahead of current
        const startPage = Math.max(1, this.currentPage - BUFFER_BACK);
        const endPage = Math.min(this.totalPages, this.currentPage + BUFFER_FORWARD);

        // Unload page DATA outside the buffer to free memory
        const pagesToUnload = [];
        for (const pageNum of this.loadedPages) {
            if (pageNum < startPage || pageNum > endPage) {
                pagesToUnload.push(pageNum);
            }
        }

        for (const pageNum of pagesToUnload) {
            delete this.allStructureData[pageNum];
            delete this.allDensityData[pageNum];
            this.loadedPages.delete(pageNum);
        }

        // Remove CANVASES outside the buffer to free GPU memory
        if (this.renderedCanvases) {
            const canvasesToRemove = [];
            for (const pageNum of this.renderedCanvases) {
                if (pageNum < startPage || pageNum > endPage) {
                    canvasesToRemove.push(pageNum);
                }
            }

            for (const pageNum of canvasesToRemove) {
                await this.removeCanvasForPage(pageNum);
            }
        }

        // Load page data in the buffer
        const dataPromises = [];
        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
            if (!this.loadedPages.has(pageNum)) {
                dataPromises.push(this.loadPageData(pageNum).catch(() => false));
            }
        }

        // Render canvases in the buffer
        const canvasPromises = [];
        if (this.renderedCanvases) {
            for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
                if (!this.renderedCanvases.has(pageNum)) {
                    canvasPromises.push(this.renderCanvasForPage(pageNum).catch(() => {}));
                }
            }
        }

        if (dataPromises.length > 0 || canvasPromises.length > 0) {
            await Promise.all([...dataPromises, ...canvasPromises]);
            // Update UI only if new data was loaded
            if (dataPromises.length > 0) {
                await this.extractUniqueLabels();
                this.renderLabelToggles();
                await this.renderAllAnnotations();
            }
        }
    }

    async loadAllPageData() {
        /**
         * Initial load - only load first few pages for fast startup
         * Rest will be loaded lazily as user scrolls
         */
        try {
            const INITIAL_PAGES = 5; // Load first 5 pages immediately
            const initialEndPage = Math.min(this.totalPages, INITIAL_PAGES);

            // Load initial pages
            for (let pageNum = 1; pageNum <= initialEndPage; pageNum++) {
                await this.loadPageData(pageNum);
            }

            const loadedCount = this.loadedPages.size;
            if (loadedCount > 0) {

                // After loading initial data, extract unique labels and build toggle UI
                // Load all structure data first to get labels from entire document
                await this.extractUniqueLabels();
                this.renderLabelToggles();

                // Render annotations for loaded pages
                await this.renderAllAnnotations();

                // Draw grids
                await this.drawPdfGrid();
                await this.drawPdfYDensityGrid();
                await this.drawPdfXDensityGrid();
                await this.drawAnnotationsGrid();

                // Render density charts when data is available
                await this._restoreDensityCharts();

                // Log annotation statistics
                let totalBoundingBoxes = 0;
                const typeCounts = {};
                
                for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
                    if (this.allStructureData[pageNum] && this.allStructureData[pageNum].page) {
                        const page = this.allStructureData[pageNum].page;
                        if (page.elements) {
                            page.elements.forEach(element => {
                                totalBoundingBoxes++;
                                const type = element.type || 'unknown';
                                typeCounts[type] = (typeCounts[type] || 0) + 1;
                            });
                        }
                    }
                }

                const typeList = Object.entries(typeCounts)
                    .sort((a, b) => b[1] - a[1]) // Sort by count descending
                    .map(([type, count]) => `${type}:${count}`)
                    .join(', ');

                this.addPdfLogEntry(`${totalBoundingBoxes} bounding boxes found (${typeList})`);
            } else {
                // Structure data not available yet (will be available after disassembly)
            }
        } catch (error) {
            this.addPdfLogEntry(`Failed to load page data: ${error.message}`, 'error');
        }
    }

    clearConnectionLines() {
        const svg = document.getElementById('connection-lines-overlay');
        if (!svg) return;

        const connectionLines = svg.querySelectorAll('.connection-line');
        connectionLines.forEach(line => {
            if (line._cleanup) {
                line._cleanup();
            }
            line.remove();
        });
    }

    syncConnectedStyles(overlay, listItem, pageNum, index) {
        // Find all connected elements if not provided
        if (!overlay && pageNum !== null && index !== null) {
            overlay = document.querySelector(`.pdf-bbox-overlay[data-page="${pageNum}"][data-index="${index}"]`);
        }
        if (!listItem && pageNum !== null && index !== null) {
            listItem = document.querySelector(`.ann-list-item[data-page="${pageNum}"][data-index="${index}"]`);
        }
        if (!overlay || !listItem) return;
        
        // Find connection line and ann-code
        const connectionLine = document.querySelector(`#connection-lines-overlay .connection-line[data-page="${pageNum}"][data-index="${index}"]`);
        const annCode = listItem.querySelector('.ann-code');
        if (!connectionLine || !annCode) return;
        
        // Read border-width from CSS custom property (CSS controls the value based on hover/selected state)
        const borderWidth = window.getComputedStyle(overlay).getPropertyValue('--bbox-border-width').trim();
        
        // Apply same border-width to connection line and ann-code
        if (borderWidth) {
            connectionLine.style.borderTopWidth = borderWidth;
            annCode.style.borderWidth = borderWidth;
        }
    }

    selectAnnotation(index, pageNum = null) {
        // Check if clicking on an already-selected annotation (deselect it)
        if (pageNum !== null) {
            const overlay = document.querySelector(`.pdf-bbox-overlay[data-page="${pageNum}"][data-index="${index}"]`);
            if (overlay && overlay.classList.contains('selected')) {
                // Deselect this annotation
                overlay.classList.remove('selected');
                const listItem = document.querySelector(`.ann-list-item[data-page="${pageNum}"][data-index="${index}"]`);
                const connectionLine = document.querySelector(`#connection-lines-overlay .connection-line[data-page="${pageNum}"][data-index="${index}"]`);
                if (listItem) listItem.classList.remove('selected');
                if (connectionLine) connectionLine.classList.remove('selected');
                this.syncConnectedStyles(overlay, listItem, pageNum, index);
                return; // Early return - deselected, no need to select
            }
        }

        // Remove previous selection and sync styles for deselected elements
        document.querySelectorAll('.pdf-bbox-overlay.selected').forEach(overlay => {
            overlay.classList.remove('selected');
            const page = overlay.dataset.page;
            const idx = overlay.dataset.index;
            const listItem = document.querySelector(`.ann-list-item[data-page="${page}"][data-index="${idx}"]`);
            this.syncConnectedStyles(overlay, listItem, page, idx);
        });
        
        // Remove selected class from list items and connection lines
        document.querySelectorAll('.ann-list-item.selected, #connection-lines-overlay .connection-line.selected').forEach(el => {
            el.classList.remove('selected');
        });

        // Add selection to clicked annotation and its connection line
        if (pageNum !== null) {
            // Multi-page workflow: use both page and index
            const selectedElements = document.querySelectorAll(`.pdf-bbox-overlay[data-page="${pageNum}"][data-index="${index}"], .ann-list-item[data-page="${pageNum}"][data-index="${index}"], #connection-lines-overlay .connection-line[data-page="${pageNum}"][data-index="${index}"]`);
            selectedElements.forEach(el => {
                el.classList.add('selected');
                
                // Update connection line color to match annotation color when selected
                if (el.classList.contains('pdf-connection-line')) {
                    const elementType = el.dataset.elementType;
                    const rgb = this.getColorRGB(elementType);
                    const rgbStr = `rgb(${rgb.join(', ')})`;
                    el.style.setProperty('--connection-line-color', rgbStr);
                    el.style.opacity = '1';
                }
            });
            
            // Sync styles after selection state is applied
            const overlay = document.querySelector(`.pdf-bbox-overlay[data-page="${pageNum}"][data-index="${index}"]`);
            const listItem = document.querySelector(`.ann-list-item[data-page="${pageNum}"][data-index="${index}"]`);
            if (overlay) {
                this.syncConnectedStyles(overlay, listItem, pageNum, index);
            }
        } else {
            // Fallback for old single-page workflow
            const selector = `[data-index="${index}"]`;
        document.querySelectorAll(selector).forEach(el => {
            el.classList.add('selected');
        });
        }
    }

    // Density chart rendering moved to DensityCharts module

    zoomIn() {
        (async () => {
            const maxScale = await this._getMaxScale();
            this.scale = Math.min(this.scale * 1.2, maxScale);
            await this.renderAllPages();
            this.updateZoomInfo();
            this.lastFitMode = 'manual';
        })();
    }

    zoomOut() {
        (async () => {
            const maxScale = await this._getMaxScale();
            // Allow zooming out freely but cap on the high end by maxScale
            this.scale = Math.max(this.scale / 1.2, 0.1);
            // If zoomed out and then in again, ensure we never exceed maxScale
            if (this.scale > maxScale) this.scale = maxScale;
            await this.renderAllPages();
            this.updateZoomInfo();
            this.lastFitMode = 'manual';
        })();
    }

    async renderAllPages() {
        if (!this.pdfDoc) {
            console.error('No PDF document loaded');
            return;
        }

        // Prevent concurrent render calls
        if (this.isRendering) {
            return;
        }

        this.isRendering = true;

        let annotationsRebuilt = false;
        try {
            // Ensure we never render beyond the max allowed scale
            const maxScale = await this._getMaxScale();
            if (this.scale > maxScale) this.scale = maxScale;


            const container = this._getElement('pdf-canvas-container');
            if (!container) {
                console.error('PDF canvas container not found');
                this.isRendering = false;
                return;
            }

            // Center pages and keep tiny margins on both sides
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.alignItems = 'center';
            container.style.padding = '5px 5px'; // 5px top/bottom and sides

            // Lazy loading: only create placeholders for visible buffer, not all pages
            const existingPlaceholders = container.querySelectorAll('.pdf-page-wrapper');
            const hasAnyPlaceholders = existingPlaceholders.length > 0;

            if (!hasAnyPlaceholders) {
                // Initial load - create placeholders only for visible buffer
                container.innerHTML = ''; // Clear existing content
                this.pageViewportHeights = {};
                this.pageViewportWidths = {};
                this.renderedCanvases.clear();

                // Create placeholders only for initial visible pages
                const BUFFER_BACK = 2;
                const BUFFER_FORWARD = 8;
                const startPage = Math.max(1, this.currentPage - BUFFER_BACK);
                const endPage = Math.min(this.totalPages, this.currentPage + BUFFER_FORWARD);

                for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
                    try {
                        await this.createPagePlaceholder(pageNum, container);
                    } catch (error) {
                        console.error(`Failed to create placeholder for page ${pageNum}:`, error);
                    }
                }
            } else {
                // Placeholders exist, just update their dimensions for new scale
                this.pageViewportHeights = {};
                this.pageViewportWidths = {};

                // Don't clear renderedCanvases - we'll update it as we go
                const oldRenderedCanvases = new Set(this.renderedCanvases);
                this.renderedCanvases.clear();

                for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
                    try {
                        const page = await this.pdfDoc.getPage(pageNum);
                        const viewport = page.getViewport({ scale: this.scale });

                        this.pageViewportHeights[pageNum] = viewport.height;
                        this.pageViewportWidths[pageNum] = viewport.width;

                        const pageWrapper = container.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);
                        if (pageWrapper) {
                            // Update wrapper dimensions for new scale
                            pageWrapper.style.width = Math.floor(viewport.width) + 'px';
                            pageWrapper.style.height = Math.floor(viewport.height) + 'px';

                            // Remove canvas if it was rendered at the old scale (will be re-rendered at new scale below)
                            if (oldRenderedCanvases.has(pageNum)) {
                                const oldCanvas = pageWrapper.querySelector('canvas');
                                if (oldCanvas) {
                                    oldCanvas.remove();
                                }
                                pageWrapper.style.backgroundColor = ''; // Reset to placeholder appearance
                            }
                        }
                    } catch (error) {
                        console.error(`Failed to update placeholder for page ${pageNum}:`, error);
                    }
                }
            }

            // Now render canvases only for initial visible pages
            const BUFFER_BACK = 2;
            const BUFFER_FORWARD = 8;
            const startPage = Math.max(1, this.currentPage - BUFFER_BACK);
            const endPage = Math.min(this.totalPages, this.currentPage + BUFFER_FORWARD);

            for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
                try {
                    await this.renderCanvasForPage(pageNum);
                } catch (error) {
                    console.error(`Failed to render canvas for page ${pageNum}:`, error);
                }
            }


            // Add extra padding at bottom equal to one page height for easier viewing of bottom elements
            if (this.totalPages > 0) {
                const lastPageWrapper = container.querySelector(`.pdf-page-wrapper[data-page-num="${this.totalPages}"]`);
                if (lastPageWrapper) {
                    const lastPageHeight = lastPageWrapper.offsetHeight || lastPageWrapper.getBoundingClientRect().height;
                    // Add one full page height to existing bottom padding (5px base + page height)
                    container.style.paddingBottom = `${lastPageHeight + 5}px`;
                }
            }
            if (Object.keys(this.allStructureData).length > 0) {
                await this.renderAllAnnotations();
                annotationsRebuilt = true;
            }

            // Update the page counter after render (ensures overlay text is correct)
            this.updateCurrentPage();

            // Sync panel heights to scroller viewport (measure right before drawing)
            const scroller = this._getElement('pdf-scroller');
            const yPanel = this._getElement('pdf-y-density');
            if (yPanel && scroller) {
                yPanel.style.height = scroller.clientHeight + 'px';
            }
            const yRightPanel = this._getElement('pdf-annotations');
            if (yRightPanel && scroller) {
                yRightPanel.style.height = scroller.clientHeight + 'px';
            }

            // Draw verification grid overlay aligned to PDF scroll space
            await this.drawPdfGrid();
            // Draw left ruler inside the y-density panel aligned to PDF coordinates (creates grid)
            await this.drawPdfYDensityGrid();
            // Draw top ruler and right annotations grid
            await this.drawPdfXDensityGrid();
            await this.drawAnnotationsGrid();
            // Render density charts when data is available (grid drawing preserves existing canvases)
            await this._restoreDensityCharts();
            // Redraw annotation list grid to match updated PDF layout
            if (!annotationsRebuilt) {
                await this.drawAnnotationListGrid();
            }
        } catch (error) {
            console.error('Error rendering pages:', error);
            this.addPdfLogEntry(`Error rendering pages: ${error.message}`, 'error');
        } finally {
            this.isRendering = false;
        }
    }

    async createPagePlaceholder(pageNum, container) {
        /**
         * Create a lightweight placeholder div for a page
         * This reserves the correct amount of space without rendering the canvas
         */
        const page = await this.pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: this.scale });

        // Store viewport dimensions
        this.pageViewportHeights[pageNum] = viewport.height;
        this.pageViewportWidths[pageNum] = viewport.width;

        // Create page wrapper with correct dimensions
        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'pdf-page-wrapper';
        pageWrapper.dataset.pageNum = pageNum;
        pageWrapper.style.margin = '0 auto 5px auto';
        pageWrapper.style.position = 'relative';
        pageWrapper.style.width = Math.floor(viewport.width) + 'px';
        pageWrapper.style.height = Math.floor(viewport.height) + 'px';
        // Placeholder background handled by CSS

        container.appendChild(pageWrapper);
    }

    async renderCanvasForPage(pageNum) {
        /**
         * Render the actual canvas for a specific page
         * Called on-demand for visible pages only
         * Creates placeholder if it doesn't exist
         */
        // Skip if canvas already rendered
        if (this.renderedCanvases.has(pageNum)) {
            return;
        }

        let pageWrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);
        if (!pageWrapper) {
            // Placeholder doesn't exist - create it first
            const container = this._getElement('pdf-canvas-container');
            if (!container) return;
            await this.createPagePlaceholder(pageNum, container);
            pageWrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);
            if (!pageWrapper) return; // Still not found after creation
        }

        try {
            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: this.scale });

            // Create canvas with high-DPI support
            const canvas = document.createElement('canvas');
            canvas.classList.add('pdf-page-canvas');
            canvas.dataset.pageNum = pageNum;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                throw new Error('Failed to get 2d context');
            }

            // Get the screen's pixel ratio for high-DPI rendering
            // At high zoom levels (>100%), reduce devicePixelRatio to prevent GPU memory issues
            // This keeps canvas backing store sizes manageable while maintaining quality
            const basePixelRatio = window.devicePixelRatio || 1;
            const scale = this.scale;

            // Adaptive scaling: reduce pixel ratio at high zoom
            // At 100% zoom: use full devicePixelRatio
            // At 118% zoom: use devicePixelRatio / 1.18 (reduces from 2.0 to 1.69)
            // At 150% zoom: use devicePixelRatio / 1.5 (reduces from 2.0 to 1.33)
            const outputScale = scale > 1.0
                ? basePixelRatio / scale
                : basePixelRatio;

            // Set CANVAS PIXEL size (backing store)
            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);

            // Set CANVAS DISPLAY size (CSS)
            canvas.style.width = Math.floor(viewport.width) + 'px';
            canvas.style.height = Math.floor(viewport.height) + 'px';
            canvas.style.display = 'block';
            canvas.style.margin = '0';

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

            // Clear placeholder background and add canvas
            pageWrapper.style.backgroundColor = '';
            pageWrapper.innerHTML = ''; // Clear any placeholder content
            pageWrapper.appendChild(canvas);

            this.renderedCanvases.add(pageNum);

        } catch (error) {
            console.error(`[Canvas] ERROR rendering page ${pageNum}:`, error);
            throw error;
        }
    }

    async removeCanvasForPage(pageNum) {
        /**
         * Remove the rendered canvas for a page to free memory
         * Converts back to a lightweight placeholder
         */
        const pageWrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);
        if (!pageWrapper) return;

        // Remove canvas but keep wrapper dimensions
        const canvas = pageWrapper.querySelector('canvas');
        if (canvas) {
            canvas.remove();
        }

        // Restore placeholder appearance (CSS handles background)
        pageWrapper.style.backgroundColor = '';
        pageWrapper.innerHTML = '';

        this.renderedCanvases.delete(pageNum);
    }

    async fitWidth() {
        if (!this.pdfDoc) return;

        const container = document.getElementById('pdf-viewer');
        if (!container) {
            console.warn('PDF viewer container not found');
            return;
        }
        
        // Container should have dimensions if called after DOM is ready
        // If not, wait one frame for layout
        if (container.clientWidth === 0) {
            await new Promise(resolve => requestAnimationFrame(resolve));
        }

        const page = await this.pdfDoc.getPage(1);
        const viewport = page.getViewport({ scale: 1.0 });
        // Use 10px padding (5px left/right) from .pdf-canvas-container
        const containerWidth = container.clientWidth - 10;

        // Calculate scale for width (max allowed)
        this.scale = containerWidth / viewport.width;

        await this.renderAllPages(); // Await the render
        this.updateZoomInfo();
        this.lastFitMode = 'width';
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

        await this.renderAllPages();
        this.updateZoomInfo();
        this.lastFitMode = 'height';
    }

    // Observe style/layout changes to mirror gaps/background to the left ruler via logic
    setupRulerStyleSync() {
        const container = document.getElementById('pdf-canvas-container');
        const scroller = document.getElementById('pdf-scroller');
        if (!container || !scroller) return;

        const refresh = async () => {
            // Recompute padding/background and per-page gaps
            // Grid drawing preserves density canvases automatically
            await this.drawPdfYDensityGrid();
            await this.drawPdfXDensityGrid();
            await this.drawAnnotationsGrid();
        };

        // Observe container style/class changes
        try {
            this._rulerContainerObserver?.disconnect?.();
        } catch { }
        if (window.MutationObserver) {
            const containerObserver = new window.MutationObserver(refresh);
            containerObserver.observe(container, { attributes: true, attributeFilter: ['style', 'class'] });
            this._rulerContainerObserver = containerObserver;
        }

        // Observe page wrapper additions/removals, and watch each wrapper's style/class
        try {
            this._rulerListObserver?.disconnect?.();
        } catch { }
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
            } catch { }
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
            y: (wr.top - sr.top) + scroller.scrollTop,
        };
    }

    // Helper to sync scroll between two elements (one-way: source -> target)
    _syncScroll(source, target, handlerName, axis = 'vertical') {
        if (!source || !target) return;
        
        const handler = this[handlerName];
        if (!handler) {
            this[handlerName] = () => {
                if (axis === 'vertical') {
                    target.scrollTop = source.scrollTop;
                } else {
                    target.scrollLeft = source.scrollLeft;
                }
            };
            source.addEventListener('scroll', this[handlerName]);
        }
        
        // Initial sync
        if (axis === 'vertical') {
            target.scrollTop = source.scrollTop;
        } else {
            target.scrollLeft = source.scrollLeft;
        }
    }

    // Compute the top position for a 1D connector line so that
    // its visual center (border-top) aligns with a given midpoint Y.
    _computeConnectorTopForMidpoint(lineElement, midpointY) {
        const cs = window.getComputedStyle(lineElement);
        const bw = parseFloat(cs.borderTopWidth) || 1;
        const marginTop = parseFloat(cs.marginTop) || 0;
        // Account for border width and margin to center the line
        // margin-top shifts the element, so we subtract it (margin-top is negative, so this adds)
        let top = midpointY - (bw / 2) - marginTop;
        // Odd pixel widths align crisply on half pixels; even on whole pixels
        if (Math.round(bw) % 2 === 1) {
            top = Math.floor(top) + 0.5;
        } else {
            top = Math.round(top);
        }
        return top;
    }

    // Helper to draw a horizontal line on canvas
    _drawHorizontalLine(ctx, y, width, color, lineWidth) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    // Helper to draw a vertical line on canvas
    _drawVerticalLine(ctx, x, height, color, lineWidth) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    async drawPdfGrid() {
        const scroller = this._getElement('pdf-scroller');
        const container = this._getElement('pdf-canvas-container');
        if (!scroller || !container || !this.pdfDoc) return;

        // Remove existing containers
        const existingGrid = document.getElementById('pdf-grid');
        if (existingGrid) existingGrid.remove();
        const existingMargins = document.getElementById('pdf-grid-margins');
        if (existingMargins) existingMargins.remove();

        // Create margin container (always visible)
        const marginContainer = document.createElement('div');
        marginContainer.id = 'pdf-grid-margins';
        scroller.appendChild(marginContainer);

        // Create grid container (toggleable - only for grid lines)
        // Use a container div, but we'll add a data attribute so tests can find the canvas
        const gridContainer = document.createElement('div');
        gridContainer.id = 'pdf-grid';
        // Respect visibility setting
        const showGrid = (window.J5 && window.J5.settings && window.J5.settings.showPdfGrid !== false);
        gridContainer.style.display = showGrid ? 'block' : 'none';
        scroller.appendChild(gridContainer);

        const dpr = window.devicePixelRatio || 1;
        const pdfStep = (window.J5 && window.J5.settings && window.J5.settings.pdfStep) ?? 15;
        const wrappers = Array.from(container.querySelectorAll('.pdf-page-wrapper'));
        if (wrappers.length === 0) return;

        const items = this._buildPageMeasurementModel(wrappers, scroller, container);
        const contentHeight = Math.round(container.scrollHeight);
        const contentWidth = Math.round(container.scrollWidth);
        marginContainer.style.height = `${contentHeight}px`;
        marginContainer.style.width = `${contentWidth}px`;
        marginContainer.style.overflow = 'visible';
        gridContainer.style.height = `${contentHeight}px`;
        gridContainer.style.width = `${contentWidth}px`;
        gridContainer.style.overflow = 'visible';

        for (const it of items) {
            if (it.type === 'gap') {
                // Margins go to the always-visible margin container
                const gap = document.createElement('div');
                gap.className = 'pdf-page-break-margin';
                gap.style.position = 'absolute';
                gap.style.top = `${it.top}px`;
                gap.style.left = '0';
                gap.style.width = '100%';
                gap.style.height = `${it.h}px`;
                marginContainer.appendChild(gap);
                continue;
            }

            // Page segment - create canvas for this page's grid (one per page for memory efficiency)
            const page = await this.pdfDoc.getPage(it.pageNum);
            const viewport = page.getViewport({ scale: this.scale });
            const [x0, y0, x1, y1] = page.view;
            const pageWidthPdf = x1 - x0;
            const pageHeightPdf = y1 - y0;

            if (it.width <= 0 || it.h <= 0) {
                continue;
            }

            const seg = document.createElement('canvas');
            seg.dataset.pageNum = String(it.pageNum);
            seg.style.position = 'absolute';
            seg.style.top = `${it.top}px`;
            seg.style.left = `${it.left}px`;
            seg.style.width = `${it.width}px`;
            seg.style.height = `${it.h}px`;
            seg.style.pointerEvents = 'none';
            seg.width = Math.max(1, Math.floor(it.width * dpr));
            seg.height = Math.max(1, Math.floor(it.h * dpr));
            gridContainer.appendChild(seg);

            const ctx = seg.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, it.width, it.h);

            // Draw grid lines - align with PDF coordinates
            const themeStyles = getComputedStyle(document.body);
            const pdfGridLineX = themeStyles.getPropertyValue('--pdf-grid-line-x').trim();
            const pdfGridLineY = themeStyles.getPropertyValue('--pdf-grid-line-y').trim();
            const pdfGridLineWidth = parseFloat(themeStyles.getPropertyValue('--pdf-grid-line-width').trim()) || 0.5;
            ctx.lineWidth = pdfGridLineWidth;

            // Horizontal grid lines - align with PDF y coordinates
            for (let yPdf = 0; yPdf <= pageHeightPdf + 1e-6; yPdf += pdfStep) {
                const [, yLocal] = viewport.convertToViewportPoint(0, yPdf);
                this._drawHorizontalLine(ctx, Math.floor(yLocal) + 0.5, it.width, pdfGridLineX, pdfGridLineWidth);
            }

            // Vertical grid lines - align with PDF x coordinates
            for (let xPdf = 0; xPdf <= pageWidthPdf + 1e-6; xPdf += pdfStep) {
                const [xLocal] = viewport.convertToViewportPoint(xPdf, 0);
                this._drawVerticalLine(ctx, Math.floor(xLocal) + 0.5, it.h, pdfGridLineY, pdfGridLineWidth);
            }

            // Axes (origin lines) - align with PDF origin (0,0)
            const pdfAxisWidth = parseFloat(themeStyles.getPropertyValue('--pdf-axis-width').trim()) || 2;
            const pdfOriginMarker = themeStyles.getPropertyValue('--pdf-origin-marker').trim();

            const [xOrigin, yOrigin] = viewport.convertToViewportPoint(0, 0);
            const x0px = Math.floor(xOrigin) + 0.5;
            const y0px = Math.floor(yOrigin) + 0.5;

            // X-axis with edge clipping (uses same color as horizontal grid lines)
            const yAxisPos = (y0px < 1) ? 1 : (y0px > it.h - 1) ? it.h - 1 : y0px;
            this._drawHorizontalLine(ctx, yAxisPos, it.width, pdfGridLineX, pdfAxisWidth);

            // Y-axis with edge clipping (uses same color as vertical grid lines)
            const xAxisPos = (x0px < 1) ? 1 : (x0px > it.width - 1) ? it.width - 1 : x0px;
            this._drawVerticalLine(ctx, xAxisPos, it.h, pdfGridLineY, pdfAxisWidth);

            // Origin marker - draw a small circle at the origin intersection
            const originMarkerSize = parseFloat(themeStyles.getPropertyValue('--pdf-origin-marker-size').trim()) || 8;
            const originMarkerRadius = originMarkerSize / 2;
            ctx.fillStyle = pdfOriginMarker;
            ctx.beginPath();
            ctx.arc(x0px, y0px, originMarkerRadius, 0, 2 * Math.PI);
            ctx.fill();

            // Also create a DOM element for the origin marker (for tests and visual reference)
            // Position it relative to the page wrapper
            const pageWrapper = wrappers.find(w => +w.dataset.pageNum === it.pageNum);
            if (pageWrapper) {
                let originMarker = pageWrapper.querySelector('.origin-marker');
                if (!originMarker) {
                    originMarker = document.createElement('div');
                    originMarker.className = 'origin-marker';
                    pageWrapper.appendChild(originMarker);
                }
                // Position the origin marker at PDF (0,0) in page coordinates
                originMarker.style.left = `${Math.round(xOrigin)}px`;
                originMarker.style.top = `${Math.round(yOrigin)}px`;
            }
        }
    }


    _buildPageMeasurementModel(wrappers, scroller, container) {
        const items = [];
        if (!wrappers || wrappers.length === 0) return items;

        const firstWrapper = wrappers[0];
        const firstOffset = this._getWrapperOffset(firstWrapper, scroller);
        const topGap = Math.max(0, Math.round(firstOffset.y));
        if (topGap > 0) {
            items.push({ type: 'gap', h: topGap, top: 0 });
        }

        for (let i = 0; i < wrappers.length; i++) {
            const w = wrappers[i];
            const pageNum = +w.dataset.pageNum;
            const { x, y } = this._getWrapperOffset(w, scroller);
            const canvas = w.querySelector('canvas');
            const rect = canvas ? canvas.getBoundingClientRect() : w.getBoundingClientRect();
            const height = Math.max(0, Math.round(rect.height || w.offsetHeight));
            const width = Math.max(0, Math.round(rect.width || w.offsetWidth));
            const top = Math.round(y);
            const left = Math.round(x);
            const bottom = top + height;

            items.push({ type: 'page', h: height, top, left, width, pageNum });

            const nextWrapper = wrappers[i + 1];
            if (nextWrapper) {
                const { y: nextY } = this._getWrapperOffset(nextWrapper, scroller);
                const gapHeight = Math.max(0, Math.round(nextY) - bottom);
                if (gapHeight > 0) {
                    items.push({ type: 'gap', h: gapHeight, top: bottom });
                }
            } else {
                const trailingHeight = Math.max(0, Math.round(container.scrollHeight) - bottom);
                if (trailingHeight > 0) {
                    items.push({ type: 'gap', h: trailingHeight, top: bottom });
                }
            }
        }

        return items;
    }

    _drawYGridLines(ctx, viewport, pageHeightPdf, panelWidth, gridColor) {
        const pdfStep = (window.J5 && window.J5.settings && window.J5.settings.pdfStep) ?? 15;
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        for (let yPdf = 0; yPdf <= pageHeightPdf + 1e-6; yPdf += pdfStep) {
            const [, yLocal] = viewport.convertToViewportPoint(0, yPdf);
            const y = Math.floor(yLocal) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(panelWidth, y);
            ctx.stroke();
        }
    }

    _drawOriginLine(ctx, viewport, panelWidth, originColor) {
        ctx.strokeStyle = originColor;
        ctx.lineWidth = 1.5;
        const [, yOrigin] = viewport.convertToViewportPoint(0, 0);
        const y0px = Math.floor(yOrigin) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y0px);
        ctx.lineTo(panelWidth, y0px);
        ctx.stroke();
    }

    async drawPdfYDensityGrid() {
        const yPanel = this._getElement('pdf-y-density');
        const scroller = this._getElement('pdf-scroller');
        const container = this._getElement('pdf-canvas-container');
        if (!yPanel || !scroller || !container || !this.pdfDoc) return;

        // Preserve density overlay canvas - it's an overlay that should persist
        // Y-density canvas is a direct child of yPanel (sibling to stack div), so it won't be removed
        const existingDensityCanvas = yPanel.querySelector('.density-overlay-canvas');
        
        // Clear only grid elements (stack div), not density overlays
        const gridStack = yPanel.querySelector('div');
        if (gridStack) {
            gridStack.remove();
        }
        yPanel.style.overflowY = 'hidden';
        yPanel.style.display = 'block';
        yPanel.style.background = 'var(--y-density-bg)';

        const themeStyles = getComputedStyle(document.body);
        const gridColor = themeStyles.getPropertyValue('--pdf-grid-line-x').trim();
        const originColor = themeStyles.getPropertyValue('--pdf-grid-line-x').trim();
        const dpr = window.devicePixelRatio || 1;
        const panelWidth = Math.max(36, yPanel.clientWidth || 36);

        const wrappers = Array.from(container.querySelectorAll('.pdf-page-wrapper'));
        if (wrappers.length === 0) return;

        const items = this._buildPageMeasurementModel(wrappers, scroller, container);

        // Paint the stack (for grid)
        const stack = document.createElement('div');
        stack.style.display = 'block';
        stack.style.width = '100%';
        stack.style.position = 'relative';
        yPanel.appendChild(stack);

        for (const it of items) {
            if (it.type === 'gap') {
                const gap = document.createElement('div');
                gap.className = 'pdf-page-break-margin';
                gap.style.height = `${it.h}px`;
                gap.style.width = '100%';
                gap.style.display = 'block';
                stack.appendChild(gap);
                continue;
            }

            // Page segment
            const seg = document.createElement('canvas');
            seg.style.display = 'block';
            seg.style.width = '100%';
            seg.style.height = `${it.h}px`;
            seg.style.position = 'relative';
            seg.width = Math.floor(panelWidth * dpr);
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

            this._drawYGridLines(ctx, viewport, pageHeightPdf, panelWidth, gridColor);
            this._drawOriginLine(ctx, viewport, panelWidth, originColor);
        }

        // Scroll sync
        this._syncScroll(scroller, yPanel, '_rulerScrollHandler', 'vertical');
        
        // Y-density canvas should still be in DOM (it's a sibling of stack, not inside it)
        // Only restore if somehow it got removed (safety check)
        if (existingDensityCanvas && !yPanel.contains(existingDensityCanvas)) {
            yPanel.appendChild(existingDensityCanvas);
        }
    }

    async drawPdfXDensityGrid() {
        const xPanel = this._getElement('pdf-x-density');
        const scroller = this._getElement('pdf-scroller');
        const container = this._getElement('pdf-canvas-container');
        if (!xPanel || !scroller || !container || !this.pdfDoc) return;

        // Preserve density overlay canvas - it's an overlay that should persist
        const existingDensityCanvas = xPanel.querySelector('.x-density-overlay-canvas');
        
        // Clear only grid elements, not density overlays
        // Note: X-density canvas is inside the row div, so we extract it first
        const gridRow = xPanel.querySelector('div');
        if (gridRow && existingDensityCanvas && gridRow.contains(existingDensityCanvas)) {
            // Extract canvas before removing row
            existingDensityCanvas.remove();
        }
        if (gridRow) {
            gridRow.remove();
        }
        // Disable native user scrolling; mirror from main scroller
        xPanel.style.overflowX = 'hidden';
        xPanel.style.background = 'var(--x-density-bg)';

        const themeStyles = getComputedStyle(document.body);
        const densityGridColor = themeStyles.getPropertyValue('--pdf-grid-line-y').trim();
        const densityOriginColor = themeStyles.getPropertyValue('--pdf-grid-line-y').trim();

        const dpr = window.devicePixelRatio || 1;
        const firstWrapper = container.querySelector('.pdf-page-wrapper');
        if (!firstWrapper) return;
        const off = this._getWrapperOffset(firstWrapper, scroller);
        const firstCanvas = firstWrapper.querySelector('canvas');
        const pageCssWidth = firstCanvas
            ? Math.round(firstCanvas.getBoundingClientRect().width)
            : Math.round(firstWrapper.offsetWidth);
        // Use scroller's visible width (viewport), not container.scrollWidth (which is vertical height for all stacked pages)
        // The x-density panel should match the horizontal viewport width, not the total vertical scroll height
        const totalWidth = Math.round(scroller.clientWidth);
        const leftGapW = Math.max(0, Math.round(off.x));
        const rightGapW = Math.max(0, totalWidth - leftGapW - pageCssWidth);

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.width = totalWidth + 'px';
        row.style.height = '100%';
        row.style.maxHeight = '100%';
        row.style.overflow = 'hidden';
        xPanel.appendChild(row);

        if (leftGapW > 0) {
            const leftGap = document.createElement('div');
            leftGap.className = 'pdf-page-break-margin';
            leftGap.style.width = leftGapW + 'px';
            leftGap.style.height = '100%';
            row.appendChild(leftGap);
        }

        const segHeight = Math.max(36, xPanel.clientHeight || 36);
        const seg = document.createElement('canvas');
        seg.style.display = 'block';
        seg.style.width = pageCssWidth + 'px';
        seg.style.height = segHeight + 'px';
        seg.style.position = 'relative';
        seg.width = Math.floor(pageCssWidth * dpr);
        seg.height = Math.floor(segHeight * dpr);
        row.appendChild(seg);

        const ctx = seg.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, pageCssWidth, segHeight);

        const page = await this.pdfDoc.getPage(1);
        const viewport = page.getViewport({ scale: this.scale });
        const [x0, , x1] = [page.view[0], page.view[1], page.view[2]];
        const pageWidthPdf = x1 - x0;
        const pdfStep = (window.J5 && window.J5.settings && window.J5.settings.pdfStep) ?? 15;

        ctx.strokeStyle = densityGridColor;
        ctx.lineWidth = 1;
        for (let xPdf = 0; xPdf <= pageWidthPdf + 1e-6; xPdf += pdfStep) {
            const [xLocal] = viewport.convertToViewportPoint(xPdf, 0);
            const x = Math.floor(xLocal) + 0.5;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, segHeight);
            ctx.stroke();
        }

        ctx.strokeStyle = densityOriginColor;
        ctx.lineWidth = 1.5;
        const [xOrigin] = viewport.convertToViewportPoint(0, 0);
        const x0px = Math.floor(xOrigin) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x0px, 0);
        ctx.lineTo(x0px, segHeight);
        ctx.stroke();

        if (rightGapW > 0) {
            const rightGap = document.createElement('div');
            rightGap.className = 'pdf-page-break-margin';
            rightGap.style.flex = '0 0 ' + rightGapW + 'px';
            rightGap.style.height = '100%';
            row.appendChild(rightGap);
        }

        this._syncScroll(scroller, xPanel, '_rulerXScrollHandler', 'horizontal');
        
        // Restore density canvas if it was preserved (X-density canvas goes inside the row div)
        if (existingDensityCanvas && row && !row.contains(existingDensityCanvas)) {
            row.appendChild(existingDensityCanvas);
        }
    }

    async drawAnnotationsGrid() {
        const yRight = this._getElement('pdf-annotations');
        const scroller = this._getElement('pdf-scroller');
        const container = this._getElement('pdf-canvas-container');
        if (!yRight || !scroller || !container || !this.pdfDoc) return;

        yRight.innerHTML = '';
        yRight.style.overflowY = 'hidden';
        yRight.style.background = 'var(--ann-list-bg)';
        yRight.style.display = 'block';

        const themeStyles = getComputedStyle(document.body);
        const gridColor = themeStyles.getPropertyValue('--pdf-grid-line-x').trim();
        const originColor = themeStyles.getPropertyValue('--pdf-grid-line-x').trim();
        const dpr = window.devicePixelRatio || 1;
        const panelWidth = Math.max(36, yRight.clientWidth || 36);

        const wrappers = Array.from(container.querySelectorAll('.pdf-page-wrapper'));
        if (wrappers.length === 0) return;

        const items = this._buildPageMeasurementModel(wrappers, scroller, container);

        const stack = document.createElement('div');
        stack.style.display = 'block';
        stack.style.width = '100%';
        stack.style.background = 'transparent';
        yRight.appendChild(stack);

        for (const it of items) {
            if (it.type === 'gap') {
                const gap = document.createElement('div');
                gap.className = 'pdf-page-break-margin';
                gap.style.height = `${it.h}px`;
                gap.style.width = '100%';
                gap.style.display = 'block';
                stack.appendChild(gap);
                continue;
            }

            const seg = document.createElement('canvas');
            seg.style.display = 'block';
            seg.style.width = '100%';
            seg.style.height = `${it.h}px`;
            seg.width = Math.floor(panelWidth * dpr);
            seg.height = Math.floor(it.h * dpr);
            stack.appendChild(seg);

            const ctx = seg.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, panelWidth, it.h);

            const page = await this.pdfDoc.getPage(it.pageNum);
            const viewport = page.getViewport({ scale: this.scale });
            const [, y0, , y1] = page.view;
            const pageHeightPdf = y1 - y0;

            this._drawYGridLines(ctx, viewport, pageHeightPdf, panelWidth, gridColor);
            this._drawOriginLine(ctx, viewport, panelWidth, originColor);
        }

        this._syncScroll(scroller, yRight, '_rulerRightScrollHandler', 'vertical');
    }

    addLogEntry(logContentEl, message, level = 'info') {
        if (!logContentEl) return;
        const container = logContentEl.parentElement;
        if (!container) return;

        const tolerance = 4;
        const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - tolerance;

        const entry = document.createElement('div');
        entry.className = `pdf-log-entry ${level}`;
        const timestamp = new Date().toLocaleTimeString();
        entry.textContent = `[${timestamp}] ${message}`;
        logContentEl.appendChild(entry);

        if (atBottom) {
            requestAnimationFrame(() => {
                container.scrollTop = container.scrollHeight;
            });
        }
    }

    addPdfLogEntry(message, level = 'info') {
        const el = document.getElementById('pdf-log-content');
        if (!el) return;

        // Clear placeholder text on first real log entry
        if (!this.pdfLogInitialized) {
            el.innerHTML = '';
            this.pdfLogInitialized = true;
            // Create status line element
            this.statusLineElement = document.createElement('div');
            this.statusLineElement.id = 'pdf-log-status-line';
            this.statusLineElement.className = 'pdf-log-entry pdf-log-status';
            this.statusLineElement.style.display = 'none';
            el.appendChild(this.statusLineElement);
        }

        this.addLogEntry(el, message, level);
    }

    // Update status line (single updating line at bottom of log)
    updateStatusLine(statusData) {
        if (!this.statusLineElement) return;

        if (statusData && statusData.status === 'in_progress') {
            const { cache_key, queue_position, progress, estimated_time } = statusData;
            const progressPct = Math.round((progress || 0) * 100);
            const queueText = queue_position > 0 ? `queue position #${queue_position}, ` : '';
            const timeText = estimated_time ? `~${estimated_time} remaining` : '';
            this.statusLineElement.textContent = `[Status] checksum=${cache_key}: ${queueText}${progressPct}% complete${timeText ? ', ' + timeText : ''}`;
            this.statusLineElement.style.display = 'block';
        } else {
            this.statusLineElement.style.display = 'none';
        }
    }

    addRecLogEntry(message, level = 'info') {
        const el = document.getElementById('rec-log-content');
        if (!el) return;

        // Clear placeholder text on first real log entry
        if (!this.recLogInitialized) {
            el.innerHTML = '';
            this.recLogInitialized = true;
        }

        this.addLogEntry(el, message, level);
    }

    copyLogToClipboard() {
        const logContent = document.getElementById('pdf-log-content');
        if (!logContent) {
            console.warn('Log content not found');
            return;
        }

        // Get all log entries
        const logEntries = logContent.querySelectorAll('.pdf-log-entry');
        const logText = Array.from(logEntries)
            .map(entry => entry.textContent)
            .join('\n');

        // Copy to clipboard - use fallback for non-HTTPS contexts
        const copyTextFallback = (text) => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return true;
            } catch {
                document.body.removeChild(textarea);
                return false;
            }
        };

        const flashButton = () => {
            const btn = document.getElementById('pdf-log-copy-btn');
            if (btn) {
                btn.style.opacity = '1';
                const themeStyles = getComputedStyle(document.body);
                btn.style.background = themeStyles.getPropertyValue('--accent-strong-bg').trim() || 'var(--accent-soft)';
                setTimeout(() => {
                    btn.style.opacity = '';
                    btn.style.background = '';
                }, 500);
            }
        };

        // Try modern clipboard API first, fallback to execCommand
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(logText).then(() => {
                flashButton();
                console.log('Log copied to clipboard');
            }).catch(err => {
                console.warn('Clipboard API failed, trying fallback:', err);
                if (copyTextFallback(logText)) {
                    flashButton();
                    console.log('Log copied to clipboard');
                } else {
                    console.error('Failed to copy log');
                    this.addPdfLogEntry('Failed to copy log to clipboard', 'error');
                }
            });
        } else {
            if (copyTextFallback(logText)) {
                flashButton();
                console.log('Log copied to clipboard');
            } else {
                console.error('Failed to copy log');
                this.addPdfLogEntry('Failed to copy log to clipboard', 'error');
            }
        }
    }

    // File input controls will be implemented later in the options panel

    toggleImagePanel(type) {
        const panel = document.getElementById(`indicator-${type}`);
        if (!panel) {
            return;
        }
        const isActive = panel.classList.contains('active');

        // Toggle active state
        if (isActive) {
            panel.classList.remove('active');
            // Panel deactivated
        } else {
            panel.classList.add('active');
            // Panel activated
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
            switch (e.key) {
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
                case 'd':
                case 'D':
                    e.preventDefault();
                    this.toggleTheme();
                    break;
            }
        });
    }

    async loadNewPDF(skipAutoRefresh = false) {
        try {

            // Clear all previous state
            this.clearPreviousDocument();

            // Use the exact same code path as initial load
            await this.loadPDFFromServer(skipAutoRefresh);

        } catch (error) {
            this.addPdfLogEntry(`Error loading PDF: ${error.message}`, 'error');
            console.error('Error loading PDF:', error);
        }
    }

    clearPreviousDocument() {
        // Reset all data structures first
        this.allStructureData = {};
        this.allDensityData = {};
        this.allLabels = [];
        this.loadedPages.clear();
        this.disassemblyComplete = false; // Reset flag for new document
        this.renderedCanvases.clear();
        this.activeLabels = new Set();
        this.highlightedLabels = new Set();
        this.hoveredToggleLabel = null;
        this.isRendering = false; // Reset render flag in case of previous failure
        
        // Remove ALL page wrappers (they contain everything)
        document.querySelectorAll('.pdf-page-wrapper').forEach(wrapper => wrapper.remove());
        
        // Clear all tracked containers by ID
        this.clearableContainers.byId.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
        // Also remove the main grid overlay if present
        const mainGrid = document.getElementById('pdf-grid');
        if (mainGrid) mainGrid.remove();
        
        // Clear all tracked containers by class
        this.clearableContainers.byClass.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) el.innerHTML = '';
        });
        
        // Remove any remaining overlay containers
        document.querySelectorAll('.pdf-page-overlay-container').forEach(el => el.remove());
        
        // Remove all overlays, lines, and density canvases anywhere in DOM
        document.querySelectorAll('.pdf-bbox-overlay, #connection-lines-overlay .connection-line, .density-overlay-canvas, .x-density-overlay-canvas').forEach(el => el.remove());
        
        // Clear connection lines container
        this.clearConnectionLines();
        
        // Clear density charts - force remove all canvases
        const yDensity = document.getElementById('pdf-y-density');
        const xDensity = document.getElementById('pdf-x-density');
        if (yDensity) {
            yDensity.querySelectorAll('*').forEach(el => el.remove());
        }
        if (xDensity) {
            xDensity.querySelectorAll('*').forEach(el => el.remove());
        }
        
        // Destroy previous PDF
        if (this.pdfDoc) {
            this.pdfDoc.destroy().catch(() => {});
            this.pdfDoc = null;
        }
    }

    async uploadPDF(file) {
        try {
            this.setIndicatorLoading('Uploading...');

            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/disassemble', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error (${response.status}): ${errorText}`);
            }

            const result = await response.json();

            if (result.success) {
                this.addPdfLogEntry('Upload complete');
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (error) {
            this.addPdfLogEntry(`Upload failed: ${error.message}`, 'error');
            console.error('Upload error details:', error);
            throw error;
        }
    }


    updateCurrentPage() {
        const scroller = this._getElement('pdf-scroller');
        const pageWrappers = document.querySelectorAll('.pdf-page-wrapper');

        if (!scroller || pageWrappers.length === 0) return;

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
            this.updatePageNavigation();
            // Update density charts when page changes
            this._restoreDensityCharts().catch(error => {
                console.log(`Density chart update error: ${error.message}`);
            });
            // Lazy load visible pages in background
            this.loadVisiblePages().catch(error => {
                console.log(`Lazy load error: ${error.message}`);
            });
        }
    }

    updatePageNavigation() {
        const pageInput = document.getElementById('page-input');
        const pageTotal = document.getElementById('page-total');
        const prevBtn = document.getElementById('page-prev');
        const nextBtn = document.getElementById('page-next');

        if (!pageInput || !pageTotal || !prevBtn || !nextBtn) return;

        // Show current page in input (for navigation)
        pageInput.value = this.currentPage;
        pageInput.max = this.totalPages;
        
        // Show total pages from PDF (as soon as we know it)
        pageTotal.textContent = this.totalPages || 0;

        // Enable/disable buttons at boundaries
        prevBtn.disabled = (this.currentPage <= 1);
        nextBtn.disabled = (this.currentPage >= this.totalPages);
    }

    goToPage(pageNum) {
        if (!this.pdfDoc || pageNum < 1 || pageNum > this.totalPages) return;

        const wrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);
        if (wrapper) {
            wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.goToPage(this.currentPage + 1);
        }
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.goToPage(this.currentPage - 1);
        }
    }

    toggleOptions() {
        const optionsPanel = this._getElement('pdf-options');
        const toggleButton = this._getElement('pdf-options-toggle');
        if (!optionsPanel || !toggleButton) return;

        // Preserve scroller relative position so expanding doesn't feel like it jumps
        const scroller = this._getElement('pdf-scroller');
        const prevScrollMax = scroller ? Math.max(1, scroller.scrollHeight - scroller.clientHeight) : 1;
        const prevScrollRatio = scroller ? (scroller.scrollTop / prevScrollMax) : 0;

        if (optionsPanel.classList.contains('options-collapsed')) {
            // Expand: rely on CSS (max-content); no explicit heights
            optionsPanel.classList.remove('options-collapsed');
            toggleButton.textContent = '▼';
            optionsPanel.style.height = '';
            // Allow grid row 2 (viewer) to shrink by clearing any fixed rail height before reflow
            try {
                const yPanelPre = document.getElementById('pdf-y-density');
                if (yPanelPre) yPanelPre.style.height = '';
            } catch { }
        } else {
            // Collapse: show only first group via CSS; no explicit heights
            optionsPanel.classList.add('options-collapsed');
            toggleButton.textContent = '▲';
            optionsPanel.style.height = '';
        }

        // After layout change, recompute heights and redraw rulers/grid to keep y-density in sync
        (async () => {
            try {
                // Wait for layout to update after class change
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                
                const scroller = document.getElementById('pdf-scroller');
                const yPanel = document.getElementById('pdf-y-density');
                //this doesn't exist anymore:
                //const yRightPanel = document.getElementById('pdf-annotations');
                if (scroller) {
                    // Restore scroller relative position after layout change
                    const newScrollMax = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
                    scroller.scrollTop = Math.round(prevScrollRatio * newScrollMax);
                    if (yPanel) yPanel.style.height = scroller.clientHeight + 'px';
                    //if (yRightPanel) yRightPanel.style.height = scroller.clientHeight + 'px';
                }

                await this.drawPdfGrid();
                await this.drawPdfYDensityGrid();
                await this.drawPdfXDensityGrid();
                await this.drawAnnotationsGrid();
                // Grid drawing preserves density canvases, but we may need to update them after layout changes
                await this._restoreDensityCharts();
            } catch (error) {
                console.error('Error redrawing after options toggle:', error);
            }
        })();
    }

    async extractUniqueLabels() {
        // Ensure all structure data is loaded before extracting labels
        // This ensures we get labels from the entire document, not just visible pages
        const missingPages = [];
        for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
            if (!this.allStructureData[pageNum]) {
                missingPages.push(pageNum);
            }
        }

        // Load structure data for any missing pages
        if (missingPages.length > 0) {
            const loadPromises = missingPages.map(pageNum => this.loadPageData(pageNum));
            await Promise.all(loadPromises);
        }

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

        // Count elements by type across all pages
        this.labelCounts = {};
        for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
            if (this.allStructureData[pageNum] && this.allStructureData[pageNum].page) {
                const page = this.allStructureData[pageNum].page;
                if (page.elements) {
                    page.elements.forEach(element => {
                        const type = element.type || 'unknown';
                        this.labelCounts[type] = (this.labelCounts[type] || 0) + 1;
                    });
                }
            }
        }

        // Default: all labels active
        this.activeLabels = new Set(this.allLabels);
    }


    renderLabelToggles() {
        const container = document.querySelector('.ann-toggles-container');
        container.innerHTML = '';

        // Create none/all toggle at the top (checkbox only, no label)
        const noneAllItem = document.createElement('div');
        noneAllItem.className = 'ann-toggle-row ann-none-all-toggle';

        const noneAllCheckbox = document.createElement('input');
        noneAllCheckbox.type = 'checkbox';
        noneAllCheckbox.id = 'ann-none-all';
        noneAllCheckbox.className = 'ann-toggle-row-checkbox';
        // Start checked - all labels are active by default (set in extractUniqueLabels)
        // Explicitly check it if we have labels (they're all active by default)
        noneAllCheckbox.checked = this.allLabels.length > 0;
        
        noneAllCheckbox.addEventListener('change', () => {
                // Update all label checkboxes
            this.allLabels.forEach(label => {
                const labelCheckbox = document.getElementById(`ann-label-${label}`);
                if (labelCheckbox) {
                    labelCheckbox.checked = noneAllCheckbox.checked;
                    if (noneAllCheckbox.checked) {
                        this.activeLabels.add(label);
                    } else {
                        this.activeLabels.delete(label);
                    }
                }
            });
            this.filterAnnotationsByLabels();
        });

        noneAllItem.addEventListener('click', (e) => {
            if (e.target !== noneAllCheckbox) {
                noneAllCheckbox.checked = !noneAllCheckbox.checked;
                noneAllCheckbox.dispatchEvent(new window.Event('change'));
            }
        });

        noneAllItem.appendChild(noneAllCheckbox);
        container.appendChild(noneAllItem);

            // Create individual label toggles
        this.allLabels.forEach(label => {
            const item = document.createElement('div');
            item.className = 'ann-toggle-row';

            // No background on item - code box will have colored background via CSS

            // Create checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `ann-label-${label}`;
            checkbox.className = 'ann-toggle-row-checkbox';
            checkbox.checked = this.activeLabels.has(label);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.activeLabels.add(label);
                } else {
                    this.activeLabels.delete(label);
                }
                // Update none/all checkbox state
                noneAllCheckbox.checked = this.activeLabels.size === this.allLabels.size;
                this.filterAnnotationsByLabels();
            });

            // Prevent checkbox click when clicking other parts of the item
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            // Create code and name as separate elements (grid will place them)
            const code = document.createElement('span');
            code.className = 'ann-code';
            code.textContent = this.getShortCodeForType(label);
            // cursor is set in CSS
            
            // Set color as CSS variable - CSS handles making it fully opaque
            const rgbaColorToggle = this.getColorForType(label);
            const rgbToggleMatch = rgbaColorToggle.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (rgbToggleMatch) {
                code.style.setProperty('--code-color', `rgb(${rgbToggleMatch[1]}, ${rgbToggleMatch[2]}, ${rgbToggleMatch[3]})`);
            }
            // Set text color based on annotation type
            const textColor = this.getTextColorForType(label);
            code.style.setProperty('--code-text', textColor);
            
            const name = document.createElement('span');
            name.className = 'ann-toggle-row-name';
            const count = this.labelCounts[label] || 0;
            name.textContent = count > 0 ? `${label} (${count})` : label;
            name.style.cursor = 'pointer';

            // Track selection state for this toggle row
            let isToggleSelected = false;
            
            // Hover on code or name - apply hover to all annotations of this type and toggle row
            const handleMouseEnter = () => {
                code.classList.add('hover-sync');
                name.classList.add('hover-sync');
                item.classList.add('hover-sync');
                this.syncHoverForAllAnnotationsOfType(label, true);
            };
            
            const handleMouseLeave = () => {
                code.classList.remove('hover-sync');
                name.classList.remove('hover-sync');
                item.classList.remove('hover-sync');
                this.syncHoverForAllAnnotationsOfType(label, false);
            };
            
            code.addEventListener('mouseenter', handleMouseEnter);
            code.addEventListener('mouseleave', handleMouseLeave);
            name.addEventListener('mouseenter', handleMouseEnter);
            name.addEventListener('mouseleave', handleMouseLeave);
            
            // Click on code or name - toggle selection for all annotations of this type and toggle row
            const handleClick = (e) => {
                e.stopPropagation(); // Don't trigger checkbox click
                // Toggle selection state
                isToggleSelected = !isToggleSelected;
                if (isToggleSelected) {
                    code.classList.add('selected');
                    name.classList.add('selected');
                    item.classList.add('selected');
                    this.syncSelectionForAllAnnotationsOfType(label, true);
                } else {
                    code.classList.remove('selected');
                    name.classList.remove('selected');
                    item.classList.remove('selected');
                    this.syncSelectionForAllAnnotationsOfType(label, false);
                }
            };
            
            code.addEventListener('click', handleClick);
            name.addEventListener('click', handleClick);

            // Append elements to item
            item.appendChild(checkbox);
            item.appendChild(code);
            item.appendChild(name);
            container.appendChild(item);
        });
    }

    syncHoverForAllAnnotationsOfType(elementType, isHovering) {
        // Find all annotations of this type
        const allAnnotations = document.querySelectorAll(`.pdf-bbox-overlay[data-element-type="${elementType}"], .ann-list-item[data-element-type="${elementType}"], #connection-lines-overlay .connection-line[data-element-type="${elementType}"]`);
        
        allAnnotations.forEach(el => {
            if (isHovering) {
                el.classList.add('hover-sync');
            } else {
                el.classList.remove('hover-sync');
            }
            
            // Sync styles for connected elements
            if (el.classList.contains('pdf-bbox-overlay')) {
                const pageNum = parseInt(el.dataset.page);
                const index = parseInt(el.dataset.index);
                const listItem = el._listItem;
                if (listItem) {
                    this.syncConnectedStyles(el, listItem, pageNum, index);
                }
            } else if (el.classList.contains('ann-list-item')) {
                const pageNum = parseInt(el.dataset.page);
                const index = parseInt(el.dataset.index);
                const overlay = el._overlay;
                if (overlay) {
                    this.syncConnectedStyles(overlay, el, pageNum, index);
                }
            }
        });
    }

    syncSelectionForAllAnnotationsOfType(elementType, isSelected) {
        // Find all annotations of this type
        const allAnnotations = document.querySelectorAll(`.pdf-bbox-overlay[data-element-type="${elementType}"], .ann-list-item[data-element-type="${elementType}"], #connection-lines-overlay .connection-line[data-element-type="${elementType}"]`);
        
        allAnnotations.forEach(el => {
            if (isSelected) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
            
            // Sync styles for connected elements
            if (el.classList.contains('pdf-bbox-overlay')) {
                const pageNum = parseInt(el.dataset.page);
                const index = parseInt(el.dataset.index);
                const listItem = el._listItem;
                if (listItem) {
                    this.syncConnectedStyles(el, listItem, pageNum, index);
                }
            } else if (el.classList.contains('ann-list-item')) {
                const pageNum = parseInt(el.dataset.page);
                const index = parseInt(el.dataset.index);
                const overlay = el._overlay;
                if (overlay) {
                    this.syncConnectedStyles(overlay, el, pageNum, index);
                }
            }
        });
    }

    updateLabelHighlights() {
        // Update highlight state on all annotation labels in ann-list
        const allLabels = document.querySelectorAll('.ann-list-item');
        allLabels.forEach(item => {
            const elementType = item.dataset.elementType;
            const shouldHighlight = this.highlightedLabels.has(elementType) || 
                                   (this.hoveredToggleLabel === elementType);
            
            if (shouldHighlight) {
                item.classList.add('highlighted');
            } else {
                item.classList.remove('highlighted');
            }
        });
    }

    selectAllLabels() {
        document.querySelectorAll('.ann-toggles-container input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = true;
        });
        this.activeLabels = new Set(this.allLabels);
        this.filterAnnotationsByLabels();
    }

    deselectAllLabels() {
        document.querySelectorAll('.ann-toggles-container input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });
        this.activeLabels.clear();
        this.filterAnnotationsByLabels();
    }

    filterAnnotationsByLabels() {
        // Hide/show overlays, annotations, and lines based on active labels
        document.querySelectorAll('.pdf-bbox-overlay').forEach(overlay => {
            const elementType = overlay.dataset.elementType;
            if (!elementType || this.activeLabels.has(elementType)) {
                overlay.style.display = '';
            } else {
                overlay.style.display = 'none';
            }
        });

        document.querySelectorAll('.ann-list-item').forEach(item => {
            const elementType = item.dataset.elementType;
            if (!elementType || this.activeLabels.has(elementType)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });

        document.querySelectorAll('#connection-lines-overlay .connection-line').forEach(line => {
            const elementType = line.dataset.elementType;
            if (!elementType || this.activeLabels.has(elementType)) {
                line.style.display = '';
            } else {
                line.style.display = 'none';
            }
        });
    }

    updateAllBoundingBoxes() {
        // Update all existing bounding box overlays with new padding value
        document.querySelectorAll('.pdf-bbox-overlay').forEach(overlay => {
            const pageNum = parseInt(overlay.dataset.page, 10);
            const index = parseInt(overlay.dataset.index, 10);
            
            if (!pageNum || !this.allStructureData[pageNum]) return;
            
            const structureData = this.allStructureData[pageNum];
            const page = structureData.page;
            if (!page || !page.elements || !page.elements[index]) return;
            
            const element = page.elements[index];
            if (!element.bbox || element.bbox.length !== 4) return;
            
            // Find the page wrapper to get canvas and calculate scale
            const pageWrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);
            if (!pageWrapper) return;
            
            const canvas = pageWrapper.querySelector('canvas');
            if (!canvas) return;
            
            const canvasRect = canvas.getBoundingClientRect();
            const scaleX = canvasRect.width / page.width;
            const scaleY = canvasRect.height / page.height;
            
            const [x0, y0, x1, y1] = element.bbox;
            
            // Update overlay position and size with new padding
            overlay.style.left = `${x0 * scaleX - this.bboxPadding}px`;
            overlay.style.top = `${y0 * scaleY - this.bboxPadding}px`;
            overlay.style.width = `${(x1 - x0) * scaleX + (this.bboxPadding * 2)}px`;
            overlay.style.height = `${(y1 - y0) * scaleY + (this.bboxPadding * 2)}px`;
        });
        
        // Update connection lines since bounding box positions changed
        this.updateAllConnectionLines();
    }

    updateAllConnectionLines() {
        // Update all connection lines to match new bounding box positions
        document.querySelectorAll('#connection-lines-overlay .connection-line').forEach(connectionLine => {
            const pageNum = connectionLine.dataset.page;
            const index = connectionLine.dataset.index;
            
            if (!pageNum || !index) return;
            
            // Find matching overlay and list item
            const overlay = document.querySelector(`.pdf-bbox-overlay[data-page="${pageNum}"][data-index="${index}"]`);
            const listItem = document.querySelector(`.ann-list-item[data-page="${pageNum}"][data-index="${index}"]`);
            
            if (overlay && listItem) {
                this.updateConnectionLinePositionForPage(connectionLine, overlay, listItem);
            }
        });
    }

    async renderAllAnnotations() {
        // Render bounding boxes and annotations for all pages
        this.clearConnectionLines();

        // Clear annotation list
        const annotationList = document.getElementById('annotation-list');
        const annListContainer = document.getElementById('ann-list');
        if (annotationList && annListContainer) {
            annotationList.innerHTML = '';
            
            // Set annotation list height to match PDF content height
            const pdfScroller = document.getElementById('pdf-scroller');
            const pdfContainer = document.getElementById('pdf-canvas-container');
            if (pdfScroller && pdfContainer) {
                // Match the scroll height of the PDF container
                annotationList.style.height = `${pdfContainer.scrollHeight}px`;
                annotationList.style.position = 'relative';
            }
        }

        // Build annotation items with positions first
        const annotationItems = [];
        for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
            if (this.allStructureData[pageNum] && this.allStructureData[pageNum].page) {
                const items = this.renderAnnotationsForPage(pageNum);
                if (items) {
                    annotationItems.push(...items);
                }
            }
        }
        
        // Sort by Y position and append to list
        if (annotationList) {
            annotationItems.sort((a, b) => a.y - b.y);
            annotationItems.forEach(item => {
                annotationList.appendChild(item.element);
                // Create connection line after item is in DOM
                if (item.element._overlay) {
                    this.createConnectionLineForPage(
                        item.element._overlay, 
                        item.element, 
                        parseInt(item.element.dataset.page),
                        parseInt(item.element.dataset.index),
                        item.element.dataset.elementType
                    );
                    // Sync styles after connection line is created
                    this.syncConnectedStyles(item.element._overlay, item.element, parseInt(item.element.dataset.page), parseInt(item.element.dataset.index));
                }
            });
        }
        
        // Draw grid background and sync scroll
        await this.drawAnnotationListGrid();
        this.syncAnnotationListScroll();
    }

    async drawAnnotationListGrid() {
        const annList = document.getElementById('ann-list');
        const pdfScroller = document.getElementById('pdf-scroller');
        const pdfContainer = document.getElementById('pdf-canvas-container');
        if (!annList || !pdfScroller || !pdfContainer || !this.pdfDoc) return;

        // Remove existing grid stack if any
        let gridStack = document.getElementById('ann-list-grid-stack');
        if (gridStack) {
            gridStack.remove();
        }

        const dpr = window.devicePixelRatio || 1;
        const pdfStep = (window.J5 && window.J5.settings && window.J5.settings.pdfStep) ?? 15;
        const panelWidth = annList.clientWidth || 200;
        const wrappers = Array.from(pdfContainer.querySelectorAll('.pdf-page-wrapper'));
        if (wrappers.length === 0) return;

        // Build same model as pdf-y-density with gaps
        const items = [];
        const getY = (w) => this._getWrapperOffset(w, pdfScroller).y;

        // Top gap
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

            // Gap to next page
            const nextTop = (i + 1 < wrappers.length) ? Math.round(getY(wrappers[i + 1])) : null;
            const gapH = nextTop !== null
                ? Math.max(0, nextTop - bottom)
                : Math.max(0, Math.round(pdfContainer.scrollHeight) - bottom);
            if (gapH > 0) items.push({ type: 'gap', h: gapH });
        }

        // Create grid stack (similar to pdf-y-density)
        gridStack = document.createElement('div');
        gridStack.id = 'ann-list-grid-stack';
        gridStack.style.position = 'absolute';
        gridStack.style.top = '0';
        gridStack.style.left = '0';
        gridStack.style.width = '100%';
        gridStack.style.display = 'block';
        gridStack.style.pointerEvents = 'none';
        // No z-index - document order determines stacking (grid behind items)
        // Insert grid as first child so it stays behind items
        const annotationList = document.getElementById('annotation-list');
        if (annotationList && annotationList.parentNode === annList) {
            annList.insertBefore(gridStack, annotationList);
        } else {
            annList.appendChild(gridStack);
        }

        // Draw grid matching pdf-y-density exactly, with gap divs for CSS styling
        for (const it of items) {
            if (it.type === 'gap') {
                // Create gap div (styled via CSS)
                const gap = document.createElement('div');
                gap.className = 'pdf-page-break-margin';
                gap.style.height = `${it.h}px`;
                gap.style.width = '100%';
                gap.style.display = 'block';
                gridStack.appendChild(gap);
                continue;
            }

            // Page segment - create canvas for grid lines
            const seg = document.createElement('canvas');
            seg.style.display = 'block';
            seg.style.width = '100%';
            seg.style.height = `${it.h}px`;
            seg.style.position = 'relative';
            seg.width = Math.floor(panelWidth * dpr);
            seg.height = Math.floor(it.h * dpr);
            gridStack.appendChild(seg);

            const ctx = seg.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, panelWidth, it.h);

            // Draw grid using same logic as pdf-y-density
            const page = await this.pdfDoc.getPage(it.pageNum);
            const viewport = page.getViewport({ scale: this.scale });
            const [, y0, , y1] = page.view;
            const pageHeightPdf = y1 - y0;

            // Grid lines every pdfStep PDF units (horizontal lines use x-axis color)
            const themeStyles = getComputedStyle(document.body);
            const gridColor = themeStyles.getPropertyValue('--pdf-grid-line-x').trim();
            const pdfGridLineWidth = parseFloat(themeStyles.getPropertyValue('--pdf-grid-line-width').trim()) || 0.5;
            ctx.strokeStyle = gridColor;
            ctx.lineWidth = pdfGridLineWidth;
            for (let yPdf = 0; yPdf <= pageHeightPdf + 1e-6; yPdf += pdfStep) {
                const [, yLocal] = viewport.convertToViewportPoint(0, yPdf);
                const y = Math.floor(yLocal) + 0.5;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(panelWidth, y);
                ctx.stroke();
            }

            // Origin line (horizontal, uses x-axis color with axis width)
            const pdfAxisWidth = parseFloat(themeStyles.getPropertyValue('--pdf-axis-width').trim()) || 2;
            ctx.strokeStyle = gridColor;
            ctx.lineWidth = pdfAxisWidth;
            const [, yOrigin] = viewport.convertToViewportPoint(0, 0);
            const y0px = Math.floor(yOrigin) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y0px);
            ctx.lineTo(panelWidth, y0px);
            ctx.stroke();
        }
    }

    syncAnnotationListScroll() {
        const pdfScroller = document.getElementById('pdf-scroller');
        const annList = document.getElementById('ann-list');
        if (!pdfScroller || !annList) return;

        // Remove existing handler if any (for re-sync)
        if (this._annListScrollHandler) {
            pdfScroller.removeEventListener('scroll', this._annListScrollHandler);
        }

        // Create handler with passive option for better performance
        this._annListScrollHandler = () => {
            annList.scrollTop = pdfScroller.scrollTop;
        };

        pdfScroller.addEventListener('scroll', this._annListScrollHandler, { passive: true });
        annList.scrollTop = pdfScroller.scrollTop;
    }

    renderAnnotationsForPage(pageNum) {
        const structureData = this.allStructureData[pageNum];
        if (!structureData || !structureData.page) return null;

        const page = structureData.page;
        const pageWrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);

        if (!pageWrapper) return null;

        // Create overlay container for this page if it doesn't exist
        let overlayContainer = pageWrapper.querySelector('.pdf-page-overlay-container');
        if (!overlayContainer) {
            overlayContainer = document.createElement('div');
            overlayContainer.className = 'pdf-page-overlay-container';
            overlayContainer.style.position = 'absolute';
            overlayContainer.style.top = '0';
            overlayContainer.style.left = '0';
            overlayContainer.style.width = '100%';
            overlayContainer.style.height = '100%';
            overlayContainer.style.pointerEvents = 'none';
            pageWrapper.style.position = 'relative';
            pageWrapper.appendChild(overlayContainer);
        }

        // Clear overlay container
        overlayContainer.innerHTML = '';

        const canvas = pageWrapper.querySelector('canvas');
        if (!canvas) return null;

        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvasRect.width / page.width;
        const scaleY = canvasRect.height / page.height;

        // Calculate the Y position of this page in the PDF container
        const pdfScroller = document.getElementById('pdf-scroller');
        const pdfContainer = document.getElementById('pdf-canvas-container');
        const pageOffsetY = pdfScroller && pdfContainer ? this._getWrapperOffset(pageWrapper, pdfScroller).y : 0;

        const annotationItems = [];

        page.elements.forEach((element, index) => {
            if (!element.bbox || element.bbox.length !== 4) return;

            const [x0, y0, x1, y1] = element.bbox;
            const elementType = element.type || 'unknown';

            // Create overlay element
            const overlay = document.createElement('div');
            overlay.className = 'pdf-bbox-overlay';
            overlay.style.position = 'absolute';
            overlay.style.left = `${x0 * scaleX - this.bboxPadding}px`; // Expand padding left
            overlay.style.top = `${y0 * scaleY - this.bboxPadding}px`; // Expand padding top
            overlay.style.width = `${(x1 - x0) * scaleX + (this.bboxPadding * 2)}px`; // Expand padding on each side
            overlay.style.height = `${(y1 - y0) * scaleY + (this.bboxPadding * 2)}px`; // Expand padding on each side
            overlay.dataset.page = pageNum;
            overlay.dataset.index = index;
            overlay.dataset.elementType = elementType;

            // Apply color based on type
            const color = this.getColorForType(element.type);
            // Darker border - use full opacity or darker
            const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (rgbMatch) {
                // Make border darker - use full opacity
                overlay.style.borderColor = `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, 1)`;
            } else {
                overlay.style.borderColor = color.replace('0.6', '1').replace('0.5', '1').replace('0.3', '1');
            }
            // Very very light background - reduce opacity to 0.1
            overlay.style.backgroundColor = color.replace(/0\.\d+/, '0.1');

            overlay.addEventListener('click', () => this.selectAnnotation(index, pageNum));
            
            // Sync hover/selection styles to connected elements
            overlay.addEventListener('mouseenter', () => {
                const listItem = overlay._listItem;
                this.syncConnectedStyles(overlay, listItem, pageNum, index);
            });
            overlay.addEventListener('mouseleave', () => {
                const listItem = overlay._listItem;
                this.syncConnectedStyles(overlay, listItem, pageNum, index);
            });

            overlayContainer.appendChild(overlay);

            // Create annotation list item - positioned at Y coordinate matching PDF
            const listItem = document.createElement('div');
            listItem.className = 'ann-list-item';
            listItem.dataset.page = pageNum;
            listItem.dataset.index = index;
            listItem.dataset.elementType = elementType;

            // Calculate Y position in annotation list - align label center with bounding box midpoint
            const bboxMidpointY = (y0 + y1) / 2;
            const midpointY = pageOffsetY + (bboxMidpointY * scaleY);

            // Position absolutely within the annotation list
            // Only top needs to be dynamic (calculated from PDF position)
            // All other styles (position, left, width, transform) are in CSS
            listItem.style.top = `${midpointY}px`;

            // Code box directly in list item - CSS handles opacity
            const code = document.createElement('span');
            code.className = 'ann-code';
            code.textContent = this.getShortCodeForType(elementType);
            
            // Set color as CSS variable - CSS will make it fully opaque
            const rgbaColorList = this.getColorForType(elementType);
            const rgbListMatch = rgbaColorList.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (rgbListMatch) {
                code.style.setProperty('--code-color', `rgb(${rgbListMatch[1]}, ${rgbListMatch[2]}, ${rgbListMatch[3]})`);
            }
            // Set text color based on annotation type
            const textColor = this.getTextColorForType(elementType);
            code.style.setProperty('--code-text', textColor);
            
            listItem.appendChild(code);

            // Click on label toggles highlight for this single label
            listItem.addEventListener('click', () => {
                // Toggle highlight for this specific label
                if (listItem.classList.contains('highlighted')) {
                    listItem.classList.remove('highlighted');
                } else {
                    listItem.classList.add('highlighted');
                }
                // Also trigger selection
                this.selectAnnotation(index, pageNum);
                // Scroll to the page if needed
                const wrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);
                if (wrapper) {
                    wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
            
            // Sync hover/selection styles to connected elements (from ann-list-item)
            // When hovering listItem, temporarily add hover class to overlay so CSS :hover applies
            listItem.addEventListener('mouseenter', () => {
                const overlay = listItem._overlay;
                if (overlay) {
                    overlay.classList.add('hover-sync'); // Temporary class to trigger hover styles
                    // Read styles immediately after class is added
                    this.syncConnectedStyles(overlay, listItem, pageNum, index);
                }
            });
            listItem.addEventListener('mouseleave', () => {
                const overlay = listItem._overlay;
                if (overlay) {
                    overlay.classList.remove('hover-sync');
                    // Sync back to normal state
                    this.syncConnectedStyles(overlay, listItem, pageNum, index);
                }
            });

            annotationItems.push({ element: listItem, y: midpointY });

            // Create connection line from overlay to list item (will be created after items are in DOM)
            // Store reference for later
            listItem._overlay = overlay;
            overlay._listItem = listItem;
        });
        
        return annotationItems;
    }

    createConnectionLineForPage(overlay, listItem, pageNum, index, elementType) {
        // Create SVG line element in the app-level overlay (escapes grid stacking contexts)
        const svg = document.getElementById('connection-lines-overlay');
        if (!svg) return;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'connection-line');
        line.dataset.page = pageNum;
        line.dataset.index = index;
        line.dataset.elementType = elementType;

        // Set line color - standard label color
        const rgb = this.getColorRGB(elementType);
        const rgbStr = `rgb(${rgb.join(', ')})`;
        line.setAttribute('stroke', rgbStr);
        line.setAttribute('stroke-width', '2');
        line.setAttribute('opacity', '1');

        svg.appendChild(line);

        // Update position initially and on scroll/resize
        const updatePosition = () => this.updateConnectionLinePositionForPage(line, overlay, listItem);
        updatePosition();

        // Sync styles after connection line is created (reads CSS values from overlay)
        this.syncConnectedStyles(overlay, listItem, pageNum, index);

        // Listen to PDF scroller scroll and window events
        // Note: We don't listen to ann-list scroll since it's just a mirror of pdf-scroller
        const pdfScroller = document.getElementById('pdf-scroller');

        // Throttle updates with RAF for smooth updates
        let updateTimer = null;
        const throttledUpdate = () => {
            if (updateTimer) return;
            updateTimer = requestAnimationFrame(() => {
                updatePosition();
                updateTimer = null;
            });
        };
        if (pdfScroller) {
            pdfScroller.addEventListener('scroll', throttledUpdate, { passive: true });
        }
        window.addEventListener('scroll', throttledUpdate, { passive: true });
        window.addEventListener('resize', throttledUpdate);

        // Store cleanup function on the line element
        line._cleanup = () => {
            if (pdfScroller) {
                pdfScroller.removeEventListener('scroll', throttledUpdate);
            }
            window.removeEventListener('scroll', throttledUpdate);
            window.removeEventListener('resize', throttledUpdate);
        };
    }

    updateConnectionLinePositionForPage(line, overlay, listItem) {
        const overlayRect = overlay.getBoundingClientRect();

        const annCode = listItem.querySelector('.ann-code');
        if (!annCode) {
            line.setAttribute('visibility', 'hidden');
            return;
        }

        const annCodeRect = annCode.getBoundingClientRect();

        if (overlayRect.width === 0 || overlayRect.height === 0 ||
            annCodeRect.width === 0 || annCodeRect.height === 0) {
            line.setAttribute('visibility', 'hidden');
            return;
        }

        line.setAttribute('visibility', 'visible');

        // SVG line coordinates are viewport-based (getBoundingClientRect returns viewport coordinates)
        const x1 = overlayRect.right;  // Right edge of bounding box
        const x2 = annCodeRect.left;    // Left edge of annotation code
        const y = overlayRect.top + (overlayRect.height / 2);  // Midpoint of bounding box

        // Set SVG line attributes (viewport coordinates)
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y);
    }

    getDisplayNameForType(type) {
        // Map internal type names to user-friendly display names
        const displayNames = {
            'section_header': 'heading',
        };
        return displayNames[type] || type;
    }

    getShortCodeForType(type) {
        // Get 2-letter code for annotation type
        const codes = {
            'page_footer': 'PF',
            'page_header': 'PH',
            'section_header': 'SH',
            'text': 'TX',
            'title': 'TT',
            'heading': 'HD',
            'table': 'TB',
            'figure': 'FG',
            'list_item': 'LI',
            'code': 'CO',
            'caption': 'CP',
            'key_value_region': 'KV',
            'footnote': 'FN',
            'equation': 'EQ',
            'formula': 'FM',
            'picture': 'PI',
        };
        return codes[type] || type.substring(0, 2).toUpperCase();
    }



    getColorForType(type) {
        // Read annotation type colors from CSS variables (defined in color/*.css)
        const themeStyles = getComputedStyle(document.body);
        const cssVarName = `--annotation-${type}`;
        const color = themeStyles.getPropertyValue(cssVarName).trim();
        if (color) {
            return color;
        }
        // Fallback to default if type not found
        return themeStyles.getPropertyValue('--annotation-default').trim();
    }

    getTextColorForType(type) {
        // Read annotation type text colors from CSS variables (white or black based on background)
        const themeStyles = getComputedStyle(document.body);
        const cssVarName = `--annotation-${type}-text`;
        const textColor = themeStyles.getPropertyValue(cssVarName).trim();
        if (textColor) {
            return textColor;
        }
        // Fallback to default if type not found
        return themeStyles.getPropertyValue('--annotation-default-text').trim() || '#000000';
    }

    getColorRGB(type) {
        // Extract RGB values from rgba string
        const rgba = this.getColorForType(type);
        const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            return [match[1], match[2], match[3]];
        }
        return ['158', '158', '158']; // Default gray
    }

    // All density chart methods moved to density-charts.js module
}

// Initialize the viewer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.viewer = new Johnny5Viewer();
});
