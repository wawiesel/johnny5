"""Johnny5 Decomposer - PDF to JSON conversion using Docling

This module handles the core PDF decomposition workflow:
1. PDF → Docling → lossless JSON
2. Apply fixup processing (hot-reloadable)
3. Save corrected JSON to _cache/
"""

import json
import logging
import importlib
from pathlib import Path
from typing import Any, Dict, List, Optional

from docling.document_converter import DocumentConverter
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions

from .utils.margins import analyze_page_margins
from .utils.density import (
    compute_horizontal_density,
    compute_vertical_density,
    compute_density_arrays,
    calculate_document_resolution,
)
from .utils.fixup_context import FixupContext

# Configure logging
logger = logging.getLogger(__name__)


def run_decompose(
    pdf: Path,
    layout_model: str,
    enable_ocr: bool,
    json_dpi: int,
    fixup: str,
) -> Path:
    """
    Convert a PDF into Docling lossless JSON, apply fixups, and write corrected output.

    Args:
        pdf: Path to the PDF file to process
        layout_model: Docling layout model to use (e.g., "pubtables", "hi_res")
        enable_ocr: Whether to enable OCR processing for text extraction
        json_dpi: DPI setting for JSON output generation
        fixup: Module path for fixup processing (hot-reloadable)

    Returns:
        Path to the corrected JSON file (_cache/lossless_fixed.json)

    Raises:
        FileNotFoundError: If PDF file doesn't exist
        ImportError: If fixup module can't be imported
        ValueError: If PDF processing fails
    """
    logger.info(f"Starting PDF decomposition: {pdf}")
    logger.info(f"Layout model: {layout_model}, OCR: {enable_ocr}, DPI: {json_dpi}")

    # Validate input
    if not pdf.exists():
        raise FileNotFoundError(f"PDF file not found: {pdf}")

    # Create cache directory
    cache_dir = Path("_cache")
    cache_dir.mkdir(exist_ok=True)

    # Step 1: Convert PDF to lossless JSON using Docling
    logger.info("Converting PDF to lossless JSON using Docling")
    lossless_json_path = cache_dir / "lossless.json"

    try:
        docling_result = _run_docling_conversion(pdf, layout_model, enable_ocr, json_dpi)
        _write_json(docling_result, lossless_json_path)
        logger.info(f"Raw Docling output saved to: {lossless_json_path}")

    except Exception as e:
        logger.error(f"Docling conversion failed: {e}")
        raise ValueError(f"PDF processing failed: {e}") from e

    # Step 2: Apply fixup processing
    logger.info(f"Applying fixup processing: {fixup}")
    corrected_json_path = cache_dir / "lossless_fixed.json"

    try:
        corrected_result = _apply_fixup_rules(docling_result, fixup, pdf)
        _write_json(corrected_result, corrected_json_path)
        logger.info(f"Corrected output saved to: {corrected_json_path}")

    except Exception as e:
        logger.error(f"Fixup processing failed: {e}")
        # Fallback: copy raw output as corrected
        _write_json(docling_result, corrected_json_path)
        logger.warning("Using raw Docling output as fallback")

    logger.info("PDF decomposition completed successfully")
    return corrected_json_path


def _run_docling_conversion(
    pdf: Path, layout_model: str, enable_ocr: bool, json_dpi: int
) -> Dict[str, Any]:
    """
    Convert PDF to lossless JSON using Docling DocumentConverter.

    Args:
        pdf: Path to PDF file
        layout_model: Layout model to use
        enable_ocr: Whether to enable OCR
        json_dpi: DPI for JSON output

    Returns:
        Dictionary containing Docling's lossless JSON structure
    """
    logger.debug(f"Initializing Docling converter with model: {layout_model}")

    # Configure pipeline options
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = enable_ocr
    pipeline_options.do_table_structure = True
    pipeline_options.table_structure_options.do_cell_matching = True

    # Initialize converter
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: pipeline_options,
        },
    )

    # Convert document
    logger.debug("Running Docling conversion")
    result = converter.convert(str(pdf))

    # Extract the document structure
    doc = result.document

    # Build our JSON structure
    json_data = {
        "metadata": {
            "source_pdf": str(pdf),
            "layout_model": layout_model,
            "ocr_enabled": enable_ocr,
            "json_dpi": json_dpi,
            "docling_version": getattr(converter, "__version__", "unknown"),
            "processing_timestamp": result.timestamp.isoformat() if result.timestamp else None,
        },
        "pages": [],
        "structure": {
            "tables": [],
            "figures": [],
            "text_blocks": [],
        },
    }

    # Calculate document-wide resolution for density arrays
    # We need to collect all elements first to calculate resolution
    all_pages_data = []
    for page_idx, page in enumerate(doc.pages):
        logger.debug(f"Processing page {page_idx + 1}")

        page_data = {
            "page_number": page_idx + 1,
            "width": page.width,
            "height": page.height,
            "elements": [],
        }

        # Process page elements
        for element in page.elements:
            element_data = _extract_element_data(element, page_idx + 1)
            if element_data:
                page_data["elements"].append(element_data)

        all_pages_data.append(page_data)

    # Calculate document-wide resolution
    doc_resolution = calculate_document_resolution(all_pages_data)
    logger.debug(f"Document resolution for density arrays: {doc_resolution}")

    # Now process each page with density arrays
    for page_data in all_pages_data:
        # Analyze page-level properties
        page_data["margins"] = analyze_page_margins(page_data["elements"])
        page_data["horizontal_density"] = compute_horizontal_density(page_data["elements"])
        page_data["vertical_density"] = compute_vertical_density(page_data["elements"])

        # Compute density arrays for visualization
        x_density, y_density = compute_density_arrays(
            page_data["elements"], page_data["width"], page_data["height"], doc_resolution
        )
        page_data["_density"] = {"x": x_density, "y": y_density, "resolution": doc_resolution}

        json_data["pages"].append(page_data)

    # Extract structural information
    json_data["structure"] = _extract_document_structure(json_data["pages"])

    logger.info(f"Successfully converted PDF with {len(json_data['pages'])} pages")
    return json_data


def _extract_element_data(element: Any, page_number: int) -> Optional[Dict[str, Any]]:
    """
    Extract structured data from a Docling element.

    Args:
        element: Docling element object
        page_number: Page number for context

    Returns:
        Dictionary containing element data, or None if element should be skipped
    """
    try:
        element_data = {
            "type": element.label,
            "page": page_number,
            "bbox": [element.bbox.x0, element.bbox.y0, element.bbox.x1, element.bbox.y1],
            "confidence": getattr(element, "confidence", 1.0),
        }

        # Extract content based on element type
        if hasattr(element, "text") and element.text:
            element_data["content"] = element.text.strip()

        if hasattr(element, "table") and element.table:
            element_data["table"] = _extract_table_data(element.table)

        if hasattr(element, "figure") and element.figure:
            element_data["figure"] = _extract_figure_data(element.figure)

        return element_data

    except Exception as e:
        logger.warning(f"Failed to extract element data: {e}")
        return None


def _extract_table_data(table: Any) -> Dict[str, Any]:
    """Extract structured data from a Docling table."""
    return {
        "rows": len(table.rows) if hasattr(table, "rows") else 0,
        "cols": len(table.cols) if hasattr(table, "cols") else 0,
        "cells": [
            {
                "row": cell.row_idx,
                "col": cell.col_idx,
                "content": cell.text if hasattr(cell, "text") else "",
                "bbox": [cell.bbox.x0, cell.bbox.y0, cell.bbox.x1, cell.bbox.y1],
            }
            for cell in getattr(table, "cells", [])
        ],
    }


def _extract_figure_data(figure: Any) -> Dict[str, Any]:
    """Extract structured data from a Docling figure."""
    return {
        "caption": getattr(figure, "caption", ""),
        "image_path": getattr(figure, "image_path", ""),
        "bbox": [figure.bbox.x0, figure.bbox.y0, figure.bbox.x1, figure.bbox.y1],
    }


def _extract_document_structure(pages: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Extract high-level document structure from processed pages.

    Args:
        pages: List of processed page data

    Returns:
        Dictionary containing tables, figures, and text blocks
    """
    structure = {
        "tables": [],
        "figures": [],
        "text_blocks": [],
    }

    for page in pages:
        page_num = page["page_number"]

        for element in page["elements"]:
            if element["type"] == "table":
                structure["tables"].append(
                    {
                        "page": page_num,
                        "bbox": element["bbox"],
                        "rows": element.get("table", {}).get("rows", 0),
                        "cols": element.get("table", {}).get("cols", 0),
                    }
                )
            elif element["type"] == "figure":
                structure["figures"].append(
                    {
                        "page": page_num,
                        "bbox": element["bbox"],
                        "caption": element.get("figure", {}).get("caption", ""),
                    }
                )
            elif element["type"] in ["text", "title", "heading"]:
                structure["text_blocks"].append(
                    {
                        "page": page_num,
                        "bbox": element["bbox"],
                        "text": element.get("content", ""),
                        "type": element["type"],
                    }
                )

    return structure


def _apply_fixup_rules(docling_result: Dict[str, Any], fixup: str, pdf: Path) -> Dict[str, Any]:
    """
    Apply fixup processing to Docling result using the specified module.

    Args:
        docling_result: Raw Docling JSON result
        fixup: Module path for fixup processing
        pdf: Original PDF path for context

    Returns:
        Corrected JSON result after fixup processing
    """
    logger.debug(f"Loading fixup module: {fixup}")

    try:
        # Import fixup module (hot-reloadable)
        module = importlib.import_module(fixup)

        if not hasattr(module, "apply_fixup"):
            logger.warning(f"Fixup module {fixup} missing apply_fixup function")
            return docling_result

        # Create fixup context
        context = FixupContext(
            pdf_path=pdf,
            pages=docling_result["pages"],
            structure=docling_result["structure"],
            metadata=docling_result["metadata"],
        )

        # Apply fixup processing
        logger.debug("Applying fixup processing to document")
        corrected_result = module.apply_fixup(context)

        if corrected_result is None:
            logger.warning("Fixup module returned None, using original result")
            return docling_result

        # Recompute density arrays for corrected result
        logger.debug("Recomputing density arrays after fixup")
        corrected_result = _recompute_density_arrays(corrected_result)

        logger.info("Fixup processing completed successfully")
        return corrected_result

    except ImportError as e:
        logger.error(f"Failed to import fixup module {fixup}: {e}")
        raise ImportError(f"Could not import fixup module: {fixup}") from e
    except Exception as e:
        logger.error(f"Fixup processing failed: {e}")
        logger.warning("Using original Docling result as fallback")
        return docling_result


def _recompute_density_arrays(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recompute density arrays after fixup processing.

    Args:
        result: Document result (may be modified by fixup)

    Returns:
        Result with updated density arrays
    """
    # Calculate document-wide resolution
    doc_resolution = calculate_document_resolution(result["pages"])

    # Update density arrays for each page
    for page_data in result["pages"]:
        x_density, y_density = compute_density_arrays(
            page_data["elements"], page_data["width"], page_data["height"], doc_resolution
        )
        page_data["_density"] = {"x": x_density, "y": y_density, "resolution": doc_resolution}

    return result


def _write_json(data: Dict[str, Any], output_path: Path) -> None:
    """
    Write JSON data to file with proper encoding and formatting.

    Args:
        data: Dictionary to serialize as JSON
        output_path: Path where to write the JSON file
    """
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def load_docling_pipeline(layout_model: str, enable_ocr: bool) -> DocumentConverter:
    """
    Load and configure Docling pipeline with specified options.

    Args:
        layout_model: Layout model to use
        enable_ocr: Whether to enable OCR

    Returns:
        Configured DocumentConverter instance
    """
    logger.debug(f"Loading Docling pipeline: model={layout_model}, ocr={enable_ocr}")

    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = enable_ocr
    pipeline_options.do_table_structure = True
    pipeline_options.table_structure_options.do_cell_matching = True

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: pipeline_options,
        },
    )

    return converter


def apply_fixups(content: Dict[str, Any], fixup: str) -> Dict[str, Any]:
    """
    Apply fixup processing to extracted content.

    Args:
        content: Document content dictionary
        fixup: Module path for fixup processing

    Returns:
        Corrected content after fixup processing
    """
    return _apply_fixup_rules(content, fixup, Path("unknown.pdf"))
