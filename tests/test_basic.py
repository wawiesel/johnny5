"""Basic tests for Johnny5 package"""

from johnny5 import __version__


def test_version() -> None:
    """Test that version is properly defined"""
    assert isinstance(__version__, str)
    assert len(__version__) > 0


def test_package_imports() -> None:
    """Test that all main functions can be imported"""
    from johnny5 import main, run_disassemble, json_to_qmd, json_to_html, run_web

    assert main is not None
    assert run_disassemble is not None
    assert json_to_qmd is not None
    assert json_to_html is not None
    assert run_web is not None


def test_cli_group() -> None:
    """Test that CLI group is properly configured"""
    from johnny5.cli import main as cli_main

    assert cli_main.name == "main"
    # Test that CLI commands exist (number may vary)
    assert "disassemble" in cli_main.commands
    assert "web" in cli_main.commands


def test_disassembler_api() -> None:
    """Test disassembler API and signature"""
    from johnny5.disassembler import run_disassemble
    import inspect

    # Test that the function exists and has the right signature
    sig = inspect.signature(run_disassemble)
    assert "pdf" in sig.parameters
    assert "enable_ocr" in sig.parameters
    assert "fixup" in sig.parameters
    assert "force_refresh" in sig.parameters


def test_recomposer_placeholder() -> None:
    """Test recomposer placeholder functionality"""
    from johnny5.recomposer import json_to_qmd, json_to_html
    import inspect

    # Test json_to_qmd signature
    sig_qmd = inspect.signature(json_to_qmd)
    assert "json_path" in sig_qmd.parameters
    assert "output_path" in sig_qmd.parameters

    # Test json_to_html signature
    sig_html = inspect.signature(json_to_html)
    assert "json_path" in sig_html.parameters
    assert "output_path" in sig_html.parameters
