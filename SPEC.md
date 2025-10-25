# Johnny5 Specification

## 1. Scope

Johnny5 provides a reproducible, pluggable environment for document disassembly and reassembly.

### Core Requirements
1. **Disassemble PDFs** into a structured, lossless JSON using Docling.
2. **Apply fixups** dynamically with hot reload.
3. **Reassemble outputs** into QMD and HTML representations.
4. **Provide a web interface** for inspection and debugging.

---

## 2. Functional Specification

### CLI Commands
| Command | Description | Output |
|----------|--------------|---------|
| `johnny5 disassemble <pdf>` | Parse a PDF into `_cache/lossless.json`. | Lossless JSON |
| `johnny5 reassemble <json>` | Convert corrected JSON into QMD + HTML. | `_cache/output.qmd`, `_cache/output.html` |
| `johnny5 web` | Launch the FastAPI web viewer. | Runs on `localhost:8000` |

### Web Application
- Serves rendered PDF alongside annotations.
- Displays cluster bounding boxes and text regions.
- Shows X/Y density plots for page analysis.
- Reloads automatically when fixups change.

---

## 3. Data Specification

### Lossless JSON Structure
```json
{
  "pages": [
    {
      "size": {"width": float, "height": float},
      "predictions": {
        "layout": {
          "clusters": [
            {
              "label": "section_header",
              "bbox": {"l": float, "t": float, "r": float, "b": float},
              "text": "string"
            }
          ]
        }
      }
    }
  ]
}
```

### Fixup Function Contract

```python
def fixup(ctx: FixupContext) -> Union[None, str, dict, list[dict]]:
    ...
```

---

## 4. Non-Functional Requirements

* 100% reproducibility for disassembly given same input.
* Deterministic output ordering.
* Hot-reload latency < 2 s.
* Web UI must remain responsive during background reloads.
* All commits must be signed and verified.

---

## 5. Future Extensions

* Support for OCR via Tesseract.
* Additional output formats (Markdown, LaTeX).
* Interactive fixup editor in the web UI.
