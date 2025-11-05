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
- FastAPI (async) serving local files and visualization tools:
  - `GET /` → Johnny5 Web Interface with split-pane layout:
    - **Left Pane (Disassembly)**: 
      - X-Density banner above PDF with image indicators (d: original document, p: fixup JSON)
      - Y-Density banner to left of PDF
      - Annotated PDF with toggleable bounding boxes in center
      - Right gutter with annotations connected to bounding boxes
      - Terminal-like disassembly log at bottom
    - **Right Pane (Reconstruction)**:
      - X-Density banner above content with image indicator (q: content.json)
      - Y-Density banner to right of content
      - JSON/QMD/HTML Tabs with reconstructed output
      - Terminal-like reconstruction log at bottom
    - **Shared vertical scroll bar** for synchronized scrolling
  - `GET /doc` → metadata (page count, sizes).
  - `GET /pages/{n}/image?dpi=...` → raster via PyMuPDF (no quality loss controls in Matplotlib).
  - `GET /overlays/{n}` → clusters, colors, callouts.
  - `GET /density/{n}` → x/y density arrays + inferred margins.
  - `WS /events` → `{"type":"reload","page":n}` on fixup refresh.
- Static under `web/static`, templates under `web/templates`.
- Assumes local files exist; serves visualization and debugging tools.

#### 2.4.1 Web Viewer Architecture
The JavaScript codebase is organized into modular classes that follow a consistent pattern:
- Each module is a class that takes the main `viewer` instance as a constructor parameter
- Modules communicate through the shared `viewer` object, accessing properties and other modules via `this.viewer`
- The main `Johnny5Viewer` class orchestrates all modules and maintains the public API

**Module Structure:**
- `utils.js` - Utility functions (DOM helpers, color helpers, drawing helpers)
- `theme-manager.js` - Theme switching and indicator state management
- `logging.js` - Log entry management and clipboard functionality
- `connection-lines.js` - Connection lines between PDF annotations and list items
- `label-toggles.js` - Label toggle UI and filtering functionality
- `grid-rulers.js` - Grid and ruler drawing for all panels
- `annotations.js` - Annotation rendering and management
- `pdf-loader.js` - PDF loading, data management, and WebSocket connections
- `pdf-renderer.js` - PDF rendering and canvas management with virtualization
- `density-charts.js` - Density chart rendering and scrolling (existing module)
- `app.js` - Main orchestrator that initializes modules and delegates methods

**Script Loading Order:**
Modules must be loaded in dependency order before `app.js` because:
1. JavaScript classes must be defined before they can be instantiated
2. The main `Johnny5Viewer` constructor instantiates all modules synchronously
3. Modules reference each other through the shared `viewer` object, so all class definitions must exist

The HTML loads scripts in this order: utils → theme-manager → logging → connection-lines → grid-rulers → annotations → label-toggles → pdf-renderer → pdf-loader → density-charts → app.js

**Initialization Flow:**
1. `Johnny5Viewer` constructor creates all module instances
2. `init()` method sets up PDF.js, theme toggle, event listeners, and WebSocket
3. `loadServerPDF()` loads the PDF and renders pages
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
