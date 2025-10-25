def run_web(pdf, port, fixup):
    """Launch the FastAPI web viewer for Johnny5"""
    from fastapi import FastAPI
    from fastapi.staticfiles import StaticFiles
    from fastapi.templating import Jinja2Templates
    from fastapi.responses import HTMLResponse
    from fastapi import Request
    import uvicorn
    from pathlib import Path

    app = FastAPI(title="Johnny5 Web Viewer")

    # Mount static files
    static_path = Path(__file__).parent / "web" / "static"
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

    # Setup templates
    templates_path = Path(__file__).parent / "web" / "templates"
    templates = Jinja2Templates(directory=str(templates_path))

    @app.get("/", response_class=HTMLResponse)
    async def root(request: Request):
        return templates.TemplateResponse("index.html", {"request": request, "pdf_path": str(pdf)})

    @app.get("/api/pdf-info")
    async def pdf_info():
        """Get PDF information for the web viewer"""
        return {"pdf_path": str(pdf), "fixup_module": fixup}

    print(f"🚀 Starting Johnny5 web viewer on http://localhost:{port}")
    print(f"📄 PDF: {pdf}")
    print(f"🔧 Fixup: {fixup}")

    uvicorn.run(app, host="0.0.0.0", port=port)
