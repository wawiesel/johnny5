from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import (
    Any,
    AsyncGenerator,
    Awaitable,
    Callable,
    Dict,
    List,
    MutableMapping,
    Optional,
    Union,
    cast,
)

from fastapi import FastAPI, Request, Response, UploadFile, File, Query, HTTPException
from pydantic import BaseModel, Field, ConfigDict

from .disassembler import check_docling_version

JSONDict = Dict[str, Any]


class DisassembleOptions(BaseModel):
    """Request body for disassemble-refresh endpoint (Docling 2.0+)"""

    model_config = ConfigDict(populate_by_name=True)  # Allow both snake_case and camelCase

    enable_ocr: bool = Field(default=False, alias="enableOcr")


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
    from fastapi.staticfiles import StaticFiles
    from fastapi.templating import Jinja2Templates
    from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse
    import json
    import logging
    import asyncio
    import shutil
    from .disassembler import run_disassemble, get_available_layout_models, check_docling_version
    from .utils.cache import (
        get_cache_path,
        get_cache_dir,
        generate_disassemble_cache_key,
        get_cached_file,
    )

    app = FastAPI(title="Johnny5 Web Viewer")

    server_logger = logging.getLogger("johnny5.server")

    # Note: main_loop was previously captured but is no longer used
    # Removed to reduce unnecessary state

    # PDF Registry: maps PDF checksum to file path (in-memory, rebuildable)
    pdf_registry: Dict[str, Path] = {}  # pdf_checksum -> pdf_path

    # Job Tracking: per-cache_key job status (in-memory)
    disassembly_jobs: Dict[str, Dict[str, Any]] = {}  # cache_key -> job info

    # Request ID Tracking: maps request_id to clients waiting for that request
    request_notifications: Dict[str, set[str]] = {}  # request_id -> set of instance_ids

    # SSE Client Queues: per-instance_id notification queues
    sse_client_queues: Dict[str, asyncio.Queue[Dict[str, Any]]] = {}  # instance_id -> queue

    # CLI PDF path (for initial load)
    cli_pdf_path: Path = Path(pdf).resolve()

    # Register CLI PDF in registry
    from .utils.cache import calculate_file_checksum

    try:
        cli_pdf_checksum = calculate_file_checksum(cli_pdf_path)
        pdf_registry[cli_pdf_checksum] = cli_pdf_path
    except Exception:
        pass  # Will be registered when PDF is actually used

    def get_pdf_by_checksum(pdf_checksum: str) -> Optional[Path]:
        """Find PDF file by checksum from registry or filesystem"""
        # Check registry first
        if pdf_checksum in pdf_registry:
            pdf_path = pdf_registry[pdf_checksum]
            if pdf_path.exists():
                return pdf_path

        # Check CLI PDF
        if cli_pdf_path.exists():
            try:
                cli_checksum = calculate_file_checksum(cli_pdf_path)
                if cli_checksum == pdf_checksum:
                    pdf_registry[pdf_checksum] = cli_pdf_path
                    return cli_pdf_path
            except Exception:
                pass

        # Check uploads directory
        jny5_home = Path(os.environ.get("JNY5_HOME", Path.home() / ".jny5"))
        upload_dir = jny5_home / "cache" / "uploads"
        if upload_dir.exists():
            for pdf_file in upload_dir.glob("*.pdf"):
                try:
                    file_checksum = calculate_file_checksum(pdf_file)
                    if file_checksum == pdf_checksum:
                        pdf_registry[pdf_checksum] = pdf_file
                        return pdf_file
                except Exception:
                    continue

        return None

    def get_structure_data(cache_key: str) -> JSONDict:
        """Load structure data for a specific cache_key"""
        json_path = get_cache_path(cache_key, "structure")
        try:
            if json_path.exists():
                with open(json_path, "r", encoding="utf-8") as f:
                    data = cast(JSONDict, json.load(f))
                    server_logger.info(
                        f"Loaded {len(data.get('pages', []))} pages from cache {cache_key}"
                    )
                    return data
            else:
                return {}
        except Exception as e:
            server_logger.error(f"Failed to load structure data for {cache_key}: {e}")
            return {}

    def _update_job_status(cache_key: str, status: str, **updates: Any) -> None:
        """Update job status (DRY helper)"""
        nonlocal disassembly_jobs, server_logger
        if cache_key in disassembly_jobs:
            disassembly_jobs[cache_key]["status"] = status
            disassembly_jobs[cache_key].update(updates)
        else:
            # Job doesn't exist - log warning (shouldn't happen in normal flow)
            server_logger.warning(f"Attempted to update status for non-existent job: {cache_key}")

    def _ensure_request_notifications(request_id: str) -> None:
        """Ensure request_notifications entry exists (DRY helper)"""
        nonlocal request_notifications
        if request_id not in request_notifications:
            request_notifications[request_id] = set()

    def _has_structure_data(structure_data: JSONDict) -> bool:
        """Check if structure_data has valid pages (DRY helper)"""
        return bool(structure_data and structure_data.get("pages"))

    async def run_disassembly_background(
        pdf_path: Path,
        fixup_module: str,
        options: DisassembleOptions,
        cache_key: str,
        request_id: str,
        force_refresh: bool = False,
    ) -> None:
        """Run disassembly in background thread and update job status"""
        from datetime import datetime
        import asyncio

        # Update job status to in_progress
        _update_job_status(
            cache_key,
            "in_progress",
            started_at=datetime.now().isoformat(),
            queue_position=0,
            progress=0.0,
        )

        try:
            # Run the synchronous disassembly in a thread pool to avoid blocking
            result_cache_key = await asyncio.to_thread(
                run_disassemble,
                pdf=pdf_path,
                enable_ocr=options.enable_ocr,
                fixup=fixup_module,
                force_refresh=force_refresh,
            )

            # Verify cache_key matches (should always match)
            if result_cache_key != cache_key:
                server_logger.warning(
                    f"Cache key mismatch: expected {cache_key}, got {result_cache_key}"
                )

            # Get log file path
            log_dir = get_cache_dir("logs")
            log_file = log_dir / f"{cache_key}.log"

            # Update job status to completed
            _update_job_status(
                cache_key,
                "completed",
                completed_at=datetime.now().isoformat(),
                progress=1.0,
                queue_position=None,
            )

            # Notify clients waiting for this request_id
            _send_job_notification(request_id, cache_key, "completed", log_file=str(log_file))
            server_logger.info(
                f"[request_id={request_id}] Disassembly completed successfully for cache_key {cache_key}"
            )
        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"

            # Update job status to error
            _update_job_status(
                cache_key, "error", completed_at=datetime.now().isoformat(), error=error_msg
            )

            # Notify clients of error
            _send_job_notification(request_id, cache_key, "error", error=error_msg)
            server_logger.error(
                f"[request_id={request_id}] Disassembly failed for cache_key {cache_key}: {error_msg}",
                exc_info=True,
            )

        # Cleanup: Remove job entry after 1 hour (keep for status lookups, but prevent unbounded growth)
        # Note: In production, you might want a background task to clean up old jobs
        # For now, we'll keep them but could add cleanup logic here

    def _send_job_notification(
        request_id: str,
        cache_key: str,
        status: str,
        log_file: Optional[str] = None,
        error: Optional[str] = None,
    ) -> None:
        """Send job completion notification to all clients subscribed to this request_id"""
        nonlocal request_notifications, sse_client_queues, server_logger

        notification = {
            "type": "job_complete",
            "request_id": request_id,
            "cache_key": cache_key,
            "status": status,
        }
        if log_file:
            notification["log_file"] = log_file
        if error:
            notification["error"] = error

        # Send notification only to clients subscribed to this request_id
        if request_id in request_notifications:
            notified_count = 0
            for instance_id in request_notifications[request_id]:
                if instance_id in sse_client_queues:
                    try:
                        sse_client_queues[instance_id].put_nowait(notification)
                        notified_count += 1
                    except Exception as e:
                        server_logger.warning(
                            f"[SSE] Error sending notification to {instance_id}: {e}"
                        )
            if notified_count == 0:
                server_logger.warning(
                    f"[SSE] No active clients to notify for request_id={request_id}, cache_key={cache_key}"
                )
        else:
            server_logger.warning(
                f"[SSE] No subscribers for request_id={request_id}, cache_key={cache_key} (notification dropped)"
            )

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
            {"request": request, "color_scheme": color_scheme},
        )

    @app.get("/api/pdf")
    async def serve_pdf(pdf_checksum: str = Query(...)) -> FileResponse:
        """Serve the PDF file for PDF.js by checksum"""
        pdf_path = get_pdf_by_checksum(pdf_checksum)
        if not pdf_path or not pdf_path.exists():
            raise HTTPException(
                status_code=404, detail=f"PDF not found for checksum: {pdf_checksum}"
            )

        return FileResponse(pdf_path, media_type="application/pdf")

    @app.get("/api/pdf-info")
    async def pdf_info(pdf_checksum: Optional[str] = Query(None)) -> JSONDict:
        """Get PDF information for the web viewer by checksum or CLI PDF"""
        # If no checksum provided, use CLI PDF (for initial load)
        if not pdf_checksum:
            if cli_pdf_path.exists():
                pdf_path = cli_pdf_path
            else:
                raise HTTPException(status_code=404, detail="No PDF available")
        else:
            pdf_path_optional = get_pdf_by_checksum(pdf_checksum)
            if not pdf_path_optional:
                raise HTTPException(
                    status_code=404, detail=f"PDF not found for checksum: {pdf_checksum}"
                )
            pdf_path = pdf_path_optional

        checksum = None
        try:
            checksum = calculate_file_checksum(pdf_path)
            # Register in registry if not already there
            if checksum not in pdf_registry:
                pdf_registry[checksum] = pdf_path
        except Exception as e:
            server_logger.warning(f"Could not calculate PDF checksum: {e}")

        return {
            "pdf_path": str(pdf_path),
            "display_name": pdf_path.name,
            "fixup_module": fixup,
            "checksum": checksum,
        }

    @app.get("/api/disassembly-status")
    async def get_disassembly_status(
        pdf_checksum: str = Query(...),
        cache_key: str = Query(...),
    ) -> JSONDict:
        """Get disassembly status for a specific cache_key"""
        if get_pdf_by_checksum(pdf_checksum) is None:
            raise HTTPException(
                status_code=404, detail=f"PDF not found for checksum: {pdf_checksum}"
            )

        if cache_key in disassembly_jobs:
            job = disassembly_jobs[cache_key].copy()
            job_pdf_checksum = job.get("pdf_checksum")
            if job_pdf_checksum and job_pdf_checksum != pdf_checksum:
                raise HTTPException(
                    status_code=400,
                    detail="Cache key does not belong to the provided PDF checksum",
                )

            # Calculate queue position (number of jobs ahead in queue)
            # Compare ISO date strings properly (they sort lexicographically)
            queue_position = 0
            job_started_at = job.get("started_at", "")
            if job_started_at:  # Only compare if we have a start time
                for other_cache_key, other_job in disassembly_jobs.items():
                    if other_cache_key != cache_key and other_job.get("status") == "in_progress":
                        other_started_at = other_job.get("started_at", "")
                        if other_started_at and other_started_at < job_started_at:
                            queue_position += 1

            job["queue_position"] = queue_position
            return job

        # Job doesn't exist - check if cache exists for this PDF
        cached_file = get_cached_file(cache_key, "structure")
        if cached_file:
            structure_data = get_structure_data(cache_key)
            metadata = structure_data.get("metadata") if structure_data else None
            cached_pdf_checksum = (
                metadata.get("pdf_checksum") if isinstance(metadata, dict) else None
            )

            if cached_pdf_checksum is None:
                raise HTTPException(
                    status_code=500,
                    detail=f"Cached structure for {cache_key} is missing pdf_checksum metadata",
                )

            if cached_pdf_checksum != pdf_checksum:
                raise HTTPException(
                    status_code=400,
                    detail="Cache key does not belong to the provided PDF checksum",
                )

            return {
                "status": "completed",
                "cache_key": cache_key,
                "cache_exists": True,
            }

        return {
            "status": "pending",
            "cache_key": cache_key,
            "cache_exists": False,
        }

    @app.get("/api/layout-models")
    async def get_layout_models() -> JSONDict:
        """Get available Docling layout models with descriptions"""
        models = get_available_layout_models()
        return {"models": models}

    @app.post("/api/check-cache")
    async def check_cache(
        pdf_checksum: str = Query(...),
        instance_id: str = Query(...),
        options: Optional[DisassembleOptions] = None,
    ) -> JSONDict:
        """Check if cache exists for given PDF and options, return cache key"""
        if options is None:
            options = DisassembleOptions()

        pdf_path = get_pdf_by_checksum(pdf_checksum)
        if not pdf_path:
            raise HTTPException(
                status_code=404, detail=f"PDF not found for checksum: {pdf_checksum}"
            )

        try:
            # Generate cache key for these options
            cache_key, _ = generate_disassemble_cache_key(
                pdf_path,
                options.enable_ocr,
            )

            # Check if cache file exists
            cached_file = get_cached_file(cache_key, "structure")

            server_logger.info(
                f"[instance_id={instance_id}] Cache check for cache_key {cache_key}: {'exists' if cached_file else 'missing'}"
            )

            return {
                "cache_exists": cached_file is not None,
                "cache_key": cache_key,
                "options": {
                    "enable_ocr": options.enable_ocr,
                },
            }
        except Exception as e:
            server_logger.error(f"[instance_id={instance_id}] Cache check failed: {e}")
            return {"cache_exists": False, "cache_key": None, "error": str(e)}

    @app.post("/api/load-cache")
    async def load_cache(
        pdf_checksum: str = Query(...),
        cache_key: str = Query(...),
        instance_id: str = Query(...),
    ) -> JSONDict:
        """Load structure data from cache for given cache_key"""
        try:
            # Get structure data for this cache_key
            structure_data = get_structure_data(cache_key)

            if not _has_structure_data(structure_data):
                return {
                    "success": False,
                    "error": "Cache not found for this cache_key",
                    "cache_key": cache_key,
                }

            server_logger.info(f"[instance_id={instance_id}] Loaded cache {cache_key}")

            return {
                "success": True,
                "cache_key": cache_key,
                "pages": len(structure_data.get("pages", [])),
            }
        except Exception as e:
            server_logger.error(f"[instance_id={instance_id}] Error loading cache {cache_key}: {e}")
            return {"success": False, "error": str(e)}

    @app.get("/api/structure/{page}")
    async def get_structure(
        page: int,
        cache_key: str = Query(...),
    ) -> JSONDict:
        """Get structure data for a specific page by cache_key"""
        try:
            structure_data = get_structure_data(cache_key)

            if not _has_structure_data(structure_data):
                return {"error": "No structure data available for this cache_key"}

            pages = cast(List[JSONDict], structure_data.get("pages", []))

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
            server_logger.error(
                f"Error in get_structure for cache_key {cache_key}: {e}", exc_info=True
            )
            return {"error": f"Failed to load structure: {str(e)}"}

    @app.get("/api/density/{page}")
    async def get_density(
        page: int,
        cache_key: str = Query(...),
    ) -> JSONDict:
        """Get density data for visualization by cache_key"""
        try:
            structure_data = get_structure_data(cache_key)

            if not _has_structure_data(structure_data):
                server_logger.warning(
                    f"Density data requested but structure_data not available for cache_key {cache_key}"
                )
                return {"error": "No density data available"}

            pages = cast(List[JSONDict], structure_data.get("pages", []))

            # Find the requested page (1-indexed)
            if page < 1 or page > len(pages):
                return {"error": f"Page {page} not found (available: 1-{len(pages)})"}

            page_data = pages[page - 1]
            density_data = page_data.get("_density", {})

            if not density_data:
                server_logger.warning(f"Page {page} has no _density data for cache_key {cache_key}")

            return {
                "x": density_data.get("x", []),
                "y": density_data.get("y", []),
                "page_width": page_data.get("width", 0),
                "page_height": page_data.get("height", 0),
            }

        except Exception as e:
            server_logger.error(
                f"Error in get_density for cache_key {cache_key}: {e}", exc_info=True
            )
            return {"error": f"Failed to load density data: {str(e)}"}

    @app.post("/api/dump-density")
    async def dump_density(
        cache_key: str = Query(...),
    ) -> JSONDict:
        """Dump all density data to a JSON file on disk"""
        try:
            from datetime import datetime

            structure_data = get_structure_data(cache_key)
            if not _has_structure_data(structure_data):
                return {"error": "No density data available for this cache_key"}

            # Extract all density data
            dump_pages: Dict[str, JSONDict] = {}
            dump_data: JSONDict = {
                "timestamp": datetime.now().isoformat(),
                "source_file": f"cache_key_{cache_key}",
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
            server_logger.error(
                f"Error dumping density data for cache_key {cache_key}: {e}", exc_info=True
            )
            return {"error": f"Failed to dump density data: {str(e)}"}

    @app.post("/api/disassemble")
    async def disassemble_pdf(
        file: UploadFile = File(...),
        instance_id: str = Query(...),
    ) -> JSONDict:
        """Upload PDF and return pdf_checksum"""
        try:
            jny5_home = Path(os.environ.get("JNY5_HOME", Path.home() / ".jny5"))
            upload_dir = jny5_home / "cache" / "uploads"
            upload_dir.mkdir(parents=True, exist_ok=True)
            original_name = Path(file.filename or "uploaded.pdf").name
            uploaded_pdf = upload_dir / original_name

            server_logger.info(
                f"[instance_id={instance_id}] Saving uploaded file to: {uploaded_pdf}"
            )
            with open(uploaded_pdf, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            if not uploaded_pdf.exists() or uploaded_pdf.stat().st_size == 0:
                raise ValueError("Uploaded file is empty or was not saved correctly")

            # Calculate PDF checksum and register in registry
            pdf_checksum = calculate_file_checksum(uploaded_pdf)
            pdf_registry[pdf_checksum] = uploaded_pdf

            server_logger.info(
                f"[instance_id={instance_id}] Upload successful: {file.filename}, pdf_checksum={pdf_checksum}"
            )

            return {
                "success": True,
                "pdf_checksum": pdf_checksum,
                "display_name": original_name,
                "message": f"Upload successful for {file.filename}",
            }
        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            server_logger.error(
                f"[instance_id={instance_id}] Upload failed: {error_msg}", exc_info=True
            )
            return {"success": False, "error": error_msg}

    @app.post("/api/disassemble-refresh")
    async def disassemble_refresh(
        pdf_checksum: str = Query(...),
        instance_id: str = Query(...),
        options: Optional[DisassembleOptions] = None,
        force: bool = Query(default=False),
    ) -> JSONDict:
        """Request disassembly for a PDF with given options

        Returns: {cache_key, cache_exists, request_id}
        """

        if options is None:
            options = DisassembleOptions()

        try:
            # Get PDF by checksum
            pdf_path = get_pdf_by_checksum(pdf_checksum)
            if not pdf_path:
                raise HTTPException(
                    status_code=404, detail=f"PDF not found for checksum: {pdf_checksum}"
                )

            # Generate cache_key from PDF checksum + options
            cache_key, _ = generate_disassemble_cache_key(pdf_path, options.enable_ocr)

            # Check if cache exists
            cached_file = get_cached_file(cache_key, "structure")
            cache_exists = cached_file is not None and not force

            server_logger.info(
                f"[instance_id={instance_id}] Disassembly request: pdf_checksum={pdf_checksum}, cache_key={cache_key}, cache_exists={cache_exists}, force={force}"
            )

            # If cache exists and not forcing, return immediately
            if cache_exists:
                return {
                    "success": True,
                    "cache_key": cache_key,
                    "cache_exists": True,
                    "request_id": None,  # No job needed
                }

            # Check if job already exists for this cache_key
            request_id: Optional[str] = None
            if cache_key in disassembly_jobs:
                job = disassembly_jobs[cache_key]
                job_status = job.get("status")

                if job_status in {"in_progress", "pending"}:
                    # Job already in progress - reuse existing request_id
                    request_id = job.get("request_id")
                    if not request_id:
                        # Create request_id if not found (shouldn't happen, but handle gracefully)
                        request_id = str(uuid.uuid4())
                        job["request_id"] = request_id
                    assert request_id is not None
                    _ensure_request_notifications(request_id)

                    # Add this instance_id to the notification list
                    request_notifications[request_id].add(instance_id)

                    server_logger.info(
                        f"[instance_id={instance_id}] Reusing existing job for cache_key {cache_key}, request_id={request_id}"
                    )

                    return {
                        "success": True,
                        "cache_key": cache_key,
                        "cache_exists": False,
                        "request_id": request_id,
                    }
                if job_status == "completed":
                    # Job completed but cache might not exist yet (race condition)
                    # Check cache again
                    if get_cached_file(cache_key, "structure"):
                        return {
                            "success": True,
                            "cache_key": cache_key,
                            "cache_exists": True,
                            "request_id": None,
                        }
                if job_status == "error":
                    # Previous job failed - allow retry by creating new job
                    server_logger.info(
                        f"[instance_id={instance_id}] Previous job for cache_key {cache_key} failed, creating new job"
                    )
                    # Fall through to create new job

            # Create new job
            request_id = str(uuid.uuid4())

            # Create or update job entry (use helper if it exists, otherwise direct assignment)
            disassembly_jobs[cache_key] = {
                "status": "pending",
                "cache_key": cache_key,
                "pdf_checksum": pdf_checksum,
                "options": {"enable_ocr": options.enable_ocr},
                "request_id": request_id,
                "started_at": None,
                "completed_at": None,
                "queue_position": None,
                "estimated_time": None,
                "progress": 0.0,
            }

            # Track this instance_id for notifications (ensure entry exists)
            _ensure_request_notifications(request_id)
            request_notifications[request_id].add(instance_id)

            # Start background disassembly
            asyncio.create_task(
                run_disassembly_background(
                    pdf_path, fixup, options, cache_key, request_id, force_refresh=force
                )
            )

            server_logger.info(
                f"[instance_id={instance_id}] Started new job: cache_key={cache_key}, request_id={request_id}"
            )

            return {
                "success": True,
                "cache_key": cache_key,
                "cache_exists": False,
                "request_id": request_id,
            }

        except HTTPException:
            raise
        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            server_logger.error(
                f"[instance_id={instance_id}] Disassembly refresh failed: {error_msg}",
                exc_info=True,
            )
            return {"success": False, "error": error_msg}

    @app.get("/api/events")
    async def sse_events(instance_id: str = Query(...)) -> StreamingResponse:
        """Server-Sent Events endpoint for completion notifications only"""

        async def event_generator() -> AsyncGenerator[str, None]:
            # Create a queue for this instance_id
            client_queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()
            sse_client_queues[instance_id] = client_queue

            try:
                # Connection established (no initial message needed)
                while True:
                    try:
                        # Wait for notifications from this client's queue
                        notification = await asyncio.wait_for(client_queue.get(), timeout=30.0)
                        yield f"data: {json.dumps(notification)}\n\n"
                    except asyncio.TimeoutError:
                        # Send keepalive comment every 30 seconds
                        yield ": keepalive\n\n"
                    except Exception as e:
                        server_logger.warning(
                            f"[SSE] Error sending notification to {instance_id}: {e}"
                        )
                        break
            finally:
                # Remove this client's queue when connection closes
                if instance_id in sse_client_queues:
                    del sse_client_queues[instance_id]
                # Cleanup: Remove this instance_id from all request_notifications
                # (prevents unbounded growth if client disconnects without cleanup)
                for request_id in list(request_notifications.keys()):
                    request_notifications[request_id].discard(instance_id)
                    # Remove empty request_notifications entries
                    if not request_notifications[request_id]:
                        del request_notifications[request_id]

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable nginx buffering
            },
        )

    # Note: Log messages are no longer sent via SSE
    # Client generates log messages from status transitions
    # Server logs go to console/file only

    # Startup event to capture event loop and trigger disassembly
    @app.on_event("startup")
    async def startup_init() -> None:
        """Initialize server - check Docling version requirement"""
        # Check Docling version requirement
        try:
            check_docling_version()
        except RuntimeError as e:
            server_logger.error(str(e))
            print(f"❌ {e}")
            raise

        # Note: Disassembly is now triggered by frontend after checking cache
        # Frontend will check cache first, and only force refresh when user clicks button

    # Store helper functions as app state for testing/external access
    app.state.get_pdf_by_checksum = get_pdf_by_checksum
    app.state.get_structure_data = get_structure_data
    app.state.run_disassembly_background = run_disassembly_background
    app.state.cli_pdf_path = cli_pdf_path
    app.state.pdf_registry = pdf_registry
    app.state.disassembly_jobs = disassembly_jobs
    app.state.request_notifications = request_notifications
    app.state.startup_fixup = fixup

    return app


def run_web(pdf: Union[str, Path], port: int, fixup: str, color_scheme: str = "dark") -> None:
    """Launch the FastAPI web viewer for Johnny5"""
    import uvicorn
    import logging

    logger = logging.getLogger("johnny5.server")

    # Check Docling version requirement before starting server
    try:
        check_docling_version()
    except RuntimeError as e:
        logger.error(str(e))
        print(f"❌ {e}")
        return

    # Create the app
    app = _create_app(pdf, fixup, color_scheme=color_scheme)

    # Resolve PDF path to absolute path
    pdf_path = Path(pdf).resolve()

    print(f"📄 PDF: {pdf_path}")
    print(f"🔧 Fixup: {fixup}")

    if not pdf_path.exists():
        print(f"❌ PDF file not found: {pdf_path}")
        logger.error(f"PDF file not found: {pdf_path}")
        return

    # PDF is registered in pdf_registry during app creation
    # No need to set current PDF - clients specify by checksum

    print(f"🚀 Starting Johnny5 web viewer on http://localhost:{port}")
    print("📄 PDF will be viewable immediately, annotations will appear when disassembly completes")

    # Bind to localhost for local development (WebSocket origin validation works better)
    uvicorn.run(app, host="127.0.0.1", port=port)


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
