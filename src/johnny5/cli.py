import click
import subprocess
import sys
import warnings
import tempfile
import shutil
from pathlib import Path
from .decomposer import run_decompose
from .server import run_web
from .qmd_checker import check_qmd_file, format_check_results

# Suppress RuntimeWarning about module loading
warnings.filterwarnings("ignore", category=RuntimeWarning, module="runpy")


@click.group()
def main() -> None:
    """Johnny5 — Disassemble. Understand. Reassemble."""
    pass


@main.command()
@click.argument("pdf", type=click.Path(exists=True, path_type=Path))
@click.option("--layout-model", default="pubtables")
@click.option("--enable-ocr", is_flag=True)
@click.option("--json-dpi", default=300)
@click.option("--fixup", default="johnny5.fixups.example_fixup")
def disassemble(pdf: Path, layout_model: str, enable_ocr: bool, json_dpi: int, fixup: str) -> None:
    """Disassemble PDF -> Lossless JSON"""
    run_decompose(pdf, layout_model, enable_ocr, json_dpi, fixup)


@main.command()
@click.argument("pdf", type=click.Path(exists=True, path_type=Path))
@click.option("--port", default=8000)
@click.option("--fixup", default="johnny5.fixups.example_fixup")
def web(pdf: Path, port: int, fixup: str) -> None:
    """Launch the web viewer"""
    run_web(pdf, port, fixup)


@main.command()
@click.argument("qmd_file", type=click.Path(exists=True, path_type=Path))
def qmd(qmd_file: Path) -> None:
    """Check QMD file for quality issues including table alignment"""
    try:
        results = check_qmd_file(qmd_file)
        formatted_output = format_check_results(results)
        print(formatted_output)

        # Exit with error code if issues found
        if results["issues"]:
            raise click.ClickException("QMD quality check failed")

    except click.ClickException:
        raise
    except Exception as e:
        raise click.ClickException(f"Error checking QMD file: {e}")


@main.command()
@click.argument("qmd_file", type=click.Path(exists=True, path_type=Path))
def pdf(qmd_file: Path) -> None:
    """Render QMD file to PDF using Quarto"""
    try:
        # Create a temporary directory for Quarto rendering
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Copy the QMD file to the temporary directory
            temp_qmd = temp_path / qmd_file.name
            shutil.copy2(qmd_file, temp_qmd)

            # Run quarto render command in the temporary directory
            cmd = ["quarto", "render", str(temp_qmd), "--to", "pdf"]

            subprocess.run(cmd, capture_output=True, text=True, check=True)

            # Copy the generated PDF back to the original directory
            temp_pdf = temp_path / f"{qmd_file.stem}.pdf"
            final_pdf = qmd_file.parent / f"{qmd_file.stem}.pdf"
            shutil.copy2(temp_pdf, final_pdf)

            # Clean up any auxiliary files that Quarto might have created in the original directory
            aux_extensions = [".aux", ".log", ".out", ".toc", ".fdb_latexmk", ".fls", ".synctex.gz"]
            for ext in aux_extensions:
                aux_file = qmd_file.parent / f"{qmd_file.stem}{ext}"
                if aux_file.exists():
                    aux_file.unlink()

            print(f"✅ PDF generated: {final_pdf}")

    except subprocess.CalledProcessError as e:
        print(f"❌ Error rendering QMD to PDF: {e}")
        print(f"Quarto output: {e.stderr}")
        sys.exit(1)
    except FileNotFoundError:
        print("❌ Quarto not found. Please install Quarto to render QMD files to PDF.")
        sys.exit(1)
