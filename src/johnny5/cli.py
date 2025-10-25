import click
from pathlib import Path
from .decomposer import run_decompose
from .server import run_web


@click.group()
def main():
    """Johnny5 — Disassemble. Understand. Reassemble."""
    pass


@main.command()
@click.argument("pdf", type=click.Path(exists=True, path_type=Path))
@click.option("--layout-model", default="pubtables")
@click.option("--enable-ocr", is_flag=True)
@click.option("--json-dpi", default=300)
@click.option("--fixup", default="johnny5.fixups.example_fixup")
def disassemble(pdf, layout_model, enable_ocr, json_dpi, fixup):
    """Disassemble PDF -> Lossless JSON"""
    run_decompose(pdf, layout_model, enable_ocr, json_dpi, fixup)


@main.command()
@click.argument("pdf", type=click.Path(exists=True, path_type=Path))
@click.option("--port", default=8000)
@click.option("--fixup", default="johnny5.fixups.example_fixup")
def web(pdf, port, fixup):
    """Launch the web viewer"""
    run_web(pdf, port, fixup)
