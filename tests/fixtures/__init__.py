"""Test fixtures and utilities for Johnny5 tests"""

from pathlib import Path
from typing import Dict, Any
import json


def create_sample_pdf_json() -> Dict[str, Any]:
    """Create a sample PDF JSON structure for testing"""
    return {
        "metadata": {
            "source_pdf": "sample.pdf",
            "layout_model": "pubtables",
            "ocr_enabled": False,
            "json_dpi": 300,
            "fixup_module": "johnny5.fixups.example_fixup"
        },
        "pages": [
            {
                "page_number": 1,
                "width": 612,
                "height": 792,
                "elements": [
                    {
                        "type": "text",
                        "content": "Sample Document",
                        "bbox": [50, 50, 200, 80],
                        "style": {"font_size": 16, "font_weight": "bold"}
                    },
                    {
                        "type": "table",
                        "content": [["Header 1", "Header 2"], ["Cell 1", "Cell 2"]],
                        "bbox": [50, 100, 300, 200]
                    }
                ]
            }
        ],
        "structure": {
            "tables": [{"page": 1, "bbox": [50, 100, 300, 200], "rows": 2, "cols": 2}],
            "figures": [],
            "text_blocks": [{"page": 1, "bbox": [50, 50, 200, 80], "text": "Sample Document"}]
        }
    }


def create_temp_json_file(tmp_path: Path, data: Dict[str, Any]) -> Path:
    """Create a temporary JSON file for testing"""
    json_file = tmp_path / "test.json"
    with open(json_file, 'w') as f:
        json.dump(data, f, indent=2)
    return json_file
