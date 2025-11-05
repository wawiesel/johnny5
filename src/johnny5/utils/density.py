"""Johnny5 density calculation utilities

This module provides functions to compute density profiles for page elements.
"""

import logging
from typing import Any, Dict, List, Literal, Tuple

logger = logging.getLogger(__name__)


def _extract_bboxes(elements: List[Dict[str, Any]]) -> List[Tuple[float, float, float, float]]:
    """Extract valid bounding boxes from elements."""
    bboxes: List[Tuple[float, float, float, float]] = []
    for elem in elements:
        bbox = elem.get("bbox", [0, 0, 0, 0])
        if len(bbox) == 4 and bbox[2] > bbox[0] and bbox[3] > bbox[1]:
            bboxes.append((bbox[0], bbox[1], bbox[2], bbox[3]))
    return bboxes


def _merge_ranges(ranges: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
    """Merge overlapping or adjacent ranges."""
    if not ranges:
        return []

    sorted_ranges = sorted(ranges, key=lambda r: r[0])
    merged: List[List[float]] = []

    for start, end in sorted_ranges:
        if start >= end:
            continue

        if not merged:
            merged.append([start, end])
        else:
            last = merged[-1]
            if start <= last[1]:
                last[1] = max(last[1], end)
            else:
                merged.append([start, end])

    return [(start, end) for start, end in merged]


def _calculate_coverage(
    ranges: List[Tuple[float, float]], clamp_min: float, clamp_max: float
) -> float:
    """Calculate total coverage from merged ranges, clamped to bounds."""
    merged = _merge_ranges(ranges)
    total = 0.0
    for start, end in merged:
        start_clamped = max(clamp_min, min(start, clamp_max))
        end_clamped = max(clamp_min, min(end, clamp_max))
        total += end_clamped - start_clamped
    return total


def calculate_density(
    elements: List[Dict[str, Any]],
    page_width: float,
    page_height: float,
    axis: Literal["x", "y"],
) -> List[Tuple[float, float]]:
    """
    Calculate density profile for a page along a given axis.

    This is an analytic calculation that computes density at all transition points
    where bounding boxes start or end, providing exact density values.

    Args:
        elements: List of page elements with bbox coordinates
        page_width: Page width in points
        page_height: Page height in points
        axis: 'x' for horizontal density (fraction of height covered at each X),
              'y' for vertical density (fraction of width covered at each Y)

    Returns:
        List of (axis_value, density_value) tuples where:
        - axis_value: Position along the axis (in points) at transition points
        - density_value: Fraction (0.0-1.0) of the perpendicular dimension covered
    """
    bboxes = _extract_bboxes(elements)
    if not bboxes:
        return []

    # Determine axis configuration
    if axis == "y":
        axis_length = page_height
        perp_length = page_width
    else:  # axis == "x"
        axis_length = page_width
        perp_length = page_height

    # Collect all the density impulses
    impulses: List[Tuple[float, float]] = []
    for x0, y0, x1, y1 in bboxes:
        if axis == "y":
            density = (x1 - x0) / perp_length
            impulses.append((y0, +density))
            impulses.append((y1, -density))
        else:  # axis == "x"
            density = (y1 - y0) / perp_length
            impulses.append((x0, +density))
            impulses.append((x1, -density))

    # sort by the start of the impulse
    impulses.sort(key=lambda x: x[0])

    # accumulate the impulses
    profile: List[Tuple[float, float]] = [(0.0, 0.0)]
    for a, density in impulses:
        profile.append((a, density + profile[-1][1]))
    profile.append((profile[-1][0], 0.0))
    profile.append((axis_length, 0.0))

    return profile
