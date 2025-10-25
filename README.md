# Johnny5 — Document Disassembly and Reassembly Framework

**Johnny5** is a modular Python package for understanding and reconstructing complex documents.

It:
1. **Disassembles** PDFs into Docling's lossless JSON representation.
2. Applies a user-defined, hot-reloadable **fixup** layer for structural corrections.
3. **Reconstructs** corrected data into rich formats such as QMD and HTML.
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
# Open the web viewer with a PDF
jny5 view examples/sample.pdf

# Or run the full pipeline manually
jny5 disassemble examples/sample.pdf --fixup fixup.py
jny5 extract extract.py --from-cache <cache-key>
jny5 reconstruct reconstruct.py --from-cache <cache-key>
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