"""Johnny5 Decomposer - PDF to JSON conversion using Docling"""

from pathlib import Path
import json


def run_decompose(
    pdf_path: Path,
    layout_model: str = "pubtables",
    enable_ocr: bool = False,
    json_dpi: int = 300,
    fixup_module: str = "johnny5.fixups.example_fixup",
) -> None:
    """
    Disassemble PDF into lossless JSON using Docling

    Args:
        pdf_path: Path to the PDF file
        layout_model: Docling layout model to use
        enable_ocr: Whether to enable OCR processing
        json_dpi: DPI for JSON output
        fixup_module: Module path for fixup processing
    """
    print(f"🔍 Disassembling {pdf_path}")
    print(f"📐 Layout model: {layout_model}")
    print(f"🔤 OCR enabled: {enable_ocr}")
    print(f"📊 JSON DPI: {json_dpi}")
    print(f"🔧 Fixup module: {fixup_module}")

    # TODO: Implement Docling integration
    # 1. Load PDF with Docling
    # 2. Apply layout model and OCR settings
    # 3. Extract structured content
    # 4. Apply fixup processing
    # 5. Save as JSON

    output_path = pdf_path.with_suffix(".json")

    # Placeholder JSON structure
    placeholder_data = {
        "metadata": {
            "source_pdf": str(pdf_path),
            "layout_model": layout_model,
            "ocr_enabled": enable_ocr,
            "json_dpi": json_dpi,
            "fixup_module": fixup_module,
        },
        "pages": [],
        "structure": {"tables": [], "figures": [], "text_blocks": []},
    }

    with open(output_path, "w") as f:
        json.dump(placeholder_data, f, indent=2)

    print(f"✅ Output saved to: {output_path}")


def load_docling_pipeline(layout_model: str, enable_ocr: bool) -> None:
    """Load and configure Docling pipeline"""
    # TODO: Implement Docling pipeline loading
    pass


def apply_fixups(content: dict, fixup_module: str) -> dict:
    """Apply fixup processing to extracted content"""
    # TODO: Implement fixup processing
    return content
