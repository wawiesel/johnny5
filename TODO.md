# Johnny5 TODO

A living checklist of remaining work and ideas.
Add to the bottom. Do not reorder.
Removed in the PR when they are complete.
There are other things to do of course, this is not an exhaustive list.

## Enable font embeddings

- Create `wrap_with_jny5font()` helper to wrap text with `<jny5font>` tags (name, size, weight, slant, optional color).
- Modify `_extract_element_data_from_cluster()` in disassembler: extract `font_info = cluster.get("font", {})` and set `element_data["content"] = wrap_with_jny5font(text, font_info)`.
- Support nested tags for mixed styles within a single text block.
- Ensure proper HTML escaping for JSON storage (valid UTF-8, JSON-safe).
- Document attribute convention: `name` (font face), `size` (point size), `weight` (numeric/text), `slant` (italic/normal), optional `color` (RGB).
- Add parsing support downstream (Python/Quarto) using BeautifulSoup or similar to extract font metadata from content strings.

## Enable density difference line

- When a fixup is in play, a bright line appears on the x and y density that shows
  after - original fixup density
- the line = 0 if the fixup does nothing
- a line of constant 0 goes through the middle of the density plot at p=0.5
- a line of constant 1 means the original was p=0 and the after is p=1. This is plotted at p=1
- a line of constant -1 means the original was p=1 and the after is p=0. This is plotted at p=0.
- this requires a method to calculate the difference between two bounding box density curves
  it should be analytic

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
