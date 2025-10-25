"""Johnny5 density calculation utilities

This module provides functions to compute horizontal and vertical density
of page elements for context-aware fixup processing.
"""

import logging
from typing import List, Dict, Any

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
