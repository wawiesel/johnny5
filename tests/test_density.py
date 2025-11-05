"""Tests for density calculation utilities

This module tests the density calculation functions in johnny5.utils.density.
"""

from johnny5.utils.density import calculate_density


def test_calculate_density_empty() -> None:
    """Test density calculation with no elements."""
    x_profile = calculate_density([], 612.0, 792.0, "x")
    y_profile = calculate_density([], 612.0, 792.0, "y")
    assert x_profile == []
    assert y_profile == []


def test_calculate_density_basic() -> None:
    """Test density calculation with simple elements."""
    elements = [
        {"bbox": [0, 0, 100, 50]},
        {"bbox": [200, 50, 400, 100]},
    ]
    x_profile = calculate_density(elements, 612.0, 792.0, "x")
    y_profile = calculate_density(elements, 612.0, 792.0, "y")

    assert len(x_profile) > 0
    assert len(y_profile) > 0
    assert all(0.0 <= density <= 1.0 for _, density in x_profile)
    assert all(0.0 <= density <= 1.0 for _, density in y_profile)


def test_calculate_density_full_page() -> None:
    """Test density calculation with element spanning full page."""
    elements = [
        {"bbox": [0, 0, 612, 792]},  # Full page element
    ]
    x_profile = calculate_density(elements, 612.0, 792.0, "x")
    y_profile = calculate_density(elements, 612.0, 792.0, "y")

    assert len(x_profile) > 0
    assert len(y_profile) > 0
    # Full page should have density of 1.0
    assert all(density >= 0.9 for _, density in x_profile)  # Allow small floating point error
    assert all(density >= 0.9 for _, density in y_profile)


def test_calculate_density_analytic() -> None:
    """Test density calculation is analytic (no fixed resolution)."""
    elements = [
        {"bbox": [50, 50, 150, 100]},
        {"bbox": [200, 200, 300, 250]},
    ]
    x_profile = calculate_density(elements, 612.0, 792.0, "x")
    y_profile = calculate_density(elements, 612.0, 792.0, "y")

    # Analytic: should have points at each bbox transition (x0, x1, y0, y1) plus boundaries
    # For X: transitions at 0, 50, 150, 200, 300, 612 (6 points)
    # For Y: transitions at 0, 50, 100, 200, 250, 792 (6 points)
    assert len(x_profile) == 6
    assert len(y_profile) == 6
    # Check that transition points are present
    x_coords = [coord for coord, _ in x_profile]
    y_coords = [coord for coord, _ in y_profile]
    assert 0.0 in x_coords
    assert 612.0 in x_coords
    assert 0.0 in y_coords
    assert 792.0 in y_coords


def test_calculate_density_profile_format() -> None:
    """Test that density profile returns correct format (axis_value, density_value) tuples."""
    elements = [
        {"bbox": [100, 100, 200, 150]},
    ]
    x_profile = calculate_density(elements, 612.0, 792.0, "x")
    y_profile = calculate_density(elements, 612.0, 792.0, "y")

    # Check format
    for axis_coord, density in x_profile:
        assert isinstance(axis_coord, (int, float))
        assert isinstance(density, (int, float))
        assert 0.0 <= density <= 1.0
        assert 0 <= axis_coord <= 612.0

    for axis_coord, density in y_profile:
        assert isinstance(axis_coord, (int, float))
        assert isinstance(density, (int, float))
        assert 0.0 <= density <= 1.0
        assert 0 <= axis_coord <= 792.0
