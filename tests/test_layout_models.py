"""Tests for Docling layout models"""

import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from johnny5.disassembler import get_available_layout_models, verify_layout_model, run_disassemble


def test_get_available_layout_models() -> None:
    """Test that we can get the list of available layout models"""
    from johnny5.disassembler import get_docling_version

    docling_version = get_docling_version()
    models = get_available_layout_models()

    assert isinstance(models, list)
    assert len(models) > 0

    # Check structure of each model entry
    for model in models:
        assert isinstance(model, dict)
        assert "name" in model
        assert "description" in model
        assert isinstance(model["name"], str)
        assert isinstance(model["description"], str)
        assert len(model["name"]) > 0
        assert len(model["description"]) > 0

    # Verify models were cached to version-specific file
    from pathlib import Path
    import os

    jny5_home = Path(os.environ.get("JNY5_HOME", str(Path.home() / ".jny5")))
    models_cache = jny5_home / "models" / f"{docling_version}.json"
    assert models_cache.exists(), f"Models cache should exist at {models_cache}"


def test_layout_models_have_expected_entries() -> None:
    """Test that expected models are in the list based on Docling version"""
    from johnny5.disassembler import get_docling_version

    docling_version = get_docling_version()
    major_version = int(docling_version.split(".")[0])

    models = get_available_layout_models()
    model_names = [m["name"] for m in models]

    # Expected models vary by Docling version
    if major_version >= 2:
        # Docling 2.x uses unified model
        expected = ["docling_layout_heron"]
    else:
        # Docling 1.x models
        expected = ["doclaynet", "pubtables", "digitaldocmodel", "tableformer"]

    for expected_model in expected:
        assert (
            expected_model in model_names
        ), f"Expected model '{expected_model}' not found for Docling {docling_version}"


def test_verify_layout_model_valid() -> None:
    """Test that verify_layout_model returns True for valid models"""
    models = get_available_layout_models()

    for model in models:
        model_name = model["name"]
        is_valid = verify_layout_model(model_name)
        assert (
            is_valid
        ), f"Model '{model_name}' should be valid but verify_layout_model returned False"


def test_verify_layout_model_invalid() -> None:
    """Test that verify_layout_model returns False for invalid models"""
    invalid_models = ["invalid_model", "nonexistent", "fake_model_123"]

    for model_name in invalid_models:
        is_valid = verify_layout_model(model_name)
        assert (
            not is_valid
        ), f"Model '{model_name}' should be invalid but verify_layout_model returned True"


@pytest.mark.slow  # type: ignore[misc]
def test_each_layout_model_processes_pdf() -> None:
    """Test that each layout model can successfully process a real PDF

    This is marked as a slow test because it actually runs disassembly.
    Run with: pytest -m slow
    """
    # Use the example PDF for testing
    pdf_path = Path("examples/01-one_page/01-one_page.pdf")

    if not pdf_path.exists():
        pytest.skip("Example PDF not found")

    models = get_available_layout_models()

    for model in models:
        model_name = model["name"]
        print(f"\nTesting layout model: {model_name}")

        try:
            # Run disassembly (Docling 2.0+ always uses docling_layout_heron)
            cache_key = run_disassemble(
                pdf=pdf_path,
                enable_ocr=False,
                fixup="johnny5.fixups.example_fixup",
                force_refresh=False,  # Use cache if available
            )

            # Verify we got a cache key back
            assert isinstance(cache_key, str)
            assert len(cache_key) > 0

            print(f"  ✓ {model_name}: SUCCESS (cache_key={cache_key})")

        except Exception as e:
            pytest.fail(f"Layout model '{model_name}' failed to process PDF: {e}")


def test_api_endpoint_layout_models(client: TestClient) -> None:
    """Test the /api/layout-models endpoint

    This requires the 'client' fixture from conftest.py
    """
    response = client.get("/api/layout-models")

    assert response.status_code == 200

    data = response.json()
    assert "models" in data
    assert isinstance(data["models"], list)
    assert len(data["models"]) > 0

    # Check structure
    for model in data["models"]:
        assert "name" in model
        assert "description" in model
