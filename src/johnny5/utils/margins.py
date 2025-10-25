"""Johnny5 margin analysis utilities

This module provides functions to analyze page margins and element positioning
for context-aware fixup processing.
"""

import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


def analyze_page_margins(elements: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Analyze page margins based on element bounding boxes.

    Args:
        elements: List of page elements with bbox coordinates

    Returns:
        Dictionary containing margin measurements
    """
    if not elements:
        return {"left": 0.0, "right": 0.0, "top": 0.0, "bottom": 0.0}

    # Extract bbox coordinates
    bboxes = [elem.get("bbox", [0, 0, 0, 0]) for elem in elements]

    # Calculate margins using percentiles
    left_margin = min(bbox[0] for bbox in bboxes) if bboxes else 0.0
    right_margin = 1.0 - max(bbox[2] for bbox in bboxes) if bboxes else 0.0
    top_margin = min(bbox[1] for bbox in bboxes) if bboxes else 0.0
    bottom_margin = 1.0 - max(bbox[3] for bbox in bboxes) if bboxes else 0.0

    return {
        "left": left_margin,
        "right": right_margin,
        "top": top_margin,
        "bottom": bottom_margin,
    }


def analyze_margins(elements: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Legacy function name for margin analysis.

    Args:
        elements: List of page elements with bbox coordinates

    Returns:
        Dictionary containing margin measurements
    """
    return analyze_page_margins(elements)
