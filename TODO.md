# Johnny5 TODO

A living checklist of remaining work and ideas.
Add to the bottom. Do not reorder.
Removed in the PR when they are complete.
There are other things to do of course, this is not an exhaustive list.

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
