"""Pytest configuration and fixtures for Johnny5 tests"""

import pytest
from pathlib import Path
from fastapi.testclient import TestClient


@pytest.fixture  # type: ignore[misc]
def example_pdf() -> Path:
    """Fixture providing path to the example PDF"""
    pdf_path = Path("examples/01-one_page/01-one_page.pdf")
    if not pdf_path.exists():
        pytest.skip("Example PDF not found")
    return pdf_path


@pytest.fixture  # type: ignore[misc]
def client(example_pdf: Path) -> TestClient:
    """Fixture providing a FastAPI test client for API testing"""
    from johnny5.server import _create_app

    # Create app with example PDF
    app = _create_app(pdf=example_pdf, fixup="johnny5.fixups.example_fixup", color_scheme="dark")

    # Return test client
    return TestClient(app)


def pytest_configure(config: pytest.Config) -> None:
    """Register custom markers"""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
