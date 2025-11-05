"""Tests for Docling layout models"""

import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from johnny5.disassembler import get_available_layout_models, verify_layout_model, run_disassemble


def test_get_available_layout_models() -> None:
    """Test that we can get the list of available layout models"""
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


def test_layout_models_have_expected_entries() -> None:
    """Test that expected models are in the list"""
    models = get_available_layout_models()
    model_names = [m["name"] for m in models]

    # Expected models based on Docling documentation
    expected = ["doclaynet", "pubtables", "digitaldocmodel", "tableformer"]

    for expected_model in expected:
        assert expected_model in model_names, f"Expected model '{expected_model}' not found"


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
            # Run disassembly with this model
            cache_key = run_disassemble(
                pdf=pdf_path,
                layout_model=model_name,
                enable_ocr=False,
                json_dpi=72,  # Use lower DPI for faster testing
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
