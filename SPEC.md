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

```
jny5 disassemble <pdf> --fixup <fixup.py>

# creates cached "_cache/structure.json" (detailed structure without fixup)
# "_cache/fstructure.json" (detailed structure with fixup)
```

```
jny5 extract _cache/fstructure.json --extract <extract.py> 
# extract.py turns "_cache/fstructure.json" into "_cache/content.json"
```

```
jny5 reassemble _cache/content.json --assemble <assm.py>
# assm.py turns "_cache/content.json" into "_cache/content.qmd"
```

```
jny5 view _cache/content.qmd
# views qmd as HTML
```

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

| Stage       | Input           | Output          | File                     |
| ----------- | --------------- | --------------- | ------------------------ |
| Disassemble | PDF             | structure.json  | `_cache/structure.json`  |
| Fixup       | structure.json  | fstructure.json | `_cache/fstructure.json` |
| Extract     | fstructure.json | content.json    | `_cache/content.json`    |
| Reassemble  | content.json    | content.qmd     | `_cache/content.qmd`     |

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

---

## 6. Future Extensions

* Support for OCR via Tesseract.
* Additional output formats (Markdown, LaTeX).
* Interactive fixup editor in the web UI.