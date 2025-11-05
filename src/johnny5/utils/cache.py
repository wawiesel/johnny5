"""Cache key generation and management for Johnny5.

This module implements content-based caching where inputs are checksummed
to generate cache keys, and outputs are stored with filenames equal to those keys.

Cache key generation follows the spec:
- Disassemble: SHA-256(PDF content + Docling options)
- Fixup: SHA-256(structure.json content + fixup.py content)
- Extract: SHA-256(fstructure.json content + extract.py content)
- Reconstruct: SHA-256(content.json content + reconstruct.py content)

All cache keys are 16-character truncated SHA-256 hashes.
"""

import hashlib
import json
import os
from pathlib import Path
from typing import Any, Optional


def calculate_file_checksum(file_path: Path) -> str:
    """Calculate SHA-256 checksum of a file.

    Args:
        file_path: Path to file to checksum

    Returns:
        Full 64-character hexadecimal SHA-256 checksum

    Example:
        >>> calculate_file_checksum(Path("doc.pdf"))
        'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2'
    """
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        # Read file in chunks to handle large files efficiently
        for chunk in iter(lambda: f.read(8192), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def generate_cache_key(*inputs: Any) -> str:
    """Generate a 16-character cache key from inputs using SHA-256.

    Args:
        *inputs: Variable number of inputs to hash. Can be:
            - Path objects (will read file content)
            - Dicts (will serialize to sorted JSON)
            - Strings (will encode to UTF-8)
            - Bytes (will use directly)

    Returns:
        16-character hexadecimal cache key

    Example:
        >>> generate_cache_key(Path("doc.pdf"), {"ocr": True})
        'a1b2c3d4e5f6g7h8'
    """
    hasher = hashlib.sha256()

    for inp in inputs:
        if isinstance(inp, Path):
            # Read file content
            if inp.exists():
                hasher.update(inp.read_bytes())
            else:
                # If file doesn't exist, hash the path string as fallback
                hasher.update(str(inp).encode("utf-8"))
        elif isinstance(inp, dict):
            # Serialize dict to sorted JSON for deterministic hashing
            json_str = json.dumps(inp, sort_keys=True, ensure_ascii=False)
            hasher.update(json_str.encode("utf-8"))
        elif isinstance(inp, str):
            hasher.update(inp.encode("utf-8"))
        elif isinstance(inp, bytes):
            hasher.update(inp)
        else:
            # Fallback: convert to string
            hasher.update(str(inp).encode("utf-8"))

    # Return first 16 characters of hex digest
    return hasher.hexdigest()[:16]


def get_cache_dir(stage: str) -> Path:
    """Get the cache directory for a specific stage.

    Args:
        stage: One of 'structure', 'content', 'qmd'

    Returns:
        Path to cache directory (creates if doesn't exist)

    Example:
        >>> get_cache_dir('structure')
        Path('/Users/ww5/.jny5/cache/structure')
    """
    jny5_home = Path(os.environ.get("JNY5_HOME", Path.home() / ".jny5"))
    cache_dir = jny5_home / "cache" / stage
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def get_cached_file(cache_key: str, stage: str, extension: str = "json") -> Optional[Path]:
    """Check if a cached file exists for the given cache key.

    Args:
        cache_key: 16-character cache key
        stage: Cache stage ('structure', 'content', 'qmd')
        extension: File extension (default: 'json')

    Returns:
        Path to cached file if it exists, None otherwise

    Example:
        >>> get_cached_file('a1b2c3d4e5f6g7h8', 'structure')
        Path('/Users/ww5/.jny5/cache/structure/a1b2c3d4e5f6g7h8.json')
    """
    cache_dir = get_cache_dir(stage)
    cache_file = cache_dir / f"{cache_key}.{extension}"
    return cache_file if cache_file.exists() else None


def get_cache_path(cache_key: str, stage: str, extension: str = "json") -> Path:
    """Get the cache file path for a given cache key (doesn't check existence).

    Args:
        cache_key: 16-character cache key
        stage: Cache stage ('structure', 'content', 'qmd')
        extension: File extension (default: 'json')

    Returns:
        Path to cache file (may or may not exist)

    Example:
        >>> get_cache_path('a1b2c3d4e5f6g7h8', 'structure')
        Path('/Users/ww5/.jny5/cache/structure/a1b2c3d4e5f6g7h8.json')
    """
    cache_dir = get_cache_dir(stage)
    return cache_dir / f"{cache_key}.{extension}"


def save_to_cache(data: Any, cache_key: str, stage: str, extension: str = "json") -> Path:
    """Save data to cache with the given cache key.

    Args:
        data: Data to save (dict for JSON, str for text)
        cache_key: 16-character cache key
        stage: Cache stage ('structure', 'content', 'qmd')
        extension: File extension (default: 'json')

    Returns:
        Path to saved cache file

    Example:
        >>> save_to_cache({'metadata': {}}, 'a1b2c3d4e5f6g7h8', 'structure')
        Path('/Users/ww5/.jny5/cache/structure/a1b2c3d4e5f6g7h8.json')
    """
    cache_dir = get_cache_dir(stage)
    cache_file = cache_dir / f"{cache_key}.{extension}"

    if extension == "json":
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    else:
        # Text format
        content = data if isinstance(data, str) else str(data)
        cache_file.write_text(content, encoding="utf-8")

    return cache_file


def load_from_cache(cache_key: str, stage: str, extension: str = "json") -> Any:
    """Load data from cache by cache key.

    Args:
        cache_key: 16-character cache key
        stage: Cache stage ('structure', 'content', 'qmd')
        extension: File extension (default: 'json')

    Returns:
        Loaded data (dict for JSON, str for text)

    Raises:
        FileNotFoundError: If cache file doesn't exist

    Example:
        >>> load_from_cache('a1b2c3d4e5f6g7h8', 'structure')
        {'metadata': {}, 'pages': [...]}
    """
    cache_file = get_cached_file(cache_key, stage, extension)
    if cache_file is None:
        raise FileNotFoundError(f"Cache file not found: {cache_key}.{extension} in {stage}/")

    if extension == "json":
        with open(cache_file, "r", encoding="utf-8") as f:
            return json.load(f)
    else:
        return cache_file.read_text(encoding="utf-8")


def generate_disassemble_cache_key(
    pdf: Path, layout_model: str, enable_ocr: bool, json_dpi: int
) -> tuple[str, str]:
    """Generate cache key for disassemble stage.

    Cache key = SHA-256(PDF checksum + Docling options)

    Args:
        pdf: Path to PDF file
        layout_model: Docling layout model
        enable_ocr: OCR enabled flag
        json_dpi: DPI setting

    Returns:
        Tuple of (16-character cache key, 64-character PDF checksum)
    """
    # Calculate PDF file checksum
    pdf_checksum = calculate_file_checksum(pdf)

    docling_options = {"layout_model": layout_model, "enable_ocr": enable_ocr, "json_dpi": json_dpi}

    # Hash checksum + options instead of file bytes + options
    cache_key = generate_cache_key(pdf_checksum, docling_options)

    return cache_key, pdf_checksum


def generate_fixup_cache_key(structure_cache_key: str, fixup_path: Optional[Path]) -> str:
    """Generate cache key for fixup stage.

    Cache key = SHA-256(structure.json content + fixup.py content)

    Args:
        structure_cache_key: Cache key of the structure JSON
        fixup_path: Path to fixup.py module (or None if no fixup)

    Returns:
        16-character cache key
    """
    # Load structure from cache
    structure_file = get_cached_file(structure_cache_key, "structure")
    if structure_file is None:
        raise FileNotFoundError(f"Structure cache not found: {structure_cache_key}")

    if fixup_path is None or not fixup_path.exists():
        # No fixup = same as structure key
        return structure_cache_key

    return generate_cache_key(structure_file, fixup_path)
