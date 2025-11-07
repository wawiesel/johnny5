"""Johnny5 Disassembler - PDF to JSON conversion using Docling

This module handles the core PDF disassembly workflow:
1. PDF → Docling → lossless JSON
2. Apply fixup processing (hot-reloadable)
3. Save corrected JSON to _cache/
"""

import json
import logging
import importlib
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, cast

from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.backend.pypdfium2_backend import PyPdfiumDocumentBackend

from .utils.margins import analyze_page_margins
from .utils.density import calculate_density
from .utils.fixup_context import FixupContext
from .utils.cache import (
    generate_disassemble_cache_key,
    get_cached_file,
    get_cache_dir,
    save_to_cache,
)

# Configure logging
logger = logging.getLogger(__name__)


def run_disassemble(
    pdf: Path,
    enable_ocr: bool,
    fixup: str,
    force_refresh: bool = False,
) -> str:
    """
    Convert a PDF into Docling lossless JSON with content-based caching.

    This function implements cache-first behavior:
    1. Generate cache key from PDF content + Docling options
    2. Check if cache exists for this key
    3. If cache hit and not forced: Return cache key (no processing needed)
    4. If cache miss or forced: Run Docling, save to cache, return cache key

    Args:
        pdf: Path to the PDF file to process
        enable_ocr: Whether to enable OCR processing for text extraction
        fixup: Module path for fixup processing (hot-reloadable)
        force_refresh: If True, reprocess even if cache exists (default: False)

    Returns:
        16-character cache key identifying the cached structure JSON

    Raises:
        FileNotFoundError: If PDF file doesn't exist
        ValueError: If PDF processing fails
    """
    # Check Docling version requirement
    check_docling_version()

    logger.info(f"Starting PDF disassembly: {pdf}")
    logger.info(f"OCR: {enable_ocr}")

    # Validate input
    if not pdf.exists():
        raise FileNotFoundError(f"PDF file not found: {pdf}")

    # Step 1: Generate cache key from PDF content + Docling options
    cache_key, pdf_checksum = generate_disassemble_cache_key(pdf, enable_ocr)
    logger.info(f"Cache key: {cache_key}")
    logger.info(f"PDF checksum: {pdf_checksum}")

    # Set up file logging for detailed output
    log_dir = get_cache_dir("logs")
    log_file = log_dir / f"{cache_key}.log"
    file_handler = logging.FileHandler(log_file, mode="w")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    )
    logger.addHandler(file_handler)
    logger.info(f"Full log will be written to: {log_file}")

    try:
        # Step 2: Check if cache exists
        cached_file = get_cached_file(cache_key, "structure")
        if cached_file is not None and not force_refresh:
            logger.info(f"Cache hit! Using cached result: {cached_file}")
            logger.info("Skipping Docling conversion (already processed)")
            return cache_key

        # Step 3: Cache miss or forced refresh - run Docling conversion
        if cached_file is not None:
            logger.info(f"Cache exists at {cached_file}, but forcing refresh as requested")
        else:
            logger.info("Cache miss - running Docling conversion")

        try:
            docling_result = _run_docling_conversion(pdf, enable_ocr, pdf_checksum)

            # Save to cache with cache key as filename
            cache_file = save_to_cache(docling_result, cache_key, "structure")
            logger.info(f"Docling output saved to cache: {cache_file}")

        except Exception as e:
            logger.error(f"Docling conversion failed: {e}")
            raise ValueError(f"PDF processing failed: {e}") from e

        logger.info("PDF disassembly completed successfully")
        return cache_key
    finally:
        # Clean up file handler
        logger.removeHandler(file_handler)
        file_handler.close()


def _run_docling_conversion(pdf: Path, enable_ocr: bool, pdf_checksum: str) -> Dict[str, Any]:
    """
    Convert PDF to lossless JSON using Docling DocumentConverter.

    Args:
        pdf: Path to PDF file
        enable_ocr: Whether to enable OCR
        pdf_checksum: SHA-256 checksum of the PDF file

    Returns:
        Dictionary containing Docling's lossless JSON structure
    """
    logger.debug("Initializing Docling converter (Docling 2.0: docling_layout_heron)")

    # Initialize converter with PdfFormatOption and configure pipeline options
    pdf_opt = PdfFormatOption()
    # Use PyPdfiumDocumentBackend explicitly (matches main branch behavior)
    pdf_opt.backend = PyPdfiumDocumentBackend
    # Start from defaults and override fields explicitly
    pdf_options = PdfPipelineOptions()
    pdf_options.do_ocr = enable_ocr
    # Docling 2.0: layout model is always docling_layout_heron (set by default)
    pdf_opt.pipeline_options = pdf_options

    converter = DocumentConverter(format_options={InputFormat.PDF: pdf_opt})

    # Convert document
    logger.debug("Running Docling conversion")
    result = converter.convert(str(pdf))

    # Extract the document structure - use model_dump() to get the full structure
    doc_dict = result.model_dump()

    # Build metadata and extract pages from Docling's structure
    # Convert to file:// URI (absolute path)
    pdf_uri = pdf.resolve().as_uri()

    metadata: Dict[str, Any] = {
        "source_pdf": pdf_uri,
        "_checksum": pdf_checksum,
        "layout_model": "docling_layout_heron",  # Docling 2.0 always uses this
        "ocr_enabled": enable_ocr,
    }

    pages = cast(List[Dict[str, Any]], doc_dict.get("pages", []))

    pages_data: List[Dict[str, Any]] = []
    for page_idx, page_dict in enumerate(pages):
        logger.debug(f"Processing page {page_idx + 1}")

        # Get page dimensions from page size
        size = page_dict.get("size", {})
        if isinstance(size, dict):
            width = size.get("width", 612)
            height = size.get("height", 792)
        else:
            width = 612
            height = 792

        page_data: Dict[str, Any] = {
            "page_number": page_idx + 1,
            "width": width,
            "height": height,
            "elements": [],
        }

        # Process page predictions/layout to extract elements
        predictions = page_dict.get("predictions", {})
        layout = predictions.get("layout", {})
        clusters = layout.get("clusters", [])

        page_elements = cast(List[Dict[str, Any]], page_data["elements"])
        for cluster in clusters:
            element_data = _extract_element_data_from_cluster(cluster, page_idx + 1, width, height)
            if element_data:
                page_elements.append(element_data)

        pages_data.append(page_data)

    # Now process each page with density profiles
    for page_data in pages_data:
        # Analyze page-level properties
        elements = cast(List[Dict[str, Any]], page_data["elements"])
        page_data["margins"] = analyze_page_margins(elements)

        # Compute density profiles for visualization
        x_profile = calculate_density(elements, page_data["width"], page_data["height"], "x")
        y_profile = calculate_density(elements, page_data["width"], page_data["height"], "y")
        page_data["_density"] = {
            "x": x_profile,
            "y": y_profile,
        }

    structure = _extract_document_structure(pages_data)

    json_data: Dict[str, Any] = {
        "metadata": metadata,
        "pages": pages_data,
        "structure": structure,
    }

    logger.info(f"Successfully converted PDF with {len(pages_data)} pages")
    return json_data


def _extract_element_data_from_cluster(
    cluster: Dict[str, Any], page_number: int, page_width: float, page_height: float
) -> Optional[Dict[str, Any]]:
    """
    Extract structured data from a Docling cluster (from lossless JSON format).

    Args:
        cluster: Docling cluster dictionary
        page_number: Page number for context
        page_width: Page width in points
        page_height: Page height in points

    Returns:
        Dictionary containing element data, or None if element should be skipped
    """
    try:
        # Extract label/type
        label = cluster.get("label", "unknown")

        # Extract bounding box
        bbox_dict = cluster.get("bbox", {})
        if isinstance(bbox_dict, dict):
            # Format: {"l": left, "t": top, "r": right, "b": bottom}
            x0 = bbox_dict.get("l", 0)
            y0 = bbox_dict.get("t", 0)
            x1 = bbox_dict.get("r", page_width)
            y1 = bbox_dict.get("b", page_height)
        elif isinstance(bbox_dict, list) and len(bbox_dict) == 4:
            x0, y0, x1, y1 = bbox_dict
        else:
            return None

        element_data = {
            "type": label,
            "page": page_number,
            "bbox": [x0, y0, x1, y1],
            "confidence": cluster.get("confidence", 1.0),
        }

        # Extract text content
        if "text" in cluster:
            element_data["content"] = str(cluster["text"]).strip()
        elif "cells" in cluster:
            # Extract text from cells
            text_parts = []
            for cell in cluster.get("cells", []):
                if isinstance(cell, dict) and "text" in cell:
                    text_parts.append(cell["text"])
                elif isinstance(cell, str):
                    text_parts.append(cell)
            if text_parts:
                element_data["content"] = " ".join(text_parts)

        return element_data

    except Exception as e:
        logger.warning(f"Failed to extract element data from cluster: {e}")
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
    structure: Dict[str, List[Dict[str, Any]]] = {
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
        corrected_result_raw = module.apply_fixup(context)

        if corrected_result_raw is None:
            logger.warning("Fixup module returned None, using original result")
            return docling_result

        if not isinstance(corrected_result_raw, dict):
            logger.warning("Fixup module returned non-dict result, using original result")
            return docling_result

        corrected_result = cast(Dict[str, Any], corrected_result_raw)

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
    Recompute density profiles after fixup processing.

    Args:
        result: Document result (may be modified by fixup)

    Returns:
        Result with updated density profiles
    """
    # Update density profiles for each page
    pages = cast(List[Dict[str, Any]], result["pages"])
    for page_data in pages:
        elements = cast(List[Dict[str, Any]], page_data["elements"])
        x_profile = calculate_density(elements, page_data["width"], page_data["height"], "x")
        y_profile = calculate_density(elements, page_data["width"], page_data["height"], "y")
        page_data["_density"] = {
            "x": x_profile,
            "y": y_profile,
        }

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


def load_docling_pipeline(enable_ocr: bool) -> DocumentConverter:
    """
    Load and configure Docling pipeline with specified options.

    Args:
        enable_ocr: Whether to enable OCR

    Returns:
        Configured DocumentConverter instance
    """
    # Check Docling version requirement
    check_docling_version()

    logger.debug(f"Loading Docling pipeline (Docling 2.0: docling_layout_heron), ocr={enable_ocr}")

    pdf_opt = PdfFormatOption()
    # Use PyPdfiumDocumentBackend explicitly (matches main branch behavior)
    pdf_opt.backend = PyPdfiumDocumentBackend
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = enable_ocr
    pipeline_options.do_table_structure = True
    pipeline_options.table_structure_options.do_cell_matching = True
    # Docling 2.0: layout model is always docling_layout_heron (set by default)
    pdf_opt.pipeline_options = pipeline_options

    converter = DocumentConverter(format_options={InputFormat.PDF: pdf_opt})

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


def get_available_layout_models() -> List[Dict[str, str]]:
    """
    Get list of available Docling layout models with descriptions.

    Models are discovered from a version-specific cache file in ~/.jny5/models/{version}.json
    (or $JNY5_HOME/models/{version}.json if JNY5_HOME is set).

    The cache file is automatically created on first run with known defaults for the current
    Docling version. Users can manually edit the cache file to customize available models.

    Future enhancement: Automatic discovery by querying Docling's API or documentation
    when a new version is detected, then caching the results.

    Returns:
        List of dicts with 'name', 'description', and optional 'docs_url' keys
    """
    # Check Docling version requirement
    check_docling_version()

    docling_version = get_docling_version()

    # Try to load models from version-specific cache
    jny5_home = Path(os.environ.get("JNY5_HOME", str(Path.home() / ".jny5")))
    models_dir = jny5_home / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    models_cache_file = models_dir / f"{docling_version}.json"

    if models_cache_file.exists():
        try:
            with open(models_cache_file, "r", encoding="utf-8") as f:
                cached_models = json.load(f)
                if isinstance(cached_models, list) and len(cached_models) > 0:
                    logger.debug(f"Loaded layout models from cache: {models_cache_file}")
                    return cached_models
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"Failed to load models cache: {e}, using defaults")

    # Docling 2.0+ only: always uses docling_layout_heron
    models = [
        {
            "name": "docling_layout_heron",
            "description": "Unified layout detection model (Docling 2.0+)",
            "docs_url": "https://github.com/DS4SD/docling",
        },
    ]

    # Save defaults to cache for future reference and manual editing
    try:
        with open(models_cache_file, "w", encoding="utf-8") as f:
            json.dump(models, f, indent=2, ensure_ascii=False)
        logger.info(f"Saved default models to cache: {models_cache_file}")
        logger.info("You can edit this file to customize available models for this Docling version")
    except IOError as e:
        logger.warning(f"Failed to save models cache: {e}")

    return models


def get_docling_version() -> str:
    """Get the current Docling version.

    Returns:
        Version string (e.g., '2.58.0')
    """
    import importlib.metadata

    return importlib.metadata.version("docling")


def check_docling_version() -> None:
    """Check that Docling version is 2.0 or higher.

    Raises:
        RuntimeError: If Docling version is less than 2.0
    """
    version = get_docling_version()
    major_version = int(version.split(".")[0])
    if major_version < 2:
        raise RuntimeError(
            f"Docling version {version} is not supported. "
            "Johnny5 requires Docling 2.0 or higher. "
            "Please upgrade: pip install --upgrade docling"
        )


def verify_layout_model(model_name: str) -> bool:
    """
    Verify that a layout model is available and can be instantiated.

    Args:
        model_name: Name of the layout model to verify

    Returns:
        True if model is valid and can be used, False otherwise
    """
    # Docling 2.0+ only supports docling_layout_heron
    return model_name == "docling_layout_heron"
