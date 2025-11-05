# Johnny5 — Design

> SPEC = what the system must do.  
> DESIGN = how we implement it to meet the SPEC.  
> CONTRIBUTING = repo layout, coding standards, and workflow.

## 1. Architecture

### 1.1 Components
- **disassembler**: PDF → Docling lossless JSON → apply fixup → corrected JSON.
- **extractor**: corrected JSON → simplified content JSON.
- **reconstructor**: content JSON → QMD + HTML strings (and files).
- **server**: FastAPI app serving PDF.js UI, REST/WS APIs, static assets.
- **watcher**: hot-reload fixup modules, broadcast overlay updates.
- **utils**: pure functions (density, margins, context building).
- **fixups**: user-provided functions (per-PDF heuristics).

### 1.2 CLI Implementation

**Convenience Commands** (beyond SPEC.md requirements):
- `jny5 to-pdf <file>` - Render file to PDF based on file extension (currently supports .qmd using Quarto)
- `jny5 check <file>` - Check file for quality issues based on file extension (currently supports .qmd)

### 1.3 Data Flow
```
PDF (input)
└─ disassembler.run_disassemble(pdf, fixup.py)
├─ Docling → {JNY5_HOME}/cache/structure/{cache_key}.json
├─ fixup.py → {JNY5_HOME}/cache/structure/{cache_key}.json (same or different key)
└─ extractor.run_extract(fstructure_path, extractor.py)
└─ {JNY5_HOME}/cache/content/{cache_key}.json
└─ reconstructor.run_reconstruct(content_path, reconstructor.py)
└─ {JNY5_HOME}/cache/qmd/{cache_key}.qmd
└─ server (Johnny5 Web Interface)
├─ Left Pane: Y-Density, Annotated PDF, X-Density, Disassembly Log
├─ Right Pane: QMD/HTML Tabs, Reconstructed Output, Reconstruction Log
└─ WS /events (hot-reload pings)
```

### 1.4 Processes & Hot Reload
- `watcher` watches:
  - fixup modules under `src/johnny5/fixups/` and user-provided paths
  - cache files in `{JNY5_HOME}/cache/structure/`
- On change: re-run fixup → generate new cache key → notify via WS.

## 2. Modules & Contracts

### 2.1 disassembler.py
- `run_disassemble(pdf: Path, fixup: Path) -> str`
  - Generates cache key from PDF content and fixup file
  - Writes `{JNY5_HOME}/cache/structure/{cache_key}.json` (structure with fixup applied)
  - Returns cache key for downstream use
  - **CLI Output**: See SPEC.md for cache key emission and logging behavior
- Implementation notes:
  - Use Docling (pdfium backend). Store metadata with options + file hash.
  - Fixup loading: execute fixup.py with `FixupContext`.

### 2.2 extractor.py
- `run_extract(cache_key: str, extractor: Path) -> str`
  - Uses `{JNY5_HOME}/cache/structure/{cache_key}.json` as input
  - Converts structure JSON into content JSON using extractor.py
  - Writes `{JNY5_HOME}/cache/content/{new_cache_key}.json`
  - Returns new cache key for downstream use
  - **CLI Output**: See SPEC.md for cache key emission and logging behavior

### 2.3 reconstructor.py
- `run_reconstruct(cache_key: str, reconstructor: Path) -> str`
  - Uses `{JNY5_HOME}/cache/content/{cache_key}.json` as input
  - Converts content JSON into QMD using reconstructor.py
  - Writes `{JNY5_HOME}/cache/qmd/{new_cache_key}.qmd`
  - Returns new cache key for downstream use

### 2.4 server.py
FastAPI (async) serving local files and visualization tools:
- **Web Interface**: Three-column layout (PDF | Annotations | Reconstruction) with synchronized scrolling. See §2.4.1 for detailed architecture.
- **REST API**:
  - `GET /` → Johnny5 Web Interface
  - `GET /doc` → metadata (page count, sizes)
  - `GET /pages/{n}/image?dpi=...` → raster via PyMuPDF
  - `GET /overlays/{n}` → clusters, colors, callouts
  - `GET /density/{n}` → x/y density arrays + inferred margins
- **WebSocket**: `WS /events` → `{"type":"reload","page":n}` on fixup refresh
- Static files under `web/static`, templates under `web/templates`

#### 2.4.1 Web Viewer Architecture

##### HTML/CSS Layout Architecture

The web viewer uses a **three-layer stacking architecture** to manage visual layering between content, connection lines, and UI chrome:

**Layer 1: Content Grid (z-index: 10)**
```html
<div class="content-grid">
  <div id="pdf-col">
    <div id="pdf-viewer">...</div>
  </div>
  <div id="ann-col">
    <div id="ann-list">...</div>
  </div>
  <div id="rec-col">
    <div id="rec-viewer">...</div>
  </div>
</div>
```
- Contains primary content viewers (PDF, annotations, reconstructed content)
- Positioned with `position: relative; z-index: 10`
- Connection lines render above this layer

**Layer 2: SVG Overlay (z-index: 15)**
```html
<svg id="connection-lines-overlay"></svg>
```
- Connection lines between PDF bounding boxes and annotation list
- Positioned with `position: absolute; z-index: 15; pointer-events: none`
- Individual lines have `pointer-events: auto` for interaction

**Layer 3: Chrome Grid (z-index: 20)**
```html
<div class="chrome-grid">
  <div id="pdf-col-chrome">
    <div id="color-mode-selector">...</div>
    <div id="pdf-x-density">...</div>
    <div id="pdf-y-density">...</div>
    <div id="pdf-options">...</div>
    <div id="pdf-log">...</div>
  </div>
  <div id="ann-col-chrome">
    <div id="ann-progress">...</div>
    <div id="ann-toggles">...</div>
  </div>
  <div id="rec-col-chrome">
    <div id="rec-x-density">...</div>
    <div id="rec-indicator">...</div>
    <div id="rec-y-density">...</div>
    <div id="rec-options">...</div>
    <div id="rec-log">...</div>
  </div>
</div>
```
- UI chrome (density panels, controls, logs, toggles)
- Positioned with `position: absolute; z-index: 20; pointer-events: none`
- Chrome column containers (`#pdf-col-chrome`, etc.) have `position: relative; z-index: 20` to promote them into the positioned stacking context
- Individual chrome elements have `pointer-events: auto` for interaction
- Connection lines render below this layer

**Grid Alignment:**
- Both content-grid and chrome-grid use identical CSS grid definitions: `grid-template-columns: minmax(0, 1fr) 18ch minmax(0, 1fr)`
- This ensures chrome elements automatically align with their corresponding content areas without manual positioning

**Design Rationale:**
- **Architectural clarity**: HTML structure explicitly shows the three visual layers
- **Centralized z-index management**: All stacking logic in one place (`0_layout.css`)
- **Automatic chrome behavior**: New chrome elements inherit z-index: 20 by being in chrome-grid
- **Maintainability**: Future developers can see layering intent from structure and comments
- **Debuggability**: DevTools layer visualization matches HTML structure

**Important Implementation Notes:**
- Chrome backgrounds must be **fully opaque** for proper visual layering. Semi-transparent backgrounds allow connection lines to show through despite correct z-index stacking.
- Debug color scheme uses opaque colors: `--x-density-bg`, `--y-density-bg`, `--ann-list-bg`, `--ann-toggles-bg` all have alpha=1.0
- The JavaScript sets inline styles on density panels (e.g., `style="background: var(--x-density-bg)"`) which can override CSS if not careful.

##### JavaScript Architecture

The JavaScript codebase is organized into modular classes that follow a consistent pattern:
- Each module is a class that takes the main `viewer` instance as a constructor parameter
- Modules communicate through the shared `viewer` object, accessing properties and other modules via `this.viewer`
- The main `Johnny5Viewer` class orchestrates all modules and maintains the public API

**Module Structure:**
- `app.js` - Main orchestrator containing all viewer functionality
- `density-charts.js` - Density chart rendering and scrolling (separate module)
- `resize.js` - Resize handling utilities

All core functionality (PDF loading, rendering, annotations, grids, rulers, connection lines, label toggles, logging, theme management) is implemented within the `Johnny5Viewer` class in `app.js`.

**Initialization Flow:**
1. `Johnny5Viewer` constructor initializes internal state and creates the `DensityCharts` instance
2. `init()` method sets up PDF.js, theme toggle, event listeners, and WebSocket
3. `loadPDFFromServer()` loads the PDF and renders pages
4. `renderAllPages()` draws all grids and rulers (PDF grid, Y-density grid, X-density grid, annotations grid, annotation list grid)
5. If disassembly data is available, `loadAllPageData()` loads annotations and density charts
6. Grids are redrawn after data loads to ensure synchronization

### 2.5 watcher.py
- `watch_fixups(paths: list[Path], on_change: Callable[[], None])`
- Debounce 250–500 ms. Broadcast WS event after successful re-fixup.

### 2.6 utils/
- `density.py`
  - `compute_x_density(page) -> list[float]`
  - `compute_y_density(page) -> list[float]`
  - Units: PDF points (1/72 in). All bbox ops in points.
- `margins.py`
  - `infer_margins(page, *, pct=0.98) -> dict[left,right,top,bottom]` using coverage percentiles; no hardcoded px.
- `fixup_context.py`
  - `FixupContext` with page index, page size (points), cluster, style flags (bold/italic), normalized coords, and helpers.
  - Provide `is_bold(cell|cluster)`, `near_left_margin(cluster, margins, tol)`.

## 3. Naming & Files

- Cache: `{JNY5_HOME}/cache/{stage}/{cache_key}.{ext}` where stage is `structure`, `content`, or `qmd`
- Module names: `disassembler.py`, `extractor.py`, `reconstructor.py`, not verbs in function names except `run_*`
- Fixup signature: According to @SPEC.md

## 4. Error Handling

See SPEC.md for error handling specifications. Implementation follows the structured error hierarchy defined there.

## 5. Performance

* Page rasterization via PyMuPDF directly; cache pixmaps by `(page, dpi)`.
* Density/margin computations vectorized with NumPy where beneficial.
* Avoid re-parsing PDF when only fixups change.
* **Dynamic/Lazy Loading**: Grid overlays, density charts, and page canvases must be loaded on-demand (one page at a time) to support large PDFs (e.g., 2000+ pages) without exhausting memory. Canvas elements are created per-page and can be garbage collected when scrolled out of view.

## 6. Security

* Never execute arbitrary code outside designated fixup module path.
* Sandbox: if user supplies external path, require explicit `--allow-external-fixup`.

## 7. Testing Strategy

See CONTRIBUTING.md for testing framework and approach. Implementation follows pytest with unit tests, golden files, web tests, and cache key generation tests.

## 8. Non-Goals (for now)

* In-browser PDF parsing.
* OCR pipelines beyond Docling's toggle.
* WYSIWYG fixup editor (future).
