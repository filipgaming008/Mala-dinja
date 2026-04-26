# product context

## product summary

This product is a satellite-powered environmental risk intelligence platform for water ecosystems.
It combines Earth observation signals with nearby human-activity context to support early risk detection and investigation planning.

Core satellite inputs include Sentinel-2 and Sentinel-3 derived indicators for water-body state and potential anomalies, including turbidity, chlorophyll, suspended matter, temperature-related signals, and water-quality risk indicators.

## problem

Water ecosystems can degrade gradually or suddenly, while many organizations lack timely, structured insight into where anomalies are emerging and what nearby pressure sources might be relevant.
Data is often fragmented across satellite platforms, geospatial tooling, and local inspections, making triage and action prioritization slow.

## solution

The platform provides decision-support intelligence by:

- detecting and structuring water anomalies from satellite-derived signals
- identifying nearby potential environmental pressure sources using OpenStreetMap and Overpass API data
- correlating spatial proximity and anomaly context into interpretable risk insights
- returning investigation-ready output through API responses and downstream dashboards

Frontend workflow (outside backend scope) allows a user to select a water body and configure a search radius from 500 m to 5 km around the shoreline or selected water area.
The backend returns both nearby potential pressure-source entities and structured water-analysis results.

## mvp scope

The MVP is designed to help users quickly understand:

1. where water anomalies are detected
2. what nearby environmental pressure sources exist
3. what possible long-term risks may occur
4. what actions or investigations may be recommended

MVP scope includes analysis orchestration, validation, storage, and API delivery of structured risk-intelligence outputs.

## non-goals

- claiming legal causation between a specific source and contamination
- producing definitive guilt or liability conclusions
- replacing laboratory testing, regulatory enforcement, or field inspections
- acting as a standalone judicial evidence system
- implementing full-scale autonomous enforcement actions

## scientific limitations

Satellite-derived indicators are probabilistic and context-dependent.
Signal quality may vary due to cloud cover, seasonal dynamics, sensor resolution, atmospheric effects, water depth, and local hydrological conditions.
Spatial proximity to a potential source does not prove source contribution.
Outputs are best interpreted as correlation and prioritization signals that require expert review and field verification.

## legal/safety framing

The platform must use strict decision-support language.
Allowed framing includes:

- anomaly detected
- potential contributing sources
- risk correlation
- field verification required
- decision-support insight

The product must not present outputs as proof of guilt, contamination responsibility, or legal causation.

## target users

- environmental agencies
- municipalities
- NGOs
- researchers
- agriculture companies
- land and infrastructure investors
- environmental analysts

## business model

- B2G dashboards for governments and municipalities
- B2B environmental insight reports for companies
- data-as-a-service and API access
- agriculture and land-investment risk reports
- premium reports and alerting

## backend responsibilities

Primary backend stack:

- Node.js + Express + TypeScript
- PostgreSQL + Prisma ORM
- Zod validation

Processing integration principle:

- Node/Express is the API orchestrator
- Python is the data-processing engine for geospatial and satellite workflows
- Python returns JSON only
- Node validates, parses, stores, and serves responses

Optional later components include BullMQ + Redis for queued jobs and scheduled processing.

## future expansion

Potential next phases after MVP:

- recurring monitoring and alert subscriptions
- improved historical trend modeling and risk forecasting
- multi-source data fusion beyond Sentinel-2 and Sentinel-3
- workflow support for field teams and verification pipelines
- richer contract-grade API products and partner integrations
