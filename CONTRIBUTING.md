# Contributing to Johnny5

Thank you for your interest in contributing to Johnny5! This document provides guidelines for contributing to the project.

## Development Setup

### Prerequisites
- Python 3.9 or higher
- Git

### Installation
```bash
# Clone the repository
git clone https://github.com/ww5/johnny5.git
cd johnny5

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install in development mode
pip install -e .

# Install development dependencies
pip install hatch ruff black mypy pytest pre-commit
```

### Pre-commit Hooks
```bash
# Install pre-commit hooks
pre-commit install

# Run manually
pre-commit run --all-files
```

## Code Style

### Formatting
- Use **Black** for code formatting (100 character line limit)
- Use **Ruff** for linting
- Follow **PEP 8** conventions

### Type Hints
- All public functions must have type annotations
- Use `pathlib.Path` instead of raw strings for file paths
- Import types from `typing` module when needed

### Documentation
- Add docstrings to all public functions and classes
- Use Google-style docstrings
- Include type information in docstrings

### Testing
- Write tests using **pytest**
- Place tests in the `tests/` directory
- Aim for good test coverage
- Use descriptive test names

## Development Workflow

### Branching
- Create feature branches with prefixes:
  - `feat/` for new features
  - `fix/` for bug fixes
  - `refactor/` for code refactoring
  - `docs/` for documentation updates

### Commits
- Use conventional commit messages:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation
  - `test:` for tests
  - `refactor:` for refactoring
  - `chore:` for maintenance

### Pull Requests
- All PRs must pass CI checks (linting, formatting, tests)
- Include a clear description of changes
- Reference any related issues
- Ensure tests pass locally before submitting

## Project Structure

```
johnny5/
├── src/johnny5/          # Main package
│   ├── cli.py            # CLI interface
│   ├── decomposer.py     # PDF decomposition
│   ├── recomposer.py     # Document recomposition
│   ├── server.py         # Web server
│   ├── utils/            # Utility modules
│   ├── fixups/           # Fixup scripts
│   └── web/              # Web interface
├── tests/                # Test suite
├── .github/workflows/    # CI/CD
└── docs/                 # Documentation
```

## Architecture Guidelines

### Module Responsibilities
- **cli.py**: CLI entrypoint, delegates to other modules
- **decomposer.py**: PDF → JSON conversion using Docling
- **recomposer.py**: JSON → QMD/HTML conversion
- **server.py**: FastAPI web application
- **utils/**: Shared utility functions
- **fixups/**: User-defined document processing scripts

### File Organization
- Keep modules focused on single responsibilities
- Use composition over inheritance
- Avoid global mutable state
- Use structured logging instead of print statements

## Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=johnny5

# Run specific test file
pytest tests/test_decomposer.py

# Run with verbose output
pytest -v
```

## Building and Packaging

```bash
# Build package
hatch build

# Check package
hatch check

# Run linting
ruff check .

# Format code
black .
```

## Questions?

If you have questions about contributing, please:
1. Check existing issues and discussions
2. Open a new issue with the "question" label
3. Join our community discussions

Thank you for contributing to Johnny5! 🚀
