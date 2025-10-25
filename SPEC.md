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

| Type | Description | File Name | Purpose |
|------|-------------|-----------|---------|
| **Structure** | Docling lossless JSON structure | `structure.json` | Raw document structure from Docling |
| **Fixed Structure** | Corrected structure after fixup | `fstructure.json` | Structure with layout model corrections applied |
| **Content** | Extracted pure content description | `content.json` | Simplified content representation |
| **Markdown** | Content rendered as text format | `content.qmd` | Human-readable text output |
| **HTML** | Content rendered for viewing | `content.html` | Web-viewable format |

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

Examples:
- `~/.jny5/cache/structure/a1b2c3d4e5f6g7h8.json` (raw Docling output)
- `~/.jny5/cache/structure/b2c3d4e5f6g7h8i9.json` (fixed structure, same dir as raw)
- `~/.jny5/cache/content/c3d4e5f6g7h8i9j0.json`
- `~/.jny5/cache/qmd/d4e5f6g7h8i9j0k1.qmd`

**Note**: When fixup is null/empty, structure and fstructure cache keys are identical, storing the same file.


#### Cache Key Emission

Every command outputs its generated cache key to stdout for chaining:

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

```
┌────────────────────────────────────────────────────────────────────────┐
│                           Johnny5 Web Interface                        │
│                                                                        │
│ ┌────────────────────────────── ┐ # ┌──────────────────────────────┐   │
│ │      DISASSEMBLY (Left)       │ # │     RECONSTRUCTION (Right)   │   │
│ │ ┌───────────────────────────┐ │ # │ ┌──────────────────────────┐ │   │
│ │ │  d  |     X-Density   | p │ │ # │ │       X-Density    | q   │ │   │
│ │ ├─────┬─────────────────┬───┤ │ # │ ├──────────────────────────┤ │   │
│ │ │     │                 │   │ │ # │ │                    |     │ │   │
│ │ │ Y-  │   Annotated     │An-│ │ # │ │ Reconstructed       |  Y- │ │   │
│ │ │ Den │     PDF +       │not│ │ # │ │ Content            | Den │ │   │
│ │ │ sity│   Toggleable    │at-│ │ # │ │ [JSON|QMD|HTML]    │ sity│ │   │
│ │ │     │   Bounding      │ion│ │ # │ │                    │     │ │   │
│ │ │     │     Boxes       │s  │ │ # │ │                    │     │ │   │
│ │ │     │                 │   │ │ # │ │                    │     │ │   │
│ │ ├─────┴─────────────────┴───┤ │ # │ ├──────────────────────────┤ │   │
│ │ │    Disassembly Log        │ │ # │ │    Reconstruction Log    │ │   │
│ │ │    (Terminal Output)      │ │ # │ │    (Terminal Output)     │ │   │
│ │ └───────────────────────────┘ │ # │ └──────────────────────────┘ │   │
│ └────────────────────────────── ┘ # └──────────────────────────────┘   │
│                      ↑ Shared vertical scroll bar ↓                    │
└────────────────────────────────────────────────────────────────────────┘
```

**Image Indicators:**

- **d**: Original document image - changes when the underlying PDF changes or Docling processing options change
- **p**: Fixup JSON image - represents the content of the fixup JSON (if d==p, no fixups are needed)
- **q**: Content JSON image - represents the content of the content.json

### Web Interface Requirements

- **Synchronized scrolling**: The vertical scroll bar must scroll both panes simultaneously to maintain alignment between disassembly and reconstruction views
- **Responsive**: The web UI must be responsive to movements.
- **Beautiful**: The PDF render should be crisp and easy to read.