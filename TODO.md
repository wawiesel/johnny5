# Johnny5 TODO

A living checklist of remaining work and ideas.
Add to the bottom. Do not reorder.
Removed in the PR when they are complete.
There are other things to do of course, this is not an exhaustive list.

## Enable density and label display

Enable the docling density and label display in the web viewer - show the X/Y density charts and label toggles for filtering annotations.

## Enable disassemble (no fixup) workflow

Implement the full disassemble workflow in the web viewer:
- Display annotations with on-the-fly toggles for all possible labels (based on docling spec)
- Visual indicators showing connection lines from PDF elements to annotations
- Support for image panel indicators (i, d, e, r)
- Implement tests to verify the workflow

## Enable disassemble with fixup

Enable the fixup with hot reloading, i.e. if the fixup.py changes on disk, it updates the annotations on-the-fly without restart. 
Figure out a reasonable way to test, possibly by monitoring a cache for expected files without cancelling the server. 
Might need to be able to run server in headless mode? 

## Implement content-based caching system

Implement the caching system described in @SPEC.md with cache key generation, 
JNY5_HOME environment variable support, and CLI commands that output cache keys.
This enables the full pipeline workflow and sets up the foundation for hot reloading.
