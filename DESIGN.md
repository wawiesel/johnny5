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
  - `GET /api/pdf?pdf_checksum=...` → Serve PDF file by checksum
  - `GET /api/pdf-info?pdf_checksum=...` → PDF metadata and checksum
  - `GET /api/disassembly-status?pdf_checksum=...&cache_key=...` → Job status for specific cache_key
  - `GET /api/structure/{page}?pdf_checksum=...&cache_key=...` → Structure data for page
  - `GET /api/density/{page}?pdf_checksum=...&cache_key=...` → Density data for page
  - `POST /api/disassemble` → Upload PDF, returns `pdf_checksum`
  - `POST /api/disassemble-refresh?pdf_checksum=...` → Trigger disassembly with options
  - `GET /api/events?pdf_checksum=...&instance_id=...` → SSE stream filtered by instance_id
- **Multi-User Architecture**: See §2.4.2 for detailed multi-PDF support design
- Static files under `web/static`, templates under `web/templates`

#### 2.4.2 Multi-User / Multi-PDF Architecture

The server implements a stateless, identifier-based architecture to support multiple clients viewing different PDFs simultaneously, meeting the requirements specified in SPEC.md §Multi-User / Multi-PDF Support.

##### Identifiers

**PDF Checksum**: Each PDF file is identified by its SHA-256 checksum (64-character hexadecimal string)
- Same PDF file always has the same checksum regardless of processing options
- Used for routing requests, file lookup, and client session management
- Example: `pdf_checksum="a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2"`

**Cache Key**: Processing results are identified by cache key (16-character hash of PDF checksum + options)
- Different processing options (e.g., OCR on/off) produce different cache keys
- Used for cache lookups and job tracking
- Example: `cache_key="a1b2c3d4e5f6g7h8"` for PDF with OCR enabled

**Instance ID**: Each client browser session generates a unique UUID (instance_id) on page load
- Used for logging and tracking which client requested which job
- Included in all API requests for server-side logging
- Example: `instance_id="550e8400-e29b-41d4-a716-446655440000"`

##### Example Scenario

1. **User A** and **User B** both view the same PDF (same `pdf_checksum`)
2. Both load with default options (no OCR) → cache exists, both get immediate results
3. **User A** requests OCR processing (different `cache_key`) → job starts, User A added to `requested_by`
4. **User B** requests OCR while User A's job is in progress → User B added to `requested_by`, no duplicate job
5. When OCR completes → both User A and User B receive completion notification
6. If **User C** later requests OCR → cache exists, immediate response, no notification needed

##### State Management

**PDF Registry** (in-memory, rebuildable):
```python
pdf_registry: Dict[str, Path] = {}  # pdf_checksum -> pdf_path
```
- Maps PDF checksums to file paths
- Populated on upload or CLI PDF load
- Can be rebuilt by scanning uploads directory

**Job Tracking** (in-memory, per-cache_key):
```python
disassembly_jobs: Dict[str, Dict] = {
    "cache_key_abc123": {
        "status": "in_progress",  # pending, in_progress, completed, error
        "requested_by": ["instance_id_1", "instance_id_2"],  # Clients waiting
        "cache_key": "abc123",
        "pdf_checksum": "xyz789",
        "options": {"enable_ocr": True},
        "started_at": "2025-01-01T12:00:00",
        "completed_at": None,
        "queue_position": 2,  # Position in processing queue (0 = currently processing)
        "estimated_time": "30s",  # Estimated time remaining
        "progress": 0.45,  # Progress percentage (0.0 to 1.0)
    }
}
```
- One job entry per unique cache_key
- Multiple clients can wait for the same job
- Jobs include progress information for status endpoint polling
- Jobs are cleaned up after completion (or kept for quick status lookup)

**Request ID Tracking** (in-memory, per-request_id):
```python
request_notifications: Dict[str, set[str]] = {}  # request_id -> set of instance_ids
```
- Maps request_id to clients waiting for that request
- Used for targeted completion notifications

**SSE Client Queues** (in-memory, per-instance_id):
```python
sse_client_queues: Dict[str, asyncio.Queue] = {}  # instance_id -> queue
```
- Each client has its own notification queue
- Used only for completion notifications (not log messages)
- Lightweight: only sends when jobs complete

##### Request Flow

1. **Client Request**:
   - Client submits: `pdf_checksum`, `instance_id`, `options` (in request body)
   - Server generates `cache_key` (JJJ) from `pdf_checksum + options`
   - Server checks if cache exists for `cache_key`

2. **Immediate Response**:
   - Server returns: `{cache_key: "JJJ", cache_exists: true/false, request_id: "..."}`
   - If `cache_exists: true`: Client can immediately load data, no request_id needed
   - If `cache_exists: false`: Server returns `request_id` for tracking this specific job

3. **Job Deduplication**:
   - If job already in progress for `cache_key`: Reuse existing `request_id`
   - If new job: Create `request_id`, start disassembly, add `instance_id` to `request_notifications[request_id]`

4. **Client Subscription**:
   - Client receives `request_id` and subscribes to notifications for that ID
   - Client maintains mapping: `request_id → {cache_key, options}` for logging

5. **Completion Notification** (via SSE, no polling):
   - When disassembly completes, server sends notification: `{type: "job_complete", request_id: "...", cache_key: "JJJ", status: "completed"}`
   - Only clients in `request_notifications[request_id]` receive the notification
   - Client generates log message: "options checksum=JJJ (options set {X,Y,Z}) ready"

6. **Status Endpoint** (backup/progress/monitoring):
   - `GET /api/disassembly-status?pdf_checksum=...&cache_key=...` returns detailed job status
   - Response includes: `{status: "in_progress", queue_position: 2, estimated_time: "...", progress: 0.45}`
   - **Primary use cases**:
     - **Progress indicators**: Client can poll periodically to show queue position, estimated time, progress percentage
     - **Backup/recovery**: If SSE connection is lost, client can poll to check status
     - **Monitoring**: Can query status of any cache_key to see if it's in progress or completed
   - Polling frequency can be lower (e.g., every 2-5 seconds) since SSE handles completion notifications

##### SSE Notification System

Server-Sent Events are used only for completion notifications (not log messages):
- Client connects to `/api/events?instance_id=...`
- Server creates queue for that `instance_id`
- When a job completes, server sends notification with `request_id`
- Only clients that subscribed to that `request_id` receive the notification
- Prevents cross-client message leakage
- Lightweight: only sends when jobs complete, not continuous log streaming

##### Logging

All server logs include `instance_id` for traceability:
```
[instance_id_1] Starting disassembly for cache_key abc123 (pdf_checksum xyz789)
[instance_id_1] Disassembly completed for cache_key abc123
```

##### Stateless Design Benefits

- **No per-client state dictionaries**: Uses identifier-based lookups
- **Scales horizontally**: Can add server instances (with shared storage)
- **Survives restarts**: PDF registry can be rebuilt from filesystem
- **Memory efficient**: Only active jobs consume memory
- **Cache-friendly**: Leverages existing cache key system

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
3. Generate `instance_id` (UUID) on page load for client identification
4. `loadPDFFromServer()` loads the PDF and renders pages
5. `renderAllPages()` draws all grids and rulers (PDF grid, Y-density grid, X-density grid, annotations grid, annotation list grid)
6. If disassembly data is available, `loadAllPageData()` loads annotations and density charts
7. Grids are redrawn after data loads to ensure synchronization

**Multi-User Support:**
- Client generates `instance_id` (UUID) on page load, stored in localStorage
- All API requests include `instance_id` and `pdf_checksum` as query parameters or headers
- **Request Flow**:
  1. Client submits options → server returns `{cache_key, cache_exists, request_id}`
  2. Client maintains mapping: `request_id → {cache_key, options}` for logging
  3. If `cache_exists: false`, client subscribes to SSE notifications for that `request_id`
  4. Server sends completion notification via SSE when job finishes
  5. Client generates log messages from status transitions
- **Status Endpoint** (progress/backup): `GET /api/disassembly-status?pdf_checksum=...&cache_key=...` 
  - Returns detailed status: `{status, queue_position, estimated_time, progress}`
  - Client can poll periodically (e.g., every 2-5 seconds) to show progress indicators
  - Useful for showing queue position, estimated time remaining, progress percentage
  - Also serves as backup if SSE connection is lost
- **Primary notification**: SSE provides real-time completion notifications (no polling needed)
- **Progress updates**: Status endpoint polling provides queue position and progress for better UX

**Multiple Option Sets:**
- Client can request disassembly for multiple option combinations simultaneously
- Each option combination generates a unique `cache_key` and has its own job status
- Client tracks status for all requested option sets (not just the currently displayed one)
- When user switches option sets, the refresh indicator shows the status for that specific `cache_key`:
  - **Processing** (pulsating yellow): Job is in progress for this option set
  - **Up-to-date** (green): Job completed, cache exists for this option set
  - **Needs-run** (red): Options changed, no cache exists yet
  - **Error** (red pulsing): Job failed for this option set
- Client maintains a mapping of `cache_key` → status for all active option sets
- Status indicators update in real-time as jobs complete, even if user is viewing a different option set
- **Automatic Status Updates**: When a job completes for any option set, the client receives a notification and updates its status mapping. If the user switches to that option set after completion, the indicator immediately shows green (up-to-date) without requiring any user interaction or manual refresh
- **Log Notifications**: The client displays log messages in the PDF log panel for each option set request, following this sequence:
  1. **Request initiated**: `requesting option set {X,Y,Z} -> checksum=JJJ`
     - Logged immediately when user requests a new option combination
     - Includes human-readable option description and the cache_key (checksum)
  2. **Cache check result**:
     - If cache exists: `options checksum=JJJ in cache, ready to view`
     - If cache missing: `options checksum=JJJ not in cache, computing`
  3. **Completion**:
     - Success: `options checksum=JJJ (options set {X,Y,Z}) ready`
     - Error: `options checksum=JJJ (options set {X,Y,Z}) failed: [error message]`
  - These log messages appear regardless of which option set is currently being viewed, providing feedback for all background jobs
  - The cache_key (checksum) provides a consistent identifier across all messages for a given option set

- **Status Line**: The log panel includes a single updating status line at the bottom that shows polling data:
  - Displays current queue position, progress percentage, and estimated time for active jobs
  - Updates in place (does not create new log entries) as polling data arrives
  - Format: `[Status] checksum=JJJ: queue position #2, 45% complete, ~30s remaining`
  - Only shows status for jobs that are currently in progress
  - If multiple jobs are in progress, shows the most relevant one (e.g., the one being viewed)
  - Implemented as a special log entry element that gets its content updated rather than appended

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
