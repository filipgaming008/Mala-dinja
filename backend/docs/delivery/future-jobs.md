# future jobs

## purpose

This document lists recurring backend jobs planned after MVP hardening.

## mvp execution mode

- synchronous Python execution is acceptable for MVP
- do not implement BullMQ/Redis yet unless explicitly required

## planned recurring jobs

### scheduled re-analysis of watched water bodies

- run periodic re-analysis for water bodies flagged for monitoring
- compare current indicator outputs with historical runs
- store trend deltas for decision-support reporting

### refresh openstreetmap source cache

- refresh cached potential environmental pressure sources from OpenStreetMap/Overpass
- update source metadata and geospatial coordinates
- mark stale cache entries for review or archival

### sentinel time-series refresh

- refresh satellite-derived indicator series for tracked areas
- recompute baseline windows for trend and anomaly context
- keep derived metrics aligned with latest available observations

### stale failed-analysis cleanup

- identify old failed analyses beyond retention threshold
- clean temporary artifacts and stale retry state
- keep failure logs required for diagnostics and audit trail

### weekly risk report generation

- generate weekly risk reports for monitored water bodies
- include risk correlation updates and recommendation deltas
- flag outputs as decision-support insights with field verification required

## later queue/worker migration (post-mvp)

- candidate migration path: BullMQ + Redis scheduled workers
- separate scheduler, worker, and retry policies when load requires async orchestration
