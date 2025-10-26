"""Tests for density calculation utilities

This module tests the density calculation functions in johnny5.utils.density.
"""

from johnny5.utils.density import (
    compute_horizontal_density,
    compute_vertical_density,
    compute_density_arrays,
    calculate_document_resolution,
)


def test_compute_horizontal_density_empty() -> None:
    """Test horizontal density with no elements."""
    result = compute_horizontal_density([])
    assert result == {"left": 0.0, "center": 0.0, "right": 0.0}


def test_compute_horizontal_density_left() -> None:
    """Test horizontal density with elements on the left."""
    elements = [
        {"bbox": [0, 0, 100, 50]},
        {"bbox": [10, 10, 80, 40]},
        {"bbox": [50, 20, 150, 70]},
    ]
    # Assuming page width is 612 (standard letter width in points)
    result = compute_horizontal_density(elements)
    assert result["left"] > 0


def test_compute_vertical_density_empty() -> None:
    """Test vertical density with no elements."""
    result = compute_vertical_density([])
    assert result == {"top": 0.0, "middle": 0.0, "bottom": 0.0}


def test_compute_vertical_density_top() -> None:
    """Test vertical density with elements at the top."""
    elements = [
        {"bbox": [0, 0, 100, 50]},
        {"bbox": [10, 10, 80, 40]},
        {"bbox": [50, 20, 150, 70]},
    ]
    # Assuming page height is 792 (standard letter height in points)
    result = compute_vertical_density(elements)
    assert result["top"] > 0


def test_compute_density_arrays_empty() -> None:
    """Test density arrays with no elements."""
    x_array, y_array = compute_density_arrays([], 612.0, 792.0, resolution=50)
    # Returns empty arrays when no elements
    assert len(x_array) == 0
    assert len(y_array) == 0


def test_compute_density_arrays_basic() -> None:
    """Test density arrays with simple elements."""
    elements = [
        {"bbox": [0, 0, 100, 50]},
        {"bbox": [200, 50, 400, 100]},
    ]
    x_array, y_array = compute_density_arrays(elements, 612.0, 792.0, resolution=50)

    assert len(x_array) == 50
    assert len(y_array) == 50
    assert sum(x_array) > 0
    assert sum(y_array) > 0


def test_compute_density_arrays_full_page() -> None:
    """Test density arrays with element spanning full page."""
    elements = [
        {"bbox": [0, 0, 612, 792]},  # Full page element
    ]
    x_array, y_array = compute_density_arrays(elements, 612.0, 792.0, resolution=50)

    # Each bin should have at least 1 count
    assert all(v >= 1 for v in x_array)
    assert all(v >= 1 for v in y_array)


def test_compute_density_arrays_auto_resolution() -> None:
    """Test density arrays with auto-calculated resolution."""
    elements = [
        {"bbox": [50, 50, 150, 100]},
        {"bbox": [200, 200, 300, 250]},
    ]
    x_array, y_array = compute_density_arrays(elements, 612.0, 792.0, resolution=72)

    # Resolution should be calculated
    assert len(x_array) > 0
    assert len(y_array) > 0
    assert len(x_array) <= 200  # Should respect reasonable bounds


def test_calculate_document_resolution_empty() -> None:
    """Test resolution calculation with no pages."""
    pages: list[dict[str, list[dict[str, list[float]]]]] = []
    resolution = calculate_document_resolution(pages)
    assert resolution == 50  # Default


def test_calculate_document_resolution_basic() -> None:
    """Test resolution calculation with sample pages."""
    pages = [
        {
            "elements": [
                {"bbox": [0, 0, 100, 50]},
                {"bbox": [50, 100, 150, 150]},
            ]
        },
        {
            "elements": [
                {"bbox": [0, 0, 200, 100]},
            ]
        },
    ]
    resolution = calculate_document_resolution(pages)
    assert 10 <= resolution <= 200  # Should be within reasonable bounds


def test_calculate_document_resolution_with_empty_elements() -> None:
    """Test resolution calculation when some elements have invalid bboxes."""
    pages = [
        {
            "elements": [
                {"bbox": [0, 0, 100, 50]},
                {"bbox": []},  # Invalid bbox
                {"bbox": [50, 50, 50, 50]},  # Zero size
            ]
        },
    ]
    resolution = calculate_document_resolution(pages)
    assert resolution > 0


def test_density_arrays_normalization() -> None:
    """Test that density arrays properly normalize coordinates."""
    elements = [
        {"bbox": [100, 100, 200, 150]},  # In the middle region
    ]
    x_array, y_array = compute_density_arrays(elements, 612.0, 792.0, resolution=100)

    # Values should be normalized to [0, 1]
    assert sum(x_array) > 0
    assert sum(y_array) > 0


def test_density_arrays_edge_cases() -> None:
    """Test density arrays with edge cases."""
    # Element at exact edges
    elements = [
        {"bbox": [0, 0, 612, 792]},  # Full page
    ]
    x_array, y_array = compute_density_arrays(elements, 612.0, 792.0, resolution=50)

    # First and last bins should have values
    assert x_array[0] > 0
    assert y_array[0] > 0


def test_density_arrays_out_of_bounds() -> None:
    """Test density arrays with coordinates outside page bounds."""
    elements = [
        {"bbox": [-10, -10, 700, 800]},  # Out of bounds
    ]
    x_array, y_array = compute_density_arrays(elements, 612.0, 792.0, resolution=50)

    # Should clamp to page bounds
    assert all(v >= 0 for v in x_array)
    assert all(v >= 0 for v in y_array)


def test_compute_density_arrays_different_resolutions() -> None:
    """Test density arrays with different resolutions."""
    elements = [
        {"bbox": [50, 50, 150, 100]},
    ]

    x_array_10, y_array_10 = compute_density_arrays(elements, 612.0, 792.0, resolution=10)
    x_array_100, y_array_100 = compute_density_arrays(elements, 612.0, 792.0, resolution=100)

    assert len(x_array_10) == 10
    assert len(y_array_10) == 10
    assert len(x_array_100) == 100
    assert len(y_array_100) == 100

    # Higher resolution should have more granular data
    assert len(x_array_100) > len(x_array_10)
