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

The Johnny5 web interface provides a split-pane layout for visualizing PDF disassembly and reconstruction processes. The interface is designed with **primary content areas** for the main workflow and **supporting data panels** for debugging and analysis.

#### Layout Structure

**Primary Content (Main Focus):**
- **Left Pane**: PDF Viewer - displays the actual PDF page with toggleable bounding boxes
- **Right Pane**: Reconstructed Content - shows JSON/QMD/HTML output

**Supporting Data (Secondary Information):**
- **X-Density Banners**: Horizontal density charts at the top of both panes
- **Y-Density Sidebars**: Vertical density charts positioned asymmetrically
  - Left side of left pane
  - Right side of right pane
- **Annotations Gutter**: Thin labels (30 chars max) on right side of left pane
  - Shows element types like "section_header", "table", etc.
- **Log Terminals**: Process logs at bottom of both panes
- **Image Indicators**: State indicators (d, p, q) showing data source status

#### Visual Layout
```
Left Pane:  [Y-Density] | [PDF Viewer] | [Annotations]
Right Pane: [Reconstructed Content] | [Y-Density]
```

The PDF viewer and reconstructed content are the **primary focus** - they should be the largest, most prominent areas. All other elements are **supporting information** to help understand and debug the disassembly/reconstruction process.

```
┌─────────────────────────────┐───┌──────────────────────────┐
│  i  |     X-Density     | d │ e │       X-Density    | r   │
├─────┬───────────────────┬───┤───├──────────────────────────┤
│     │                   │       │                    |     │
│ Y-  │   Annotated       │An-    │ Reconstructed      | Y-  │
│ Den │     PDF +         │not    │ Content            | Den │
│ sity│   Toggleable      │at-    │ [JSON|QMD|HTML]    │ sity│
│     │   Bounding        │ion    │                    │     │
│     │     Boxes         │s      │                    │     │
│     │                   │       │                    │     │
├─────┴───────────────────┴────────────────────────────┴─────┤
│   Disassemble options   │  label│  Reconstruct options     │
├─────────────────────────│ sel=  │──────────────────────────┤
│    Disassembly Log      │ ect   │  Reconstruction Log      │
│    (Terminal Output)    │       │  (Terminal Output)       │
└─────────────────────────┴──────-┴──────────────────────────┘  

```

**Image Indicators:**

- **i**: Original document image - changes when the underlying PDF changes or Docling processing options change
- **d**: Fixup JSON image - represents the content of the fixup JSON (if d==i, no fixups are needed)
- **e**: Extraction content JSON image
- **r**: Reconstruction content JSON image

Here is a wireframe with the components.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wireframe Layout</title>
    <style>
        body, html {
            margin: 0;
            height: 100vh;
            font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
            color: #fff;
            font-size: 14px;
            background-color: #111;
            overflow: hidden; /* Prevent body scroll */
        }

        .app-container {
            display: grid;
            height: 100vh;
            width: 100vw;
            grid-template-columns: 50px 1fr 50px 50px 2px 1fr 50px;
            grid-template-rows: 40px 1fr 80px 100px;
            gap: 1px;
            background-color: #000;
        }

        /* Helper class for all boxes */
        .box {
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            text-align: center;
        }
        
        /* Helper for light boxes that need dark text */
        .dark-text {
            color: #333;
        }

        /* --- RED HUES --- */
        #indicator-i {
            grid-row: 1 / 2; grid-column: 1 / 2;
            background-color: #ff4747; /* red */
        }
        #indicator-d {
            grid-row: 1 / 2; grid-column: 3 / 4;
            background-color: #ff6347; /* tomato */
        }
        #indicator-e {
            grid-row: 1 / 2; grid-column: 4 / 5;
            background-color: #ff7f50; /* coral */
        }
        #indicator-r {
            grid-row: 1 / 2; grid-column: 7 / 8;
            background-color: #dc143c; /* crimson */
        }

        /* --- GREEN/YELLOW HUES --- */
        #x-density {
            grid-row: 1 / 2; grid-column: 2 / 3;
            background-color: #9acd32; /* yellowgreen */
        }
        #y-density {
            grid-row: 2 / 3; grid-column: 1 / 2;
            background-color: #2e8b57; /* seagreen */
            writing-mode: vertical-rl;
            transform: rotate(180deg);
        }
        #pdf-viewer {
            grid-row: 2 / 3; grid-column: 2 / 3;
            background-color: #98fb98; /* palegreen */
        }
        #x-density-right {
            grid-row: 1 / 2; grid-column: 6 / 7;
            background-color: #ffd700; /* gold */
        }
        #reconstructed {
            grid-row: 2 / 3; grid-column: 6 / 7;
            background-color: #ffffe0; /* lightyellow */
        }
        #y-density-right {
            grid-row: 2 / 3; grid-column: 7 / 8;
            background-color: #f0e68c; /* khaki */
            writing-mode: vertical-rl;
            transform: rotate(180deg);
        }

        /* --- BLUE HUES --- */
        #annotations {
            grid-row: 2 / 3; grid-column: 3 / 5; /* Spans 2 cols */
            background-color: #00ffff; /* cyan */
        }
        #toggles {
            grid-row: 3 / 5; grid-column: 3 / 5; /* Spans 2 rows, 2 cols */
            background-color: #007fff; /* azure */
        }

        /* --- PURPLE HUES --- */
        #options {
            grid-row: 3 / 4; grid-column: 1 / 3; /* Spans 2 cols */
            background-color: #8a2be2; /* blueviolet */
        }
        #options-right {
            grid-row: 3 / 4; grid-column: 6 / 8; /* Spans 2 cols */
            background-color: #9932cc; /* darkorchid */
        }
        
        /* --- ORANGE HUES --- */
        #log {
            grid-row: 4 / 5; grid-column: 1 / 3; /* Spans 2 cols */
            background-color: #ffa500; /* orange */
        }
        #log-right {
            grid-row: 4 / 5; grid-column: 6 / 8; /* Spans 2 cols */
            background-color: #ff8c00; /* darkorange */
        }


        /* --- CENTER DIVIDER --- */
        .center-divider {
            grid-row: 1 / 5; grid-column: 5 / 6; /* Spans all 4 rows */
            background-color: #555;
        }
    </style>
</head>
<body>

    <div class="app-container">
        <div id="indicator-i" class="box">i</div>
        <div id="x-density" class="box dark-text">X-Density</div>
        <div id="indicator-d" class="box">d</div>
        <div id="indicator-e" class="box">e</div>
        <div id="y-density" class="box">Y-Density</div>
        <div id="pdf-viewer" class="box dark-text">PDF Viewer</div>
        <div id="annotations" class="box dark-text">Label Annotations</div>
        <div id="options" class="box">Disassemble Options</div>
        <div id="log" class="box dark-text">Disassemble Log</div>
        <div id="toggles" class="box">Label Toggles</div>

        <div class="center-divider"></div>

        <div id="x-density-right" class="box dark-text">X-Density</div>
        <div id="indicator-r" class="box">r</div>
        <div id="reconstructed" class="box dark-text">Reconstructed</div>
        <div id="y-density-right" class="box dark-text">Y-Density</div>
        <div id="options-right" class="box">Reconstruct Options</div>
        <div id="log-right" class="box dark-text">Reconstruct Log</div>
    </div>

</body>
</html>
```

### Web Interface Requirements

- **Synchronized scrolling**: The vertical scroll bar must scroll both panes simultaneously to maintain alignment between disassembly and reconstruction views
- **Responsive**: The web UI must be responsive to movements.
- **Beautiful**: The PDF render should be crisp and easy to read.