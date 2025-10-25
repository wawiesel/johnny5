# Johnny5 Specification

## 1. Scope

Johnny5 provides a reproducible, pluggable environment for document disassembly and reassembly.

### Core Requirements

1. **Disassemble PDFs** into a structured, lossless JSON using Docling.
2. **Apply a python code fixup** for aided disassembly with hot reload.
3. **Define a python code extraction spec** for aided extraction to a content JSON with hot reload.
4. **Define a python code assembler spec** for creation of a text document from that JSON only.
5. **Provide a web interface** for inspection and debugging.

---

## 2. Functional Specification

### CLI Commands

```bash
jny5 disassemble <pdf> --fixup <fixup.py>
# Outputs cache key: a1b2c3d4e5f6g7h8
# Creates: _cache/structure/a1b2c3d4e5f6g7h8.json (raw)
#          _cache/structure/b2c3d4e5f6g7h8i9.json (fixed)
```

```bash
jny5 extract --extract <extract.py> --from-cache b2c3d4e5f6g7h8i9
# Uses: _cache/structure/b2c3d4e5f6g7h8i9.json
# Outputs cache key: c3d4e5f6g7h8i9j0
# Creates: _cache/content/c3d4e5f6g7h8i9j0.json
```

```bash
jny5 reassemble --assemble <assm.py> --from-cache c3d4e5f6g7h8i9j0
# Uses: _cache/content/c3d4e5f6g7h8i9j0.json
# Outputs cache key: d4e5f6g7h8i9j0k1
# Creates: _cache/qmd/d4e5f6g7h8i9j0k1.qmd
```

```bash
jny5 view --from-cache d4e5f6g7h8i9j0k1
# Uses: _cache/qmd/d4e5f6g7h8i9j0k1.qmd
# Views as HTML
```

### Content-Based Caching System

Johnny5 uses a sophisticated content-based caching system where inputs are checksummed to generate cache keys, and outputs are stored with filenames equal to those cache keys.

#### Cache Key Generation

Each stage generates a cache key by checksumming all relevant inputs. The cache key is a 16-character SHA-256 hash derived from the sorted JSON representation of all input content.

#### Cache Key Sources by Stage

| Stage         | Cache Key Sources                    | Example Key      |
|---------------|--------------------------------------|------------------|
| **Disassemble** | PDF content + Docling options        | `a1b2c3d4e5f6g7h8` |
| **Fixup**       | structure.json content + fixup.py content | `b2c3d4e5f6g7h8i9` |
| **Extract**     | fstructure.json content + extract.py content | `c3d4e5f6g7h8i9j0` |
| **Reassemble**  | content.json content + assemble.py content | `d4e5f6g7h8i9j0k1` |

#### Cache File Naming

All cache files use subdirectories with consistent naming: `_cache/{stage}/{cache_key}.{ext}`

Examples:
- `_cache/structure/a1b2c3d4e5f6g7h8.json` (raw Docling output)
- `_cache/structure/b2c3d4e5f6g7h8i9.json` (fixed structure, same dir as raw)
- `_cache/content/c3d4e5f6g7h8i9j0.json`
- `_cache/qmd/d4e5f6g7h8i9j0k1.qmd`

**Note**: When fixup is null/empty, structure and fstructure cache keys are identical, storing the same file.

#### Updated CLI Commands

```
jny5 disassemble <pdf> --fixup <fixup.py>
# Outputs cache key: a1b2c3d4e5f6g7h8
# Creates: _cache/structure/a1b2c3d4e5f6g7h8.json (raw)
#          _cache/structure/b2c3d4e5f6g7h8i9.json (fixed)
```

```
jny5 extract --extract <extract.py> --from-cache b2c3d4e5f6g7h8i9
# Uses: _cache/structure/b2c3d4e5f6g7h8i9.json
# Outputs cache key: c3d4e5f6g7h8i9j0
# Creates: _cache/content/c3d4e5f6g7h8i9j0.json
```

```
jny5 reassemble --assemble <assm.py> --from-cache c3d4e5f6g7h8i9j0
# Uses: _cache/content/c3d4e5f6g7h8i9j0.json
# Outputs cache key: d4e5f6g7h8i9j0k1
# Creates: _cache/qmd/d4e5f6g7h8i9j0k1.qmd
```

```
jny5 view --from-cache d4e5f6g7h8i9j0k1
# Uses: _cache/qmd/d4e5f6g7h8i9j0k1.qmd
# Views as HTML
```

#### Cache Key Emission

Every command outputs its generated cache key to stdout for chaining:

```bash
# Example workflow
STRUCTURE_KEY=$(jny5 disassemble document.pdf --fixup fixup.py)
FSTRUCTURE_KEY=$(jny5 extract --extract extract.py --from-cache $STRUCTURE_KEY)
CONTENT_KEY=$(jny5 reassemble --assemble assemble.py --from-cache $FSTRUCTURE_KEY)
jny5 view --from-cache $CONTENT_KEY
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

# assm.py
def assemble(content: dict) -> str:
    """Return reassembled text (QMD)."""
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
│ │ │ Y-  │   Annotated     │An-│ │ # │ │ Reassembled        |  Y- │ │   │
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

```
d: is an image that represents the content of the original document, it changes when the underlying PDF changes or if the Docling processing options change
p: is an image that represents the content of the fixup JSON (if d==p no fixups are needed)
q: is an image that represents the content of the content.json
```

### Web Interface Interactions

- **Shared scroll synchronization**: The vertical scroll bar synchronizes page index and density plots between both panes
- **Hot reload propagation**: WebSocket events (`{"type":"reload","page":n}`) trigger updates in PDF pane and logs when fixup modules change
- **Real-time feedback**: All processing stages show live terminal output in their respective log areas

---

## 3. Data Artifacts

| Stage       | Input Sources    | Cache Key Sources                    | Output Files                        | Cache Key Output |
|-------------|------------------|--------------------------------------|-------------------------------------|------------------|
| Disassemble | PDF file         | PDF content + Docling options        | `_cache/structure/{key}.json` (raw)<br>`_cache/structure/{key}.json` (fixed) | `a1b2c3d4e5f6g7h8` |
| Fixup       | structure cache  | structure.json + fixup.py            | `_cache/structure/{key}.json`       | `b2c3d4e5f6g7h8i9` |
| Extract     | structure cache  | fstructure.json + extract.py        | `_cache/content/{key}.json`         | `c3d4e5f6g7h8i9j0` |
| Reassemble  | content cache    | content.json + assemble.py           | `_cache/qmd/{key}.qmd`              | `d4e5f6g7h8i9j0k1` |

### Cache Key Flow

```
PDF → [a1b2c3d4e5f6g7h8] → structure.json + fixup.py → [b2c3d4e5f6g7h8i9] → fstructure.json + extract.py → [c3d4e5f6g7h8i9j0] → content.json + assemble.py → [d4e5f6g7h8i9j0k1] → qmd
```

---

## 4. Error Handling

All stages must raise a subclass of `Johnny5Error` with structured error information:

```python
class Johnny5Error(Exception):
    def __init__(self, code: str, message: str, detail: dict = None):
        self.code = code
        self.message = message
        self.detail = detail or {}
```

This ensures consistent error reporting for both CLI and web interfaces.

---

## 5. Testing and Automation

### Golden Fixtures

Minimal test fixtures for pipeline validation:
- `fixtures/sample.pdf` - Test input document
- `fixtures/expected_structure.json` - Expected Docling output
- `fixtures/expected_content.json` - Expected extraction output
- `fixtures/expected_content.qmd` - Expected reassembly output

### CI Requirements

All commands must be callable non-interactively for CI testing:
- Each stage must exit 0 if successful
- Artifact paths must be written to stdout
- No interactive prompts or user input required
- Deterministic output for given inputs
