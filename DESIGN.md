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
└─ disassembler.run_disassemble()
├─ Docling → _cache/lossless.json
├─ fixup(module:function) → in-memory edits
└─ _cache/lossless_fixed.json  (authoritative corrected JSON)
└─ reassembler.run_reassemble(_cache/lossless_fixed.json)
├─ QMD text  → _cache/output.qmd
└─ HTML text → _cache/output.html
└─ server (PDF.js + overlays)
├─ GET /pages/{n} (images/metrics)
├─ GET /overlays/{n}
└─ WS /events (hot-reload pings)
```

### 1.3 Processes & Hot Reload
- `watcher` watches:
  - fixup modules under `src/johnny5/fixups/` and user-provided paths
  - `_cache/lossless.json`
- On change: re-run fixup → overwrite `_cache/lossless_fixed.json` → notify via WS.

## 2. Modules & Contracts

### 2.1 disassembler.py
- `run_disassemble(pdf: Path, *, layout_model: str, enable_ocr: bool, json_dpi: int, fixup: str | None) -> Path`
  - Writes `_cache/lossless.json` and `_cache/lossless_fixed.json`.
  - Returns path to corrected JSON.
- Implementation notes:
  - Use Docling (pdfium backend). Store `_cache/_meta.json` with options + file hash.
  - Fixup loading: `module:function` import; execute with `FixupContext`.

### 2.2 reassembler.py
- `run_reassemble(json_path: Path) -> tuple[str, str]`
  - Returns `(qmd_text, html_text)`. Also writes `_cache/output.qmd`, `_cache/output.html`.
  - Deterministic ordering; no side effects outside `_cache/`.

### 2.3 server.py
- FastAPI (async) with:
  - `GET /` → index (PDF.js shell + right/left/top panes, tabs for QMD/HTML).
  - `GET /doc` → metadata (page count, sizes).
  - `GET /pages/{n}/image?dpi=...` → raster via PyMuPDF (no quality loss controls in Matplotlib).
  - `GET /overlays/{n}` → clusters, colors, callouts.
  - `GET /density/{n}` → x/y density arrays + inferred margins.
  - `WS /events` → `{"type":"reload","page":n}` on fixup refresh.
- Static under `web/static`, templates under `web/templates`.

### 2.4 watcher.py
- `watch_fixups(paths: list[Path], on_change: Callable[[], None])`
- Debounce 250–500 ms. Broadcast WS event after successful re-fixup.

### 2.5 utils/
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

- Cache: `_cache/lossless.json`, `_cache/lossless_fixed.json`, `_cache/output.{qmd,html}`, `_cache/_meta.json`.
- Module names: `disassembler.py`, `reassembler.py`, not verbs in function names except `run_*`.
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
