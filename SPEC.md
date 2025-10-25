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
jny5 disassemble <pdf> -f <fixup.py>

# creates cached "structure.json" (detailed structure without fixup)
# "fstructure.json" (detailed structure with fixup)
```

```
jny5 extract fstructure.json -e <extract.py> 
# extract.py turns "fstructure.json" into "content.json"
```

```
jny5 reassemble content.json -e <assm.py>
# assm.py turns "content.json" into content.qmd
```

```
jny5 view content.qmd
# views qmd as HTML
```

### Web Application

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Johnny5 Web Interface                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌──────────────────────────────┐│┌──────────────────────────────┐            │
│ │      DISASSEMBLY (Left)      │││     RECONSTRUCTION (Right)   │            │
│ │ ┌───────────────────────────┐│││ ┌──────────────────────────┐ │            │
│ │ │  d  |X-Density Banner | p ││││ │ X-Density Banner   | q   │ │            │
│ │ ├─────┬─────────────────┬───┤│││ ├──────────────────────────┤ │            │
│ │ │     │                 │   ││││ │ [ QMD | HTML ] Tabs|     │ │            │
│ │ │ Y-  │   Annotated     │An-││││ │ Reassembled Output |  Y  │ │            │
│ │ │ Den │     PDF +       │not││││ │                    |  d  │ │            │
│ │ │ sity│   Toggleable    │at-││││ │                    |  e  │ │            │
│ │ │     │   Bounding      │ion││││ │                    |  n  │ │            │
│ │ │     │     Boxes       │s  ││││ │                    |  s  │ │            │
│ │ │     │                 │   ││││ │                    |     │ │            │
│ │ ├─────┴─────────────────┴───┤│││ ├──────────────────────────┤ │            │
│ │ │    Disassembly Log        ││││ │    Reconstruction L|     │ │            │
│ │ │    (Terminal Output)      ││││ │    Log             |     │ │            │
│ │ └───────────────────────────┘│││ └──────────────────────────┘ │            │
│ └──────────────────────────────┘│└──────────────────────────────┘            │
│                      ↑ Shared vertical scroll bar ↓                          │
└──────────────────────────────────────────────────────────────────────────────┘
```
