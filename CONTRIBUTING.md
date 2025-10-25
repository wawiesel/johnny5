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

---

## 🧪 Testing
- Framework: **pytest**  
- Tests mirror the module structure.  

Install hooks for development that run these pre-commit.

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
6. All commits must be signed.

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