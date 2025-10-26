def run_web(pdf, port, fixup):
    """Launch the FastAPI web viewer for Johnny5"""
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect
    from fastapi.staticfiles import StaticFiles
    from fastapi.templating import Jinja2Templates
    from fastapi.responses import HTMLResponse, FileResponse
    from fastapi import Request
    import uvicorn
    import json
    import logging
    from pathlib import Path
    import asyncio
    from typing import Dict

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
        return templates.TemplateResponse("index.html", {"request": request, "pdf_path": str(pdf)})

    @app.get("/api/pdf")
    async def serve_pdf(file: str = None):
        """Serve the PDF file for PDF.js"""
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
        """Get PDF information for the web viewer"""
        return {"pdf_path": str(pdf), "fixup_module": fixup}

    @app.get("/api/structure/{page}")
    async def get_structure(page: int):
        """Get structure data for a specific page"""
        try:
            # Load structure from cache
            cache_dir = Path("_cache")
            structure_file = cache_dir / "lossless_fixed.json"

            if not structure_file.exists():
                # Fallback to raw structure
                structure_file = cache_dir / "lossless.json"

            if not structure_file.exists():
                return {"error": "No structure data available"}

            with open(structure_file, "r", encoding="utf-8") as f:
                structure_data = json.load(f)

            # Find the requested page (1-indexed)
            if page < 1 or page > len(structure_data.get("pages", [])):
                return {"error": f"Page {page} not found"}

            page_data = structure_data["pages"][page - 1]
            return {
                "page": page_data,
                "metadata": structure_data.get("metadata", {}),
                "structure": structure_data.get("structure", {}),
            }

        except Exception as e:
            return {"error": f"Failed to load structure: {str(e)}"}

    @app.get("/api/density/{page}")
    async def get_density(page: int):
        """Get density data for visualization"""
        try:
            # Load structure from cache
            cache_dir = Path("_cache")
            structure_file = cache_dir / "lossless_fixed.json"

            if not structure_file.exists():
                # Fallback to raw structure
                structure_file = cache_dir / "lossless.json"

            if not structure_file.exists():
                return {"error": "No density data available"}

            with open(structure_file, "r", encoding="utf-8") as f:
                structure_data = json.load(f)

            # Find the requested page (1-indexed)
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

        except Exception as e:
            return {"error": f"Failed to load density data: {str(e)}"}

    @app.websocket("/logs")
    async def websocket_logs(websocket: WebSocket):
        """WebSocket endpoint for streaming logs"""
        await websocket.accept()
        connection_id = f"conn_{len(active_connections)}"
        active_connections[connection_id] = websocket

        try:
            while True:
                # Keep connection alive
                await websocket.receive_text()
        except WebSocketDisconnect:
            del active_connections[connection_id]

    # Custom log handler to send logs to WebSocket clients
    class WebSocketLogHandler(logging.Handler):
        def emit(self, record):
            log_entry = {
                "timestamp": record.created,
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
                "module": record.module,
                "function": record.funcName,
                "line": record.lineno,
            }

            # Determine which pane this log should go to
            pane = "left"  # Default to left pane
            if "reconstruction" in record.name:
                pane = "right"

            log_entry["pane"] = pane

            # Send to all active connections
            for conn_id, websocket in list(active_connections.items()):
                try:
                    asyncio.create_task(websocket.send_text(json.dumps(log_entry)))
                except Exception:
                    # Remove dead connections
                    del active_connections[conn_id]

    # Add the custom handler to our loggers
    handler = WebSocketLogHandler()
    handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    handler.setFormatter(formatter)

    disassembly_logger.addHandler(handler)
    reconstruction_logger.addHandler(handler)
    disassembly_logger.setLevel(logging.DEBUG)
    reconstruction_logger.setLevel(logging.DEBUG)

    print(f"🚀 Starting Johnny5 web viewer on http://localhost:{port}")
    print(f"📄 PDF: {pdf}")
    print(f"🔧 Fixup: {fixup}")

    uvicorn.run(app, host="0.0.0.0", port=port)
