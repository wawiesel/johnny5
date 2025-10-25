"""
Simple fixup for one-page document example.

This demonstrates basic fixup processing for a straightforward document
with minimal structural issues.
"""

from typing import Dict, Any, List


def fixup(structure: Dict[str, Any]) -> Dict[str, Any]:
    """
    Apply basic fixup processing to the one-page document.

    This example shows minimal fixup needed for simple documents:
    - Correct text classifications
    - Fix basic bounding boxes
    - Ensure proper element ordering

    Args:
        structure: The raw Docling JSON structure

    Returns:
        Modified structure with basic fixups applied
    """

    # Create a copy to avoid modifying the original
    fixed_structure = structure.copy()

    # Process the single page
    for page in fixed_structure.get("pages", []):
        elements = page.get("elements", [])

        # Apply basic text element fixes
        elements = _fix_text_elements(elements)

        # Sort elements by position (top to bottom)
        elements = _sort_elements_by_position(elements)

        # Update the page with fixed elements
        page["elements"] = elements

    # Add fixup metadata
    if "metadata" not in fixed_structure:
        fixed_structure["metadata"] = {}

    fixed_structure["metadata"]["fixup_applied"] = True
    fixed_structure["metadata"]["fixup_module"] = "examples.01_one_page.fixup"
    fixed_structure["metadata"]["fixup_type"] = "basic"

    return fixed_structure


def _fix_text_elements(elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Apply basic fixes to text elements."""

    fixed_elements = []

    for element in elements:
        if element.get("type") == "text":
            # Fix text classification based on content
            element = _classify_text_element(element)

            # Fix bounding boxes
            element = _fix_basic_bbox(element)

        fixed_elements.append(element)

    return fixed_elements


def _classify_text_element(element: Dict[str, Any]) -> Dict[str, Any]:
    """Classify text elements based on content patterns."""

    content = element.get("content", "")
    if isinstance(content, str):
        content_lower = content.lower().strip()

        # Classify based on content patterns
        if any(keyword in content_lower for keyword in ["simple document", "test"]):
            element["classification"] = "title"
        elif any(
            keyword in content_lower
            for keyword in [
                "basic text",
                "list processing",
                "numbered lists",
                "code and technical",
                "conclusion",
            ]
        ):
            element["classification"] = "section_header"
        elif content_lower.startswith(("•", "-", "*", "1.", "2.", "3.")):
            element["classification"] = "list_item"
        elif content_lower.startswith(("def ", "    ", "return ")):
            element["classification"] = "code"
        else:
            element["classification"] = "paragraph"

    return element


def _fix_basic_bbox(element: Dict[str, Any]) -> Dict[str, Any]:
    """Fix basic bounding box issues."""

    bbox = element.get("bbox", [])
    if len(bbox) == 4:
        x1, y1, x2, y2 = bbox

        # Ensure bounding box is valid
        if x2 <= x1 or y2 <= y1:
            # Fix invalid bounding boxes with reasonable defaults
            element["bbox"] = [x1, y1, x1 + 200, y1 + 20]
        elif (x2 - x1) < 10 or (y2 - y1) < 5:
            # Fix tiny bounding boxes
            element["bbox"] = [x1, y1, x1 + 100, y1 + 15]

    return element


def _sort_elements_by_position(elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sort elements by their vertical position (top to bottom)."""

    def get_y_position(element):
        bbox = element.get("bbox", [])
        if len(bbox) >= 2:
            return bbox[1]  # y1 coordinate
        return 0

    return sorted(elements, key=get_y_position, reverse=True)  # Reverse for top-to-bottom
