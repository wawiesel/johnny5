# Johnny5 Specification

## 1. Scope

Johnny5 provides a reproducible, pluggable environment for document disassembly and reassembly.

### Core Requirements

1. **Disassemble PDFs** into a structured, lossless JSON using Docling.
2. **Apply a python code fixup** for aided disassembly with hot reload.
3. **Define a python code extraction spec** for aided extraction to a content JSON with hot reload.
4. **Define a python code reconstruct spec** for creation of a text document from that JSON only.
5. **Provide a web interface** for inspection and debugging.

---

## 2. Functional Specification

### CLI Commands

```bash
jny5 disassemble <pdf> --fixup <fixup.py> [docling-options]
# Outputs cache key: a1b2c3d4e5f6g7h8
# Creates: ~/.jny5/cache/structure/a1b2c3d4e5f6g7h8.json (raw)
#          ~/.jny5/cache/structure/b2c3d4e5f6g7h8i9.json (fixed)
```

```bash
jny5 extract <extract.py> --from-cache b2c3d4e5f6g7h8i9
# Uses: ~/.jny5/cache/structure/b2c3d4e5f6g7h8i9.json
# Outputs cache key: c3d4e5f6g7h8i9j0
# Creates: ~/.jny5/cache/content/c3d4e5f6g7h8i9j0.json
```

```bash
jny5 reconstruct <reconstruct.py> --from-cache c3d4e5f6g7h8i9j0
# Uses: ~/.jny5/cache/content/c3d4e5f6g7h8i9j0.json
# Outputs cache key: d4e5f6g7h8i9j0k1
# Creates: ~/.jny5/cache/qmd/d4e5f6g7h8i9j0k1.qmd
```

```bash
jny5 view <pdf> [--fixup <fixup.py> --extract <extract.py> --reconstruct <reconstruct.py> docling-options]
# Open the webviewer
```

### Content-Based Caching System

Johnny5 uses a sophisticated content-based caching system where inputs are checksummed to generate cache keys, and outputs are stored with filenames equal to those cache keys.

#### Content Types

| Type              | Description                                    | Shortcut Reference |
|-------------------|------------------------------------------------|--------------------|
| **Structure**     | Docling lossless JSON structure                | `structure.json`   |
| **Structure**     | Corrected structure after fixup                | `fstructure.json`  |
| **Content**       | Extracted pure content description             | `content.json`     |
| **Markdown**      | Content rendered as text format                | `content.qmd`      |
| **HTML**          | Content rendered for viewing                   | `content.html`     |

#### Cache Directory Configuration

Johnny5 uses the `JNY5_HOME` environment variable to determine the cache location:
- **Default**: `~/.jny5` (if `JNY5_HOME` is not set)
- **Cache directory**: `{JNY5_HOME}/cache/`
- **Example**: With `JNY5_HOME=/opt/johnny5`, cache files are stored in `/opt/johnny5/cache/`

#### Cache Key Generation

Each stage generates a cache key by checksumming all relevant inputs. The cache key is a 16-character SHA-256 hash derived from the sorted JSON representation of all input content.

#### Cache Key Sources by Stage

| Stage           | Cache Key Sources                           | Example Key        |
|-----------------|---------------------------------------------|--------------------|
| **Disassemble** | PDF content + Docling options               | `a1b2c3d4e5f6g7h8` |
| **Fixup**       | structure.json content + fixup.py content   | `b2c3d4e5f6g7h8i9` |
| **Extract**     | fstructure.json content + extract.py content| `c3d4e5f6g7h8i9j0` |
| **Reconstruct** | content.json content + reconstruct.py content | `d4e5f6g7h8i9j0k1` |

#### Cache File Naming

All cache files use subdirectories with consistent naming: `{JNY5_HOME}/cache/{stage}/{cache_key}.{ext}`

**Structure Stage**: Both raw Docling output and fixup-processed structure files are stored in the same `structure/` directory:
- `~/.jny5/cache/structure/a1b2c3d4e5f6g7h8.json` (raw Docling output)
- `~/.jny5/cache/structure/b2c3d4e5f6g7h8i9.json` (fixed structure after fixup)

**Other Stages**:
- `~/.jny5/cache/content/c3d4e5f6g7h8i9j0.json` (extracted content)
- `~/.jny5/cache/qmd/d4e5f6g7h8i9j0k1.qmd` (reconstructed QMD)

**Note**: When fixup is null/empty, structure and fstructure cache keys are identical, storing the same file. The raw and fixed files can coexist in the same directory with different cache keys.


#### Cache Key Emission

Every command outputs its generated cache key to stdout for chaining. All logging, progress, and diagnostic information goes to stderr to avoid interfering with cache key capture.

```bash
# Example workflow
STRUCTURE_KEY=$(jny5 disassemble document.pdf --fixup fixup.py)
FSTRUCTURE_KEY=$(jny5 extract extract.py --from-cache $STRUCTURE_KEY)
CONTENT_KEY=$(jny5 reconstruct reconstruct.py --from-cache $FSTRUCTURE_KEY)
jny5 view document.pdf --fixup fixup.py --extract extract.py --reconstruct reconstruct.py
```

#### Cache Benefits

- **Deterministic**: Same inputs always produce same cache key
- **Efficient**: Skip processing when cache exists
- **Reliable**: No manual file manipulation required
- **Traceable**: Cache keys provide audit trail
- **Parallel-safe**: Multiple processes can use same cache

### Python Module Callable Contracts

Each Python script must export a single callable with the following signatures:

**Note**: `FixupContext` provides page index, page size (points), cluster data, style flags (bold/italic), normalized coordinates, and helper methods like `is_bold()`, `near_left_margin()`, etc.

```python
# fixup.py
def fixup(structure: dict) -> dict:
    """Return modified structure JSON."""

# extract.py
def extract(fstructure: dict) -> dict:
    """Return simplified content JSON."""

# reconstruct.py
def reconstruct(content: dict) -> str:
    """Return reconstructed text (QMD)."""
```

### Web Application

The Johnny5 web interface provides a three-column layout for visualizing PDF disassembly and reconstruction processes. The interface is designed with **primary content areas** for the main workflow and **supporting data panels** for debugging and analysis.

#### Layout Structure

- **PDF Column (Left, primary)**
  - X-density banner above the viewer
  - Y-density sidebar on the left of the viewer
  - Zoom controls overlay and page counter
  - Options panel and terminal-like log at the bottom
- **Annotations Column (Middle, supporting)**
  - Progress indicator
  - Scrollable annotation list
  - Label toggles
- **Reconstruction Column (Right, primary)**
  - X-density banner above the content viewer
  - Y-density sidebar on the right of the viewer
  - Options panel and terminal-like log at the bottom

#### Visual Layout
```
┌─────────────── PDF Column ────────────────┬── Annotations ──┬────── Reconstruction ──────┐
│     i   |     X-Density (left)            │   Progress      │      X-Density (right)  r  │
├─────────┼─────────────────────────────────┼─────────────────┼────────────────────────────┤
│ Y-Den   │  PDF Viewer (zoom + overlays)   │  Annotation     │  Reconstructed Content     │
│ (left)  │  + Page Counter                 │  List           │  Viewer                    │
├─────────┴─────────────────────────────────┼─────────────────┴────────────────────────────┤
│     Options + Log (left)                  │  Label Toggles  │  Options + Log (right)     │
└───────────────────────────────────────────┴─────────────────┴────────────────────────────┘
```

**Image Indicators:**

- **i**: Original document image – changes when the underlying PDF or Docling options change
- **r**: Reconstruction content image – changes when reconstruction output changes

Note: Additional indicators for intermediate stages (e.g., fixup/extract) may be added later; the current layout renders `i` on the left and `r` on the right.

### Web Interface Requirements

- **Synchronized scrolling**: Vertical scrolling should keep primary panes aligned (PDF viewer and reconstructed content)
- **Responsive**: The UI responds smoothly to resize and zoom changes
- **Readable**: PDF rendering is crisp and easy to read; controls are discoverable

#### Naming Convention for Web UI IDs

IDs match the current implementation and use `pdf-*`, `ann-*`, and `rec-*` prefixes.

- PDF Column (left):
  - `pdf-indicator` – left-side image indicator (i)
  - `pdf-x-density` – top X-density banner; contains `x-density-chart`
  - `pdf-y-density` – left Y-density sidebar (canvases created dynamically)
  - `pdf-viewer` – main viewing area containing:
    - `pdf-scroller` → `pdf-canvas-container` → `pdf-canvas`
    - `overlay-container` – annotations overlay
    - Zoom controls: `zoom-in`, `zoom-out`, `fit-width`, `fit-height`, `zoom-level`
    - `page-count-overlay`
  - `pdf-options` – left options panel (collapsible via `pdf-options-cb` / `pdf-options-toggle`)
  - `pdf-log` – left log panel (resizable via `.pdf-log-resize-handle`)

- Annotations Column (middle):
  - `ann-progress` – progress indicator
  - `ann-list` – wrapper containing `annotation-list`
  - `ann-toggles` – wrapper containing `label-checkboxes` (resizable via `.ann-toggles-resize-handle`)

- Reconstruction Column (right):
  - `rec-x-density` – top X-density banner; contains `x-density-right-chart`
  - `rec-indicator` – right-side image indicator (r)
  - `rec-viewer` – reconstructed content area
  - `rec-y-density` – right Y-density sidebar (canvases created dynamically)
  - `rec-options` – right options panel (collapsible via `rec-options-cb` / `rec-options-toggle`)
  - `rec-log` – right log panel (resizable via `.rec-log-resize-handle`)

Rulers and gutters are redrawn on initial render and window resize and mirror the primary scroller to maintain alignment.
