"""Johnny5 density calculation utilities

This module provides functions to compute horizontal and vertical density
of page elements for context-aware fixup processing.
"""

import logging
import numpy as np
from typing import List, Dict, Any, Tuple

logger = logging.getLogger(__name__)


def compute_horizontal_density(elements: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Compute horizontal density distribution of page elements.

    Args:
        elements: List of page elements with bbox coordinates

    Returns:
        Dictionary containing horizontal density metrics
    """
    if not elements:
        return {"left": 0.0, "center": 0.0, "right": 0.0}

    # Extract bbox coordinates
    bboxes = [elem.get("bbox", [0, 0, 0, 0]) for elem in elements]

    # Calculate horizontal density zones
    left_density = sum(1 for bbox in bboxes if bbox[0] < 0.33) / len(bboxes)
    center_density = sum(1 for bbox in bboxes if 0.33 <= bbox[0] <= 0.67) / len(bboxes)
    right_density = sum(1 for bbox in bboxes if bbox[0] > 0.67) / len(bboxes)

    return {
        "left": left_density,
        "center": center_density,
        "right": right_density,
    }


def compute_vertical_density(elements: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Compute vertical density distribution of page elements.

    Args:
        elements: List of page elements with bbox coordinates

    Returns:
        Dictionary containing vertical density metrics
    """
    if not elements:
        return {"top": 0.0, "middle": 0.0, "bottom": 0.0}

    # Extract bbox coordinates
    bboxes = [elem.get("bbox", [0, 0, 0, 0]) for elem in elements]

    # Calculate vertical density zones
    top_density = sum(1 for bbox in bboxes if bbox[1] < 0.33) / len(bboxes)
    middle_density = sum(1 for bbox in bboxes if 0.33 <= bbox[1] <= 0.67) / len(bboxes)
    bottom_density = sum(1 for bbox in bboxes if bbox[1] > 0.67) / len(bboxes)

    return {
        "top": top_density,
        "middle": middle_density,
        "bottom": bottom_density,
    }


def calculate_density(elements: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate comprehensive density metrics for page elements.

    Args:
        elements: List of page elements with bbox coordinates

    Returns:
        Dictionary containing both horizontal and vertical density metrics
    """
    return {
        "horizontal": compute_horizontal_density(elements),
        "vertical": compute_vertical_density(elements),
    }


def compute_density_arrays(
    elements: List[Dict[str, Any]], page_width: float, page_height: float, resolution: int = None
) -> Tuple[List[float], List[float]]:
    """
    Compute density arrays for visualization.

    Args:
        elements: List of page elements with bbox coordinates
        page_width: Page width in points
        page_height: Page height in points
        resolution: Resolution for density arrays (auto-calculated if None)

    Returns:
        Tuple of (x_density_array, y_density_array)
    """
    if not elements:
        return [], []

    # Extract bounding boxes
    bboxes = []
    for elem in elements:
        bbox = elem.get("bbox", [0, 0, 0, 0])
        if len(bbox) == 4:
            bboxes.append(bbox)

    if not bboxes:
        return [], []

    # Calculate resolution if not provided
    if resolution is None:
        # Find the smallest meaningful dimension across all bounding boxes
        all_coords = []
        for bbox in bboxes:
            all_coords.extend(bbox)

        if all_coords:
            min_dimension = min(
                min(abs(bbox[2] - bbox[0]), abs(bbox[3] - bbox[1]))
                for bbox in bboxes
                if bbox[2] > bbox[0] and bbox[3] > bbox[1]
            )
            # Use 1/10th of smallest dimension as resolution, with reasonable bounds
            resolution = max(10, min(200, int(min_dimension / 10)))
        else:
            resolution = 50

    # Create density grids
    x_density = np.zeros(resolution)
    y_density = np.zeros(resolution)

    # Normalize coordinates to [0, 1] range
    for bbox in bboxes:
        x0, y0, x1, y1 = bbox

        # Convert to normalized coordinates
        norm_x0 = max(0, min(1, x0 / page_width))
        norm_x1 = max(0, min(1, x1 / page_width))
        norm_y0 = max(0, min(1, y0 / page_height))
        norm_y1 = max(0, min(1, y1 / page_height))

        # Calculate grid indices
        x_start = int(norm_x0 * resolution)
        x_end = int(norm_x1 * resolution)
        y_start = int(norm_y0 * resolution)
        y_end = int(norm_y1 * resolution)

        # Add density to grids
        for i in range(max(0, x_start), min(resolution, x_end + 1)):
            x_density[i] += 1

        for i in range(max(0, y_start), min(resolution, y_end + 1)):
            y_density[i] += 1

    return x_density.tolist(), y_density.tolist()


def calculate_document_resolution(pages: List[Dict[str, Any]]) -> int:
    """
    Calculate document-wide resolution parameter based on all bounding boxes.

    Args:
        pages: List of page data with elements

    Returns:
        Resolution parameter for density arrays
    """
    all_bboxes = []

    for page in pages:
        for element in page.get("elements", []):
            bbox = element.get("bbox", [0, 0, 0, 0])
            if len(bbox) == 4 and bbox[2] > bbox[0] and bbox[3] > bbox[1]:
                all_bboxes.append(bbox)

    if not all_bboxes:
        return 50  # Default resolution

    # Find smallest meaningful dimension
    min_dimensions = []
    for bbox in all_bboxes:
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        min_dimensions.append(min(width, height))

    if min_dimensions:
        min_dimension = min(min_dimensions)
        # Use 1/10th of smallest dimension as resolution, with reasonable bounds
        resolution = max(10, min(200, int(min_dimension / 10)))
        return resolution

    return 50
