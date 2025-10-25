"""Johnny5 fixup context utilities

This module provides the FixupContext dataclass for passing context
information to fixup processing functions.
"""

import logging
from pathlib import Path
from typing import Dict, Any, List
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class FixupContext:
    """
    Context information for fixup processing.

    This dataclass contains all the information needed by fixup functions
    to process document elements according to the fixup protocol:
    - None → keep cluster
    - str → relabel cluster
    - dict → replace cluster
    - list[dict] → split cluster
    """

    pdf_path: Path
    """Path to the original PDF file"""

    pages: List[Dict[str, Any]]
    """List of processed page data with elements and metadata"""

    structure: Dict[str, List[Dict[str, Any]]]
    """High-level document structure (tables, figures, text_blocks)"""

    metadata: Dict[str, Any]
    """Document metadata including processing parameters"""

    def get_page_elements(self, page_number: int) -> List[Dict[str, Any]]:
        """
        Get elements for a specific page.

        Args:
            page_number: Page number (1-indexed)

        Returns:
            List of elements for the specified page
        """
        for page in self.pages:
            if page.get("page_number") == page_number:
                return page.get("elements", [])
        return []

    def get_elements_by_type(self, element_type: str) -> List[Dict[str, Any]]:
        """
        Get all elements of a specific type across all pages.

        Args:
            element_type: Type of elements to retrieve (e.g., "table", "text")

        Returns:
            List of elements matching the specified type
        """
        elements = []
        for page in self.pages:
            for element in page.get("elements", []):
                if element.get("type") == element_type:
                    elements.append(element)
        return elements

    def get_structure_summary(self) -> Dict[str, int]:
        """
        Get a summary of document structure.

        Returns:
            Dictionary with counts of different element types
        """
        return {
            "total_pages": len(self.pages),
            "total_tables": len(self.structure.get("tables", [])),
            "total_figures": len(self.structure.get("figures", [])),
            "total_text_blocks": len(self.structure.get("text_blocks", [])),
        }
