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
        if end <= clamp_min or start >= clamp_max:
            continue
        start_clamped = max(clamp_min, start)
        end_clamped = min(clamp_max, end)
        total += max(0.0, end_clamped - start_clamped)
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

    # Build breakpoint set: page bounds + element edges on the swept axis
    breakpoints: List[float] = [0.0, float(axis_length)]
    for x0, y0, x1, y1 in bboxes:
        if axis == "y":
            breakpoints.append(float(y0))
            breakpoints.append(float(y1))
        else:
            breakpoints.append(float(x0))
            breakpoints.append(float(x1))

    # Unique and sorted breakpoints
    unique_points = sorted(set(breakpoints))

    # For each breakpoint coordinate, compute density from active intervals on perpendicular axis
    profile: List[Tuple[float, float]] = []
    for coord in unique_points:
        if axis == "y":
            # Active if y0 <= coord <= y1 (inclusive at boundaries)
            active_ranges = [(x0, x1) for x0, y0, x1, y1 in bboxes if y0 <= coord <= y1]
            coverage = _calculate_coverage(active_ranges, 0.0, perp_length)
            density_value = 0.0 if perp_length <= 0 else min(1.0, max(0.0, coverage / perp_length))
        else:
            # axis == "x"; active if x0 <= coord <= x1 (inclusive)
            active_ranges = [(y0, y1) for x0, y0, x1, y1 in bboxes if x0 <= coord <= x1]
            coverage = _calculate_coverage(active_ranges, 0.0, perp_length)
            density_value = 0.0 if perp_length <= 0 else min(1.0, max(0.0, coverage / perp_length))

        profile.append((coord, density_value))

    return profile
