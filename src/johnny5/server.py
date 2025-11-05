from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Union, cast
from typing import Awaitable, Callable, MutableMapping

from fastapi import FastAPI, Request, Response, UploadFile, File
from pydantic import BaseModel

JSONDict = Dict[str, Any]


class DisassembleOptions(BaseModel):
    """Request body for disassemble-refresh endpoint"""

    layout_model: str = "pubtables"
    enable_ocr: bool = False
    json_dpi: int = 144


def _create_app(pdf: Union[str, Path], fixup: str, color_scheme: str = "dark") -> FastAPI:
    """Create and configure the FastAPI app with all routes and state.

    This function contains all the common logic for creating the Johnny5 web viewer app.
    It's used by both run_web() and _create_test_app() to avoid code duplication.

    Args:
        pdf: Path to the PDF file to view
        fixup: Module path for fixup processing
        color_scheme: Initial color scheme ("light", "dark", or "debug")

    Returns:
        Configured FastAPI application instance
    """
    from fastapi import WebSocket, WebSocketDisconnect
    from fastapi.staticfiles import StaticFiles
    from fastapi.templating import Jinja2Templates
    from fastapi.responses import HTMLResponse, FileResponse
    import json
    import logging
    import asyncio
    import shutil
    from .disassembler import run_disassemble
    from .utils.cache import get_cache_path, get_cache_dir

    app = FastAPI(title="Johnny5 Web Viewer")

    # Configure logging
    disassembly_logger = logging.getLogger("johnny5.disassembly")
    reconstruction_logger = logging.getLogger("johnny5.reconstruction")

    # Store active WebSocket connections
    active_connections: Dict[str, WebSocket] = {}

    # Store the main event loop for thread-safe async operations
    main_loop: Optional[asyncio.AbstractEventLoop] = None

    # Store structure data in memory (no cache dependency)
    structure_data: JSONDict = {}

    # Track disassembly status
    disassembly_status: JSONDict = {
        "status": "pending",  # pending, in_progress, completed, error
        "message": "",
        "started_at": None,
        "completed_at": None,
    }

    # Track which PDF is currently active (CLI at startup, uploads thereafter)
    cli_pdf_path: Path = Path(pdf).resolve()
    current_pdf_path: Path = cli_pdf_path
    current_pdf_display_name: str = current_pdf_path.name

    def set_current_pdf(path: Path, display_name: Optional[str] = None) -> None:
        """Update the active PDF path and friendly display name"""
        nonlocal current_pdf_path, current_pdf_display_name
        resolved = Path(path).resolve()
        current_pdf_path = resolved
        current_pdf_display_name = display_name or resolved.name

    def load_structure_data(json_path: Path) -> None:
        """Load structure data from the JSON file created by run_disassemble"""
        nonlocal structure_data
        server_logger = logging.getLogger("johnny5.server")
        try:
            if json_path.exists():
                with open(json_path, "r", encoding="utf-8") as f:
                    structure_data = cast(JSONDict, json.load(f))
                    server_logger.info(f"Loaded structure data from {json_path}")
                    print(f"✅ Loaded {len(structure_data.get('pages', []))} pages into memory")
            else:
                structure_data = {}
                server_logger.warning(f"Structure file not found: {json_path}")
                print(f"❌ Structure file not found: {json_path}")
        except Exception as e:
            server_logger.error(f"Failed to load structure data: {e}")
            print(f"❌ Failed to load structure data: {e}")
            structure_data = {}

    async def run_disassembly_background(
        pdf_path: Path, fixup_module: str, options: DisassembleOptions
    ) -> None:
        """Run disassembly in background thread and update status"""
        nonlocal disassembly_status
        from datetime import datetime
        import asyncio

        server_logger = logging.getLogger("johnny5.server")

        disassembly_status["status"] = "in_progress"
        disassembly_status["message"] = f"Disassembling {pdf_path.name}..."
        disassembly_status["started_at"] = datetime.now().isoformat()

        try:
            # Run the synchronous disassembly in a thread pool to avoid blocking
            cache_key = await asyncio.to_thread(
                run_disassemble,
                pdf=pdf_path,
                layout_model=options.layout_model,
                enable_ocr=options.enable_ocr,
                json_dpi=options.json_dpi,
                fixup=fixup_module,
                force_refresh=True,  # Always force refresh when user explicitly requests it
            )
            json_path = get_cache_path(cache_key, "structure")
            load_structure_data(json_path)

            # Get log file path
            log_dir = get_cache_dir("logs")
            log_file = log_dir / f"{cache_key}.log"

            disassembly_status["status"] = "completed"
            disassembly_status["message"] = f"Disassembly completed for {pdf_path.name}"
            disassembly_status["completed_at"] = datetime.now().isoformat()

            # Notify all connected clients via WebSocket
            notification = {
                "type": "disassembly_complete",
                "status": "completed",
                "message": disassembly_status["message"],
                "log_file": str(log_file),
            }
            for conn_id, websocket in list(active_connections.items()):
                try:
                    await websocket.send_text(json.dumps(notification))
                except Exception:
                    del active_connections[conn_id]

            server_logger.info("Disassembly completed successfully")
            print("✅ Disassembly completed successfully")
        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            disassembly_status["status"] = "error"
            disassembly_status["message"] = error_msg
            disassembly_status["completed_at"] = datetime.now().isoformat()
            server_logger.error(f"Disassembly failed: {error_msg}")
            print(f"❌ Disassembly failed: {error_msg}")

    # Mount static files
    static_path = Path(__file__).parent / "web" / "static"
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

    # Setup templates
    templates_path = Path(__file__).parent / "web" / "templates"
    templates = Jinja2Templates(directory=str(templates_path))

    @app.get("/", response_class=HTMLResponse)
    async def root(request: Request) -> Response:
        return templates.TemplateResponse(
            "index.html",
            {"request": request, "pdf_path": str(current_pdf_path), "color_scheme": color_scheme},
        )

    @app.get("/api/pdf")
    async def serve_pdf(_file: Optional[str] = None) -> FileResponse:
        """Serve the PDF file for PDF.js"""
        server_logger = logging.getLogger("johnny5.server")

        candidates = []
        if current_pdf_path.exists():
            candidates.append(current_pdf_path)
        if cli_pdf_path.exists() and cli_pdf_path not in candidates:
            candidates.append(cli_pdf_path)

        if candidates:
            chosen = candidates[0]
            server_logger.info(f"Serving PDF: {chosen}")
            return FileResponse(chosen, media_type="application/pdf")

        # No PDF found - return proper HTTP error
        from fastapi import HTTPException

        error_msg = f"PDF file not found: {cli_pdf_path}"
        server_logger.error(error_msg)
        raise HTTPException(status_code=404, detail=error_msg)

    @app.get("/api/pdf-info")
    async def pdf_info() -> JSONDict:
        """Get PDF information for the web viewer"""
        return {
            "pdf_path": str(current_pdf_path),
            "display_name": current_pdf_display_name,
            "fixup_module": fixup,
        }

    @app.get("/api/disassembly-status")
    async def get_disassembly_status() -> JSONDict:
        """Get current disassembly status for client polling"""
        return disassembly_status.copy()

    @app.get("/api/structure/{page}")
    async def get_structure(page: int) -> JSONDict:
        """Get structure data for a specific page"""
        server_logger = logging.getLogger("johnny5.server")
        try:
            if not structure_data or not structure_data.get("pages"):
                server_logger.warning(
                    f"Structure data requested but not available. structure_data keys: {list(structure_data.keys()) if structure_data else 'None'}"
                )
                return {"error": "No structure data available"}

            pages = cast(List[JSONDict], structure_data.get("pages", []))
            server_logger.debug(f"Requested page {page}, available pages: {len(pages)}")

            # Find the requested page (1-indexed)
            if page < 1 or page > len(pages):
                return {"error": f"Page {page} not found (available: 1-{len(pages)})"}

            page_data = pages[page - 1]
            return {
                "page": page_data,
                "metadata": structure_data.get("metadata", {}),
                "structure": structure_data.get("structure", {}),
            }

        except Exception as e:
            server_logger.error(f"Error in get_structure: {e}", exc_info=True)
            return {"error": f"Failed to load structure: {str(e)}"}

    @app.get("/api/density/{page}")
    async def get_density(page: int) -> JSONDict:
        """Get density data for visualization"""
        server_logger = logging.getLogger("johnny5.server")
        try:
            if not structure_data or not structure_data.get("pages"):
                server_logger.warning("Density data requested but structure_data not available")
                return {"error": "No density data available"}

            pages = cast(List[JSONDict], structure_data.get("pages", []))

            # Find the requested page (1-indexed)
            if page < 1 or page > len(pages):
                return {"error": f"Page {page} not found (available: 1-{len(pages)})"}

            page_data = pages[page - 1]
            density_data = page_data.get("_density", {})

            if not density_data:
                server_logger.warning(f"Page {page} has no _density data")

            return {
                "x": density_data.get("x", []),
                "y": density_data.get("y", []),
                "page_width": page_data.get("width", 0),
                "page_height": page_data.get("height", 0),
            }

        except Exception as e:
            server_logger.error(f"Error in get_density: {e}", exc_info=True)
            return {"error": f"Failed to load density data: {str(e)}"}

    @app.post("/api/dump-density")
    async def dump_density() -> JSONDict:
        """Dump all density data to a JSON file on disk"""
        try:
            from datetime import datetime

            if not structure_data or not structure_data.get("pages"):
                return {"error": "No density data available"}

            # Extract all density data
            dump_pages: Dict[str, JSONDict] = {}
            dump_data: JSONDict = {
                "timestamp": datetime.now().isoformat(),
                "source_file": "in-memory",
                "pages": dump_pages,
            }

            pages = cast(List[JSONDict], structure_data.get("pages", []))
            for idx, page_data in enumerate(pages, start=1):
                density_data = page_data.get("_density", {})
                if density_data:
                    dump_pages[str(idx)] = {
                        "x": density_data.get("x", []),
                        "y": density_data.get("y", []),
                        "page_width": page_data.get("width", 0),
                        "page_height": page_data.get("height", 0),
                    }

            # Write to dump file
            jny5_home = Path(os.environ.get("JNY5_HOME", Path.home() / ".jny5"))
            dump_dir = jny5_home / "cache" / "dumps"
            dump_dir.mkdir(parents=True, exist_ok=True)

            timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            dump_file = dump_dir / f"y-density-dump-{timestamp_str}.json"

            with open(dump_file, "w", encoding="utf-8") as f:
                json.dump(dump_data, f, indent=2)

            return {
                "success": True,
                "file_path": str(dump_file),
                "pages_dumped": len(dump_data["pages"]),
            }

        except Exception as e:
            return {"error": f"Failed to dump density data: {str(e)}"}

    @app.post("/api/disassemble")
    async def disassemble_pdf(file: UploadFile = File(...)) -> JSONDict:
        """Upload PDF and trigger docling disassembly in background"""
        try:
            jny5_home = Path(os.environ.get("JNY5_HOME", Path.home() / ".jny5"))
            upload_dir = jny5_home / "cache" / "uploads"
            upload_dir.mkdir(parents=True, exist_ok=True)
            original_name = Path(file.filename or "uploaded.pdf").name
            uploaded_pdf = upload_dir / original_name

            disassembly_logger.info(f"Saving uploaded file to: {uploaded_pdf}")
            with open(uploaded_pdf, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            if not uploaded_pdf.exists() or uploaded_pdf.stat().st_size == 0:
                raise ValueError("Uploaded file is empty or was not saved correctly")

            # Set current PDF immediately so it can be viewed
            set_current_pdf(uploaded_pdf, original_name)

            # Trigger background disassembly (non-blocking) with default options
            disassembly_logger.info(
                f"Starting background disassembly for: {file.filename} ({uploaded_pdf.stat().st_size} bytes)"
            )
            default_options = DisassembleOptions()
            asyncio.create_task(run_disassembly_background(uploaded_pdf, fixup, default_options))

            return {
                "success": True,
                "message": f"Upload successful, disassembly started for {file.filename}",
            }
        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            disassembly_logger.error(f"Upload failed: {error_msg}", exc_info=True)
            return {"success": False, "error": error_msg}

    @app.post("/api/disassemble-refresh")  # type: ignore[misc]
    async def disassemble_refresh(options: DisassembleOptions) -> JSONDict:
        """Re-run disassembly on the current server PDF in background"""
        try:
            target_pdf = current_pdf_path
            if not target_pdf.exists():
                return {"success": False, "error": f"PDF file not found: {target_pdf}"}

            disassembly_logger.info(
                f"Starting background refresh for PDF: {target_pdf} "
                f"(layout={options.layout_model}, ocr={options.enable_ocr}, dpi={options.json_dpi})"
            )

            # Trigger background disassembly (non-blocking)
            asyncio.create_task(run_disassembly_background(target_pdf, fixup, options))

            return {
                "success": True,
                "message": f"Disassembly refresh started for {target_pdf.name}",
            }
        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            disassembly_logger.error(f"Disassembly refresh failed: {error_msg}", exc_info=True)
            return {"success": False, "error": error_msg}

    @app.websocket("/logs")
    async def websocket_logs(websocket: WebSocket) -> None:
        """WebSocket endpoint for streaming logs"""
        try:
            await websocket.accept()
            connection_id = f"conn_{len(active_connections)}"
            active_connections[connection_id] = websocket
            print(f"[WebSocket] Client connected: {connection_id}")

            try:
                while True:
                    # Keep connection alive
                    await websocket.receive_text()
            except WebSocketDisconnect:
                print(f"[WebSocket] Client disconnected: {connection_id}")
                if connection_id in active_connections:
                    del active_connections[connection_id]
        except Exception as e:
            print(f"[WebSocket] Connection error: {e}")
            import traceback
            traceback.print_exc()

    # Custom log handler to send logs to WebSocket clients
    class WebSocketLogHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            nonlocal main_loop

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

            # Debug: print to console
            print(f"[WS Log] {record.name}: {record.getMessage()}")

            # Send to all active connections using thread-safe method
            if main_loop and active_connections:
                print(f"[WS Log] Sending to {len(active_connections)} connection(s)")
                async def send_log():
                    for conn_id, websocket in list(active_connections.items()):
                        try:
                            await websocket.send_text(json.dumps(log_entry))
                        except Exception as e:
                            print(f"[WS Log] Failed to send to {conn_id}: {e}")
                            # Remove dead connections
                            if conn_id in active_connections:
                                del active_connections[conn_id]

                try:
                    asyncio.run_coroutine_threadsafe(send_log(), main_loop)
                except Exception as e:
                    print(f"[WS Log] Failed to schedule send: {e}")
            else:
                if not main_loop:
                    print("[WS Log] No main_loop available")
                if not active_connections:
                    print("[WS Log] No active connections")

    # Add the custom handler to the root johnny5 logger to catch all submodules
    handler = WebSocketLogHandler()
    handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    handler.setFormatter(formatter)

    # Attach to root johnny5 logger to catch johnny5.disassembler, johnny5.disassembly, etc.
    johnny5_logger = logging.getLogger("johnny5")
    johnny5_logger.addHandler(handler)
    johnny5_logger.setLevel(logging.DEBUG)

    # Also set levels on specific loggers
    disassembly_logger.setLevel(logging.DEBUG)
    reconstruction_logger.setLevel(logging.DEBUG)

    # Startup event to trigger background disassembly
    @app.on_event("startup")
    async def startup_disassembly() -> None:
        """Run disassembly in background after server starts (if PDF is set)"""
        nonlocal main_loop

        # Capture the main event loop for thread-safe async operations
        main_loop = asyncio.get_running_loop()

        if hasattr(app.state, "startup_pdf_path") and app.state.startup_pdf_path:
            pdf_path = app.state.startup_pdf_path
            fixup_module = app.state.startup_fixup
            if not pdf_path.exists():
                server_logger = logging.getLogger("johnny5.server")
                server_logger.error(f"Startup PDF not found: {pdf_path}")
                print(f"❌ Startup PDF not found: {pdf_path}")
                return
            print(f"🔄 Starting disassembly in background for: {pdf_path}")
            default_options = DisassembleOptions()
            asyncio.create_task(run_disassembly_background(pdf_path, fixup_module, default_options))

    # Store helper functions as app state for testing/external access
    app.state.load_structure_data = load_structure_data
    app.state.set_current_pdf = set_current_pdf
    app.state.run_disassembly_background = run_disassembly_background
    app.state.cli_pdf_path = cli_pdf_path
    # Set startup PDF path and fixup so startup event can trigger disassembly
    app.state.startup_pdf_path = cli_pdf_path
    app.state.startup_fixup = fixup

    return app


def run_web(pdf: Union[str, Path], port: int, fixup: str, color_scheme: str = "dark") -> None:
    """Launch the FastAPI web viewer for Johnny5"""
    import uvicorn
    import logging

    # Create the app
    app = _create_app(pdf, fixup, color_scheme=color_scheme)

    # Resolve PDF path to absolute path
    pdf_path = Path(pdf).resolve()

    print(f"📄 PDF: {pdf_path}")
    print(f"🔧 Fixup: {fixup}")

    if not pdf_path.exists():
        print(f"❌ PDF file not found: {pdf_path}")
        logger = logging.getLogger("johnny5.server")
        logger.error(f"PDF file not found: {pdf_path}")
        return

    # Set current PDF immediately so it can be viewed
    app.state.set_current_pdf(pdf_path, pdf_path.name)

    # Set startup parameters for background disassembly
    app.state.startup_pdf_path = pdf_path
    app.state.startup_fixup = fixup

    print(f"🚀 Starting Johnny5 web viewer on http://localhost:{port}")
    print("📄 PDF will be viewable immediately, annotations will appear when disassembly completes")
    uvicorn.run(app, host="0.0.0.0", port=port)


# Module-level app for Playwright tests (uses environment variables)
# Playwright config expects: `uvicorn src.johnny5.server:app`
_app: Optional[FastAPI] = None


def _create_test_app(cli_pdf_path: Path, fixup_module: str, color_scheme: str = "dark") -> FastAPI:
    """Create an ASGI app for testing purposes.

    This simply delegates to _create_app() to avoid code duplication.
    """
    return _create_app(cli_pdf_path, fixup_module, color_scheme=color_scheme)


def get_app() -> FastAPI:
    """Get or create the module-level app instance for testing"""
    global _app
    if _app is None:
        cli_pdf_path_env = os.environ.get("JOHNNY5_TEST_PDF")
        fixup_module_env = os.environ.get("JOHNNY5_TEST_FIXUP", "")

        if not cli_pdf_path_env:
            raise RuntimeError("JOHNNY5_TEST_PDF environment variable not set")

        cli_pdf_path = Path(cli_pdf_path_env).resolve()
        _app = _create_test_app(cli_pdf_path, fixup_module_env)

    return _app


# Export app getter for uvicorn/Playwright (lazy evaluation)
# For backwards compatibility and testing
# Make app a callable ASGI application that lazily creates the FastAPI instance
class LazyApp:
    """ASGI application wrapper that lazily creates the FastAPI app"""

    def __init__(self) -> None:
        self._app: Optional[FastAPI] = None

    async def __call__(
        self,
        scope: MutableMapping[str, Any],
        receive: Callable[[], Awaitable[MutableMapping[str, Any]]],
        send: Callable[[MutableMapping[str, Any]], Awaitable[None]],
    ) -> None:
        """ASGI interface - creates app on first request if needed"""
        if self._app is None:
            try:
                self._app = get_app()
            except RuntimeError as e:
                # If environment variable not set, return error response
                await send(
                    {
                        "type": "http.response.start",
                        "status": 500,
                        "headers": [[b"content-type", b"text/plain"]],
                    }
                )
                await send(
                    {
                        "type": "http.response.body",
                        "body": f"Configuration error: {str(e)}. Set JOHNNY5_TEST_PDF environment variable.".encode(),
                    }
                )
                return

        # Delegate to the actual FastAPI app
        await self._app(scope, receive, send)


app = LazyApp()
