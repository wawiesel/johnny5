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

The pre-commit hooks will also validate things like validity of examples and documentation.


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

## ✅ Summary

All code, whether by humans or automation, must:

* Follow these standards.
* Include tests.
* Pass CI.