"""
QMD Quality Checker for Johnny5.

This module provides quality checks for Quarto Markdown files,
including table alignment validation and other formatting checks.
"""

import re
from pathlib import Path
from typing import Any, Dict, List


class QMDChecker:
    """Quality checker for QMD files."""

    def __init__(self, file_path: Path):
        self.file_path = file_path
        self.content = self._read_file()
        self.issues: List[str] = []

    def _read_file(self) -> str:
        """Read the QMD file content."""
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            self.issues.append(f"Error reading file: {e}")
            return ""

    def check_all(self) -> Dict[str, Any]:
        """Run all quality checks."""
        issues: List[str] = []
        checks: Dict[str, Dict[str, Any]] = {}
        results: Dict[str, Any] = {
            "file": str(self.file_path),
            "issues": issues,
            "checks": checks,
        }

        # Run individual checks
        checks["table_alignment"] = self.check_table_alignment()
        checks["yaml_frontmatter"] = self.check_yaml_frontmatter()
        checks["markdown_syntax"] = self.check_markdown_syntax()

        # Collect all issues
        for check_result in checks.values():
            check_issues = check_result.get("issues", [])
            if isinstance(check_issues, list):
                issues.extend(str(issue) for issue in check_issues)

        return results

    def check_table_alignment(self) -> Dict[str, Any]:
        """Check if tables have properly aligned columns."""
        issues: List[str] = []
        tables_found = 0
        tables_aligned = 0

        lines: List[str] = self.content.split("\n")
        in_table = False
        table_lines = []
        table_start_line = 0

        for i, line in enumerate(lines, 1):
            # Check if this line is a table row
            if self._is_table_row(line):
                if not in_table:
                    # Start new table
                    in_table = True
                    table_lines = [line]
                    table_start_line = i
                else:
                    # Continue existing table
                    table_lines.append(line)
            elif in_table:
                # End of table (empty line or non-table content)
                if len(table_lines) >= 2:  # Only check tables with at least header + 1 row
                    alignment_result = self._check_table_alignment(table_lines, table_start_line)
                    tables_found += 1
                    if alignment_result["aligned"]:
                        tables_aligned += 1
                    else:
                        issues.extend(alignment_result["issues"])

                in_table = False
                table_lines = []

        # Check final table if file ends with one
        if in_table and table_lines and len(table_lines) >= 2:
            alignment_result = self._check_table_alignment(table_lines, table_start_line)
            tables_found += 1
            if alignment_result["aligned"]:
                tables_aligned += 1
            else:
                issues.extend(alignment_result["issues"])

        return {
            "issues": issues,
            "tables_found": tables_found,
            "tables_aligned": tables_aligned,
            "all_aligned": tables_found == tables_aligned,
        }

    def _is_table_header(self, line: str) -> bool:
        """Check if line is a table header."""
        return bool(re.match(r"^\s*\|.*\|.*\|", line.strip()))

    def _is_table_row(self, line: str) -> bool:
        """Check if line is a table row."""
        return bool(re.match(r"^\s*\|.*\|", line.strip()))

    def _check_table_alignment(self, table_lines: List[str], start_line: int) -> Dict[str, Any]:
        """Check alignment of a specific table."""
        if len(table_lines) < 2:
            return {"aligned": True, "issues": []}

        issues = []

        # Find pipe positions in first line
        first_line = table_lines[0]
        pipe_positions = [m.start() for m in re.finditer(r"\|", first_line)]

        if len(pipe_positions) < 2:
            return {"aligned": True, "issues": []}

        # Check each subsequent line
        for i, line in enumerate(table_lines[1:], 1):
            line_pipe_positions = [m.start() for m in re.finditer(r"\|", line)]

            # Check if pipe positions match
            if len(line_pipe_positions) != len(pipe_positions):
                issues.append(f"Line {start_line + i}: Table has inconsistent number of columns")
                continue

            # Check if pipes are aligned
            for j, (expected_pos, actual_pos) in enumerate(
                zip(pipe_positions, line_pipe_positions)
            ):
                if expected_pos != actual_pos:
                    issues.append(
                        f"Line {start_line + i}, column {j + 1}: Pipe misaligned "
                        f"(expected position {expected_pos}, found at {actual_pos})"
                    )

        return {"aligned": len(issues) == 0, "issues": issues}

    def check_yaml_frontmatter(self) -> Dict[str, Any]:
        """Check YAML frontmatter formatting."""
        issues = []

        if not self.content.startswith("---"):
            issues.append("Missing YAML frontmatter")
            return {"issues": issues, "has_frontmatter": False}

        # Find end of frontmatter
        lines = self.content.split("\n")
        frontmatter_end = -1

        for i, line in enumerate(lines[1:], 1):
            if line.strip() == "---":
                frontmatter_end = i
                break

        if frontmatter_end == -1:
            issues.append("YAML frontmatter not properly closed")
            return {"issues": issues, "has_frontmatter": False}

        # Check frontmatter content
        frontmatter_lines = lines[1:frontmatter_end]

        # Check for common required fields
        frontmatter_text = "\n".join(frontmatter_lines)

        if "title:" not in frontmatter_text:
            issues.append("Missing 'title' in frontmatter")

        if "format:" not in frontmatter_text:
            issues.append("Missing 'format' in frontmatter")

        return {
            "issues": issues,
            "has_frontmatter": True,
            "frontmatter_lines": len(frontmatter_lines),
        }

    def check_markdown_syntax(self) -> Dict[str, Any]:
        """Check basic markdown syntax issues."""
        issues = []

        lines = self.content.split("\n")

        # Check for common issues
        for i, line in enumerate(lines, 1):
            # Check for trailing whitespace
            if line.endswith(" ") or line.endswith("\t"):
                issues.append(f"Line {i}: Trailing whitespace")

            # Check for inconsistent heading levels
            if re.match(r"^#{4,}", line.strip()):
                issues.append(f"Line {i}: Heading level 4+ (consider restructuring)")

        return {"issues": issues, "total_lines": len(lines)}


def check_qmd_file(file_path: Path) -> Dict[str, Any]:
    """Check a QMD file for quality issues."""
    checker = QMDChecker(file_path)
    return checker.check_all()


def format_check_results(results: Dict[str, Any]) -> str:
    """Format check results for display."""
    output = []

    output.append(f"QMD Quality Check: {results['file']}")
    output.append("=" * 50)

    if not results["issues"]:
        output.append("✅ All checks passed!")
        return "\n".join(output)

    # Show summary
    output.append(f"❌ Found {len(results['issues'])} issues:")
    output.append("")

    # Group issues by check type
    for check_name, check_result in results["checks"].items():
        if check_result.get("issues"):
            output.append(f"{check_name.replace('_', ' ').title()}:")
            for issue in check_result["issues"]:
                output.append(f"  • {issue}")
            output.append("")

    # Show all issues
    if results["issues"]:
        output.append("All Issues:")
        for issue in results["issues"]:
            output.append(f"  • {issue}")

    return "\n".join(output)
