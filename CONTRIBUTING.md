# Contributing to Johnny5

All contributors (humans and automation) must follow the same standards.

---

## 🧱 Repository Layout

```
src/johnny5/
├── cli.py
├── disassembler.py
├── reassembler.py
├── server.py
├── watcher.py
├── utils/
│   ├── density.py
│   ├── margins.py
│   └── fixup_context.py
├── fixups/
│   └── example_fixup.py
└── tests/
```

---

## 🧩 Coding Standards
- Python ≥ 3.9  
- 100-character line limit (Black + Ruff)  
- Full type hints required  
- Use `pathlib.Path`, not raw strings  
- Use `logging`, not `print()`  
- No mutable globals except explicit `_cache`  
- Public functions must have complete docstrings (Args, Returns, Raises)

---

## 🧪 Testing
- Framework: **pytest**  
- Tests mirror the module structure.  
- Fixtures live in `tests/fixtures/`.  
- Each new function/class must include at least one test.

Run before committing:
```bash
ruff check .
black --check .
pytest
```

---

## 🧭 Development Workflow

1. Create a new branch (`feat/`, `fix/`, or `refactor/`).
2. Make changes following the module boundaries.
3. Ensure lint, format, and tests pass.
4. Commit with [Conventional Commits](https://www.conventionalcommits.org/).
5. Push and open a PR into `main`.
6. All commits must be signed (SSH or GPG).

---

## 🌐 FastAPI Guidelines

* Use async endpoints.
* Externalize HTML/JS/CSS assets to `web/static` or `web/templates`.
* Prefer composition and helpers in `utils/` over large functions.

---

## ✅ Summary

All code, whether by humans or automation, must:

* Follow these standards.
* Include tests.
* Pass CI.