# Johnny5 TODO

A living checklist of remaining work and ideas.
Add to the bottom. Do not reorder.
Removed in the PR when they are complete.
There are other things to do of course, this is not an exhaustive list.

## Fix disassembly refresh

- Server: POST `/api/disassemble-refresh` with `{layout_model, enable_ocr, json_dpi}`; force re-run.
- Server: per-run log file in cache dir; broadcast progress via WebSocket.
- Client: refresh indicator states — needs-run (red), processing (yellow pulse), up-to-date (green), error (red pulse).
- Client: persist Docling options; compare current vs loaded to set indicator.
- Client: auto-refresh on load; on WebSocket completion reload annotations and set indicator green.
- Types/lint: precise types (e.g., `DisassembleOptions`); satisfy mypy/ruff.
- Tests: E2E waits for WebSocket completion; verify indicator transitions.

## Fix playwright tests

- Strengthen Playwright tests for z-order and interaction precedence.
- Restore green CI runs without `--no-verify` by fixing linters:
  - ESLint (e.g., undefined `ThemeToggle` in `src/johnny5/web/static/app.js`)
  - Ruff / Ruff-format (Python style)
  - mypy (add missing annotations, avoid untyped calls)
- Ensure pre-commit passes locally and in CI without skipping hooks.

## Enable caching system

Implement the content-based caching system described in @SPEC.md:
- Cache key generation from input file hash and fixup module
- JNY5_HOME environment variable support for cache location
- CLI commands to display cache keys
- Cache invalidation and cleanup mechanisms
- Foundation for hot reloading functionality

## Enable image panels for i and d

i is image based on checksum before fixup, d is after

## Enable disassemble with fixup

Enable the fixup with hot reloading, i.e. if the fixup.py changes on disk, it updates the annotations on-the-fly without restart. 
Figure out a reasonable way to test, possibly by monitoring a cache for expected files without cancelling the server. 
Might need to be able to run server in headless mode? 

## Implement content-based caching system

Implement the caching system described in @SPEC.md with cache key generation, 
JNY5_HOME environment variable support, and CLI commands that output cache keys.
This enables the full pipeline workflow and sets up the foundation for hot reloading.
