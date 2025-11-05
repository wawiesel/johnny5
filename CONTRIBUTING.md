# Contributing to Johnny5

All contributors (humans and automation) must follow the same standards.

---

## 🧩 Coding Standards

- Python ≥ 3.9  
- 100-character line limit (Black + Ruff)
- 50-line function limit
- Full type hints required  
- Use `pathlib.Path`, not raw strings  
- Use `logging`, not `print()`  
- No mutable globals  
- Be DRY. Please. I'm begging you.

---

## 🧪 Testing

- Framework: **pytest**  
- Tests mirror the module structure.

### Running Tests

```bash
pytest                    # Run all tests
pytest -v                 # Verbose output
pytest tests/test_basic.py # Run specific test file
```  

## 🔧 Development Setup

### Virtual Environment

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -e .
```

### Pre-commit Hooks

```bash
pip install pre-commit
pre-commit install
```

This will run `ruff check`, `ruff-format`, and `mypy` on every commit.

The pre-commit hooks will also validate example README files by running the commands they contain to ensure they work correctly.

**Note**: Some commands may modify files (like generating PDFs), but the hook handles this appropriately to avoid git conflicts.


---

## 🧭 Development Workflow

1. Create a new branch (`feat/`, `fix/`, or `refactor/`).
2. Make changes following the module boundaries.
3. Ensure lint, format, and tests pass.
4. Commit with [Conventional Commits](https://www.conventionalcommits.org/).
5. Push and open a PR into `main`.
6. Wait for review of the PR.
7. Note: all commits must be signed.

---

## 🌐 FastAPI Guidelines

* Use async endpoints.
* Externalize HTML/JS/CSS assets to `web/static` or `web/templates`.
* Prefer composition and helpers in `utils/` over large functions.

---

## 🎨 Frontend (CSS/JavaScript) Guidelines

### CSS Z-Index
* **All z-index values must be in CSS only** - never set z-index in JavaScript.
* Use a consistent hierarchy:
  * `1-2`: Base layers (PDF pages, density charts, grids)
  * `3-5`: Annotations and connection lines
  * `8-10`: UI panels and controls
  * `100+`: Interactive elements (buttons, overlays)
  * `1000+`: Selected/hovered annotations
  * `10000+`: Top-level UI overlays (controls, navigation)

### CSS Colors
* **All colors must use CSS variables** - no hardcoded colors (no `#000000`, `grey`, `rgb()`, etc.).
* **CSS variables are mandatory** - do not provide fallback defaults (use `var(--surface-1)`, not `var(--surface-1, #000000)`).
* All color values must be defined in `web/static/css/color/*.css` theme files.

### CSS vs JavaScript
* **Static styles belong in CSS** - only dynamic values (calculated from measurements, positions, etc.) should be set in JavaScript.
* Examples:
  * ✅ CSS: `position: absolute; top: 0; pointer-events: none;`
  * ✅ JavaScript: `canvas.style.left = \`${pageLeftInRow}px\`;` (dynamic position)
  * ❌ JavaScript: `canvas.style.position = 'absolute';` (static, should be in CSS)

---

## ✅ Summary

All code, whether by humans or automation, must:

* Follow these standards.
* Include tests.
* Pass CI.