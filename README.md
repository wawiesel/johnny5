# Johnny5 — Document Disassembly and Reassembly Framework

**Johnny5** is a modular Python package for understanding and reconstructing complex documents.

It:
1. **Disassembles** PDFs into Docling's lossless JSON representation.
2. Applies a user-defined, hot-reloadable **fixup** layer for structural corrections.
3. **Reassembles** corrected data into rich formats such as QMD and HTML.
4. Serves an interactive FastAPI web interface (powered by PDF.js) to visualize and debug the process.

---

## 🚀 Installation

```bash
git clone https://github.com/wawiesel/johnny5.git
cd johnny5
pip install -e .
```

Requirements:

* Python ≥ 3.9
* macOS, Linux, or Windows

---

## 🧰 Quick Start

```bash
# Disassemble a document
johnny5 disassemble examples/sample.pdf

# Reassemble corrected output
johnny5 reassemble _cache/lossless_fixed.json

# Start the web viewer
johnny5 web
```

Visit `http://localhost:8000` to explore the PDF structure visually.

---

## 🧠 Features

* Accurate PDF → JSON conversion using **Docling**
* Intelligent region & margin detection
* Hot-reloading fixup scripts
* QMD/HTML reassembly
* Web-based visual comparison of source and reconstructed layouts

---

## 📦 Architecture Overview

| Component         | Role                                          |
| ----------------- | --------------------------------------------- |
| `disassembler.py` | Converts PDF → lossless JSON → corrected JSON |
| `reassembler.py`  | Converts corrected JSON → QMD/HTML            |
| `server.py`       | FastAPI + WebSocket app for visualization     |
| `watcher.py`      | Monitors fixup files and triggers reloads     |
| `utils/`          | Independent helpers (density, margins, etc.)  |

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 📜 License

MIT License © 2025 William Wieselquist