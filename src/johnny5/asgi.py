from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, FileResponse
from pathlib import Path
from typing import Dict
import json
import logging
import os
import asyncio


# Default PDF used by the web viewer during tests or when not provided via env
DEFAULT_PDF = Path("examples/02-split_table/02-split_table.pdf").resolve()
DEFAULT_FIXUP = os.environ.get("J5_FIXUP", "")

app = FastAPI(title="Johnny5 Web Viewer")

# Configure logging
disassembly_logger = logging.getLogger("johnny5.disassembly")
reconstruction_logger = logging.getLogger("johnny5.reconstruction")

# Store active WebSocket connections
active_connections: Dict[str, WebSocket] = {}

# Mount static files
static_path = Path(__file__).parent / "web" / "static"
app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

# Setup templates
templates_path = Path(__file__).parent / "web" / "templates"
templates = Jinja2Templates(directory=str(templates_path))


@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    pdf = Path(os.environ.get("J5_PDF", DEFAULT_PDF))
    return templates.TemplateResponse("index.html", {"request": request, "pdf_path": str(pdf)})


@app.get("/api/pdf")
async def serve_pdf(file: str | None = None):
    """Serve the PDF file for PDF.js"""
    pdf = Path(os.environ.get("J5_PDF", DEFAULT_PDF))
    if file:
        # Handle different PDF files
        if file == "02-split_table.pdf":
            pdf_path = Path("examples/02-split_table/02-split_table.pdf")
        elif file == "01-one_page.pdf":
            pdf_path = Path("examples/01-one_page/01-one_page.pdf")
        else:
            pdf_path = pdf  # Default to the main PDF
    else:
        pdf_path = pdf

    if not pdf_path.exists():
        return {"error": f"PDF file not found: {pdf_path}"}

    return FileResponse(pdf_path, media_type="application/pdf")


@app.get("/api/pdf-info")
async def pdf_info():
    pdf = Path(os.environ.get("J5_PDF", DEFAULT_PDF))
    return {"pdf_path": str(pdf), "fixup_module": DEFAULT_FIXUP}


@app.get("/api/structure/{page}")
async def get_structure(page: int):
    try:
        jny5_home = Path(os.environ.get("JNY5_HOME", Path.home() / ".jny5"))
        cache_dir = jny5_home / "cache" / "structure"
        structure_file = cache_dir / "lossless_fixed.json"
        if not structure_file.exists():
            structure_file = cache_dir / "lossless.json"
        if not structure_file.exists():
            return {"error": "No structure data available"}
        with open(structure_file, "r", encoding="utf-8") as f:
            structure_data = json.load(f)
        if page < 1 or page > len(structure_data.get("pages", [])):
            return {"error": f"Page {page} not found"}
        page_data = structure_data["pages"][page - 1]
        return {
            "page": page_data,
            "metadata": structure_data.get("metadata", {}),
            "structure": structure_data.get("structure", {}),
        }
    except Exception as e:  # pragma: no cover - defensive
        return {"error": f"Failed to load structure: {str(e)}"}


@app.get("/api/density/{page}")
async def get_density(page: int):
    try:
        jny5_home = Path(os.environ.get("JNY5_HOME", Path.home() / ".jny5"))
        cache_dir = jny5_home / "cache" / "structure"
        structure_file = cache_dir / "lossless_fixed.json"
        if not structure_file.exists():
            structure_file = cache_dir / "lossless.json"
        if not structure_file.exists():
            return {"error": "No density data available"}
        with open(structure_file, "r", encoding="utf-8") as f:
            structure_data = json.load(f)
        if page < 1 or page > len(structure_data.get("pages", [])):
            return {"error": f"Page {page} not found"}
        page_data = structure_data["pages"][page - 1]
        density_data = page_data.get("_density", {})
        return {
            "x": density_data.get("x", []),
            "y": density_data.get("y", []),
            "resolution": density_data.get("resolution", 50),
            "page_width": page_data.get("width", 0),
            "page_height": page_data.get("height", 0),
        }
    except Exception as e:  # pragma: no cover - defensive
        return {"error": f"Failed to load density data: {str(e)}"}


@app.websocket("/logs")
async def websocket_logs(websocket: WebSocket):
    await websocket.accept()
    connection_id = f"conn_{len(active_connections)}"
    active_connections[connection_id] = websocket
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        del active_connections[connection_id]


class WebSocketLogHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        log_entry = {
            "timestamp": record.created,
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        pane = "left"
        if "reconstruction" in record.name:
            pane = "right"
        log_entry["pane"] = pane
        for conn_id, ws in list(active_connections.items()):
            try:
                asyncio.create_task(ws.send_text(json.dumps(log_entry)))
            except Exception:
                del active_connections[conn_id]


handler = WebSocketLogHandler()
handler.setLevel(logging.DEBUG)
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
handler.setFormatter(formatter)
disassembly_logger.addHandler(handler)
reconstruction_logger.addHandler(handler)
disassembly_logger.setLevel(logging.DEBUG)
reconstruction_logger.setLevel(logging.DEBUG)
