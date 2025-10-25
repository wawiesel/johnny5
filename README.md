# Johnny5 — Document Disassembly and Reassembly Framework

**Johnny5** is a modular Python package for understanding and reconstructing complex documents.

> **⚠️ Alpha Software**: This is early-stage software. Expect breaking changes and rough edges.

1. **Disassembles** PDFs into Docling's lossless JSON representation.
2. Applies a user-defined, hot-reloadable **fixup** layer for structural corrections.
3. **Extracts** data hidden in structure to a content-only JSON of the user's preference.
4. Reconstructs rich formats such as QMD.
5. Serves an interactive FastAPI web interface (powered by PDF.js) to visualize and debug the process.

---

## 🚀 Installation

```bash
git clone https://github.com/wawiesel/johnny5.git
cd johnny5
pip install -e .
```

---

## 🧰 Quick Start

```bash
jny5 view examples/sample.pdf
# starts web server and renders left pane deconstruction only
```

```bash
cd examples/
jny5 view sample.pdf --fixup fixup.py --extract extract.py --reconstruct reconstruct.py
# renders full reconstruction pipeline
```
 
Visit `http://localhost:8000` to explore the PDF structure visually.

---

## 🧠 Features

* Accurate PDF → JSON conversion using **Docling**
* Intelligent region & margin detection
* Hot-reloading fixup scripts
* QMD/HTML reconstruction
* Web-based visual comparison of source and reconstructed layouts

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 📜 License

MIT License © 2025 William Wieselquist