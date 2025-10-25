# Johnny5 TODO

A living checklist of remaining work and ideas.
Add to the bottom. Do not reorder.
Removed in the PR when they are complete.
There are other things to do of course, this is not an exhaustive list.


## Enable web layout

Enable the web layout as described in @SPEC.md and populate everything that can be based on the PDF alone with no fixup.
This means PDF view, density, and log.

## Enable disassemble (no fixup)

Implement the disassemble (no fixup) with full web view of the annotations and on-the-fly toggles for all possible labels
based on the docling spec. Implement tests to verify.

## Enable disassemble with fixup

Enable the fixup with hot reloading, i.e. if the fixup.py changes on disk, it updates the annotations on-the-fly without restart. 
Figure out a reasonable way to test, possibly by monitoring a cache for expected files without cancelling the server. 
Might need to be able to run server in headless mode? 

## Implement content-based caching system

Implement the caching system described in @SPEC.md with cache key generation, 
JNY5_HOME environment variable support, and CLI commands that output cache keys.
This enables the full pipeline workflow and sets up the foundation for hot reloading.
