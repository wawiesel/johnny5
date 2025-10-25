# Johnny5 — Design

> SPEC = what the system must do.  
> DESIGN = how we implement it to meet the SPEC.  
> CONTRIBUTING = repo layout, coding standards, and workflow.

## 1. Architecture

### 1.1 Components
- **disassembler**: PDF → Docling lossless JSON → apply fixup → corrected JSON.
- **reassembler**: corrected JSON → QMD + HTML strings (and files).
- **server**: FastAPI app serving PDF.js UI, REST/WS APIs, static assets.
- **watcher**: hot-reload fixup modules, broadcast overlay updates.
- **utils**: pure functions (density, margins, context building).
- **fixups**: user-provided functions (per-PDF heuristics).

### 1.2 Data Flow
```
PDF (input)
└─ disassembler.run_disassemble(pdf, fixup.py)
├─ Docling → _cache/structure.json
├─ fixup.py → _cache/fstructure.json
└─ extractor.run_extract(fstructure.json, extractor.py)
└─ _cache/content.json
└─ reassembler.run_reassemble(content.json, assembler.py)
└─ _cache/content.qmd
└─ server (Johnny5 Web Interface)
├─ Left Pane: Y-Density, Annotated PDF, X-Density, Disassembly Log
├─ Right Pane: QMD/HTML Tabs, Reassembled Output, Reconstruction Log
└─ WS /events (hot-reload pings)
```

### 1.3 Processes & Hot Reload
- `watcher` watches:
  - fixup modules under `src/johnny5/fixups/` and user-provided paths
  - `_cache/structure.json`
- On change: re-run fixup → overwrite `_cache/fstructure.json` → notify via WS.

## 2. Modules & Contracts

### 2.1 disassembler.py
- `run_disassemble(pdf: Path, fixup: Path) -> tuple[Path, Path]`
  - Writes `_cache/structure.json` (detailed structure without fixup) and `_cache/fstructure.json` (detailed structure with fixup).
  - Returns paths to both JSON files.
- Implementation notes:
  - Use Docling (pdfium backend). Store `_cache/_meta.json` with options + file hash.
  - Fixup loading: execute fixup.py with `FixupContext`.

### 2.2 extractor.py
- `run_extract(fstructure_path: Path, extractor: Path) -> Path`
  - Converts `fstructure.json` into `content.json` using extractor.py
  - Returns path to content.json

### 2.3 reassembler.py
- `run_reassemble(content_path: Path, assembler: Path) -> Path`
  - Converts `content.json` into `content.qmd` using assembler.py
  - Returns path to content.qmd

### 2.4 server.py
- FastAPI (async) with:
  - `GET /` → Johnny5 Web Interface with split-pane layout:
    - **Left Pane (Disassembly)**: 
      - X-Density banner above PDF
      - Y-Density banner to left of PDF
      - Annotated PDF with toggleable bounding boxes in center
      - Right gutter with annotations connected to bounding boxes
      - Terminal-like disassembly log at bottom
    - **Right Pane (Reconstruction)**:
      - X-Density banner above content
      - Y-Density banner to right of content
      - QMD/HTML Tabs with reassembled output
      - Terminal-like reconstruction log at bottom
    - **Shared vertical scroll bar** for synchronized scrolling
  - `GET /doc` → metadata (page count, sizes).
  - `GET /pages/{n}/image?dpi=...` → raster via PyMuPDF (no quality loss controls in Matplotlib).
  - `GET /overlays/{n}` → clusters, colors, callouts.
  - `GET /density/{n}` → x/y density arrays + inferred margins.
  - `WS /events` → `{"type":"reload","page":n}` on fixup refresh.
- Static under `web/static`, templates under `web/templates`.

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

- Cache: `_cache/structure.json`, `_cache/fstructure.json`, `_cache/content.json`, `_cache/content.qmd`, `_cache/_meta.json`.
- Module names: `disassembler.py`, `extractor.py`, `reassembler.py`, not verbs in function names except `run_*`.
- Fixup signature:
  ```python
  def fixup(ctx: FixupContext) -> None | dict | list[dict] | str:
      """Return None (no change), a replacement cluster, a list (split), or label override (str)."""
  ```

## 4. Error Handling

* Raise `Johnny5Error` (base) with specific subclasses:
  * `DoclingError`, `FixupLoadError`, `FixupRuntimeError`, `InvalidJsonError`.
* Server returns `4xx/5xx` JSON with `code`, `message`, `detail`.

## 5. Performance

* Page rasterization via PyMuPDF directly; cache pixmaps by `(page, dpi)`.
* Density/margin computations vectorized with NumPy where beneficial.
* Avoid re-parsing PDF when only fixups change.

## 6. Security

* Never execute arbitrary code outside designated fixup module path.
* Optional sandbox: if user supplies external path, require explicit `--allow-external-fixup`.

## 7. Testing Strategy

* Unit tests per util + module contracts.
* Golden files for `_cache/lossless_fixed.json` on small fixtures.
* Web tests: Starlette TestClient for JSON endpoints; smoke test for index.

## 8. Non-Goals (for now)

* In-browser PDF parsing.
* OCR pipelines beyond Docling's toggle.
* WYSIWYG fixup editor (future).
