import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Circle, CircleMarker, Popup, LayersControl, LayerGroup, Polyline, Rectangle, useMap } from "react-leaflet";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import industrialData from "../../../api_testing/river_industrial_data.json";
import runRequestPayload from "../../../api_testing/water_analysis_run_request.json";
import "leaflet/dist/leaflet.css";
import { api, extractErrorMessage } from "../lib/api.js";
import { cache } from "../lib/cache.js";

const SOURCE_COLORS = {
  FACTORY: "#f97316",
  FARM: "#84cc16",
  CONSTRUCTION: "#facc15",
  WASTEWATER: "#3b82f6",
  UNKNOWN: "#94a3b8",
};

const RISK_COLORS = {
  "very-high": "#ef4444",
  high: "#fb923c",
  medium: "#eab308",
  low: "#22c55e",
};

const POLLUTION_BANDS = [
  { label: "0-29", min: 0, max: 29, color: "#0f766e" },
  { label: "30-49", min: 30, max: 49, color: "#65a30d" },
  { label: "50-69", min: 50, max: 69, color: "#eab308" },
  { label: "70-89", min: 70, max: 89, color: "#ea580c" },
  { label: "90-119", min: 90, max: 119, color: "#b91c1c" },
  { label: "120+", min: 120, max: Number.POSITIVE_INFINITY, color: "#7f1d1d" },
];

const flattenIndustrialSites = (rows) => {
  const unique = new Map();
  rows.forEach((square) => {
    (square.sites ?? []).forEach((site) => {
      const key = `${site.lat},${site.lon},${site.osm_id}`;
      if (!unique.has(key)) unique.set(key, site);
    });
  });
  return Array.from(unique.values());
};

const toBounds = (bbox) => {
  if (!bbox) return null;
  if (
    typeof bbox.south !== "number" ||
    typeof bbox.west !== "number" ||
    typeof bbox.north !== "number" ||
    typeof bbox.east !== "number"
  ) {
    return null;
  }

  return [
    [bbox.south, bbox.west],
    [bbox.north, bbox.east],
  ];
};

export const DashboardPage = () => {
  const [analysis, setAnalysis] = useState(null);
  const [riskReport, setRiskReport] = useState(null);
  const [reportHistory, setReportHistory] = useState(() => cache.getReportHistory());
  const [fullWorkflow, setFullWorkflow] = useState(null);
  const [error, setError] = useState("");
  const [loadingKey, setLoadingKey] = useState("");
  const [layerVisibility, setLayerVisibility] = useState({
    water: true,
    backendAll: true,
    factories: true,
    farms: true,
    construction: true,
    apiTesting: true,
    pollution: true,
  });
  const [pollutionRaw, setPollutionRaw] = useState([]);
  const [focusTarget, setFocusTarget] = useState("analysis");

  const industrialSites = useMemo(() => flattenIndustrialSites(industrialData), []);
  const backendSources = (analysis?.potentialSources ?? []).filter(
    (source) => Number.isFinite(source?.latitude) && Number.isFinite(source?.longitude),
  );
  const apiTestingSites = industrialSites.filter(
    (site) => Number.isFinite(site?.lat) && Number.isFinite(site?.lon),
  );

  const mapCenter = useMemo(() => {
    const source = backendSources[0] ?? fullWorkflow?.potentialSources?.[0];
    if (source?.latitude && source?.longitude) return [source.latitude, source.longitude];
    return [41.62, 21.75];
  }, [backendSources, fullWorkflow]);

  const analysisBbox = analysis?.raw?.waterBody?.bbox ?? runRequestPayload?.bbox ?? null;
  const analysisBounds = toBounds(analysisBbox);

  const sourceTypeGroups = useMemo(() => {
    const groups = {
      FACTORY: [],
      FARM: [],
      CONSTRUCTION: [],
      WASTEWATER: [],
      UNKNOWN: [],
    };

    backendSources.forEach((source) => {
      const key = groups[source.sourceType] ? source.sourceType : "UNKNOWN";
      groups[key].push(source);
    });

    return groups;
  }, [backendSources]);

  const riskChartData = useMemo(() => {
    return Object.entries(
      industrialSites.reduce(
        (acc, site) => {
          const key = site.risk ?? "medium";
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        },
        { "very-high": 0, high: 0, medium: 0, low: 0 },
      ),
    ).map(([risk, count]) => ({ risk, count }));
  }, [industrialSites]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/output_data.json");
        if (!response.ok) return;
        const payload = await response.json();
        const features = Array.isArray(payload?.features) ? payload.features : [];
        if (!cancelled) {
          setPollutionRaw(features);
        }
      } catch {
        if (!cancelled) {
          setPollutionRaw([]);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const pollutionFeatures = useMemo(() => {
    const raw = pollutionRaw;
    const mapped = raw
      .map((feature, index) => {
        const value = Number(feature?.properties?.value);
        const ring = feature?.geometry?.coordinates?.[0];
        if (!Number.isFinite(value) || !Array.isArray(ring)) return null;

        const latLngs = ring
          .map((coord) => {
            if (!Array.isArray(coord) || coord.length < 2) return null;
            const lng = Number(coord[0]);
            const lat = Number(coord[1]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return [lat, lng];
          })
          .filter(Boolean);

        if (latLngs.length < 3) return null;

        const lats = latLngs.map((item) => item[0]);
        const lngs = latLngs.map((item) => item[1]);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);

        if (!Number.isFinite(minLat) || !Number.isFinite(maxLat) || !Number.isFinite(minLng) || !Number.isFinite(maxLng)) {
          return null;
        }

        if (minLat === maxLat || minLng === maxLng) {
          return null;
        }

        return {
          id: `pollution-${index}`,
          value,
          bounds: [
            [minLat, minLng],
            [maxLat, maxLng],
          ],
          center: [(minLat + maxLat) / 2, (minLng + maxLng) / 2],
        };
      })
      .filter(Boolean);

    return mapped.slice(0, 2000);
  }, [pollutionRaw]);

  const pollutionStats = useMemo(() => {
    if (pollutionFeatures.length === 0) return { min: 0, max: 0 };
    const values = pollutionFeatures.map((item) => item.value);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [pollutionFeatures]);

  const pollutionBounds = useMemo(() => {
    if (pollutionFeatures.length === 0) return null;
    const lats = pollutionFeatures.flatMap((item) => [item.bounds[0][0], item.bounds[1][0]]);
    const lngs = pollutionFeatures.flatMap((item) => [item.bounds[0][1], item.bounds[1][1]]);
    return [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
  }, [pollutionFeatures]);

  const pollutionHotspots = useMemo(() => {
    return pollutionFeatures.filter((item) => item.value >= 90).sort((a, b) => a.center[1] - b.center[1]);
  }, [pollutionFeatures]);

  const pollutionColor = (value) => {
    const band = POLLUTION_BANDS.find((item) => value >= item.min && value <= item.max);
    return band?.color ?? "#0f766e";
  };

  useEffect(() => {
    const cachedAnalysis = cache.getLatestAnalysis();
    const cachedReport = cache.getLatestReport();
    if (cachedAnalysis) setAnalysis(cachedAnalysis);
    if (cachedReport) setRiskReport(cachedReport);
    setReportHistory(cache.getReportHistory());
  }, []);

  const runAction = async (key, action) => {
    setLoadingKey(key);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoadingKey("");
    }
  };

  const runRealAnalysis = () =>
    runAction("analysis", async () => {
      const { data } = await api.post("/water-analysis/run", runRequestPayload, {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
      setAnalysis(data.data);
      cache.setLatestAnalysis(data.data);
      setRiskReport(null);
    });

  const generateReport = () =>
    runAction("report", async () => {
      if (!analysis?.analysisId) {
        setError("Run real analysis first.");
        return;
      }
      const { data } = await api.post("/risk-reports/generate", { analysisId: analysis.analysisId });
      setRiskReport(data.data);
      cache.setLatestReport(data.data);
      setReportHistory(cache.getReportHistory());
    });

  const runFullWorkflow = () =>
    runAction("workflow", async () => {
      const { data } = await api.post("/dev/full-workflow-test");
      setFullWorkflow(data);
    });

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <Typography variant="overline" className="eyebrow">
          Environmental Risk Visualization
        </Typography>
        <Typography variant="h3" className="hero-title">
          End-to-End Pipeline Dashboard
        </Typography>
        <Typography className="hero-subtitle">
          Run worker analysis, generate AI reports, inspect map layers and chart risk distributions from backend and
          api-testing datasets.
        </Typography>
      </motion.div>

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mt: 3, mb: 2 }}>
        <Button variant="contained" onClick={runRealAnalysis} disabled={Boolean(loadingKey)}>
          {loadingKey === "analysis" ? <CircularProgress size={20} color="inherit" /> : "1) Run Real Analysis"}
        </Button>
        <Button variant="contained" color="secondary" onClick={generateReport} disabled={Boolean(loadingKey)}>
          {loadingKey === "report" ? <CircularProgress size={20} color="inherit" /> : "2) Generate Report"}
        </Button>
        <Button variant="outlined" onClick={runFullWorkflow} disabled={Boolean(loadingKey)}>
          {loadingKey === "workflow" ? <CircularProgress size={20} color="inherit" /> : "Run Full Workflow Test"}
        </Button>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Box
        sx={{
          mt: 0.5,
          display: "grid",
          gap: 2.5,
          gridTemplateColumns: { xs: "1fr", lg: "320px minmax(540px, 1fr) 320px" },
          alignItems: "start",
        }}
      >
        <Box>
          <Card className="panel-card">
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Layer Filters
              </Typography>
              <Stack spacing={0.3}>
                <FormControlLabel
                  control={<Checkbox checked={layerVisibility.water} onChange={(e) => setLayerVisibility((s) => ({ ...s, water: e.target.checked }))} />}
                  label="Water body / analysis area"
                />
                <FormControlLabel
                  control={<Checkbox checked={layerVisibility.backendAll} onChange={(e) => setLayerVisibility((s) => ({ ...s, backendAll: e.target.checked }))} />}
                  label="Backend sources (all)"
                />
                {sourceTypeGroups.FACTORY.length > 0 ? (
                  <FormControlLabel
                    control={<Checkbox checked={layerVisibility.factories} onChange={(e) => setLayerVisibility((s) => ({ ...s, factories: e.target.checked }))} />}
                    label={`Factories (${sourceTypeGroups.FACTORY.length})`}
                  />
                ) : null}
                <FormControlLabel
                  control={<Checkbox checked={layerVisibility.farms} onChange={(e) => setLayerVisibility((s) => ({ ...s, farms: e.target.checked }))} />}
                  label={`Farms (${sourceTypeGroups.FARM.length})`}
                />
                <FormControlLabel
                  control={<Checkbox checked={layerVisibility.construction} onChange={(e) => setLayerVisibility((s) => ({ ...s, construction: e.target.checked }))} />}
                  label={`Construction (${sourceTypeGroups.CONSTRUCTION.length})`}
                />
                <FormControlLabel
                  control={<Checkbox checked={layerVisibility.apiTesting} onChange={(e) => setLayerVisibility((s) => ({ ...s, apiTesting: e.target.checked }))} />}
                  label={`Factories (${apiTestingSites.length})`}
                />
                <FormControlLabel
                  control={<Checkbox checked={layerVisibility.pollution} onChange={(e) => setLayerVisibility((s) => ({ ...s, pollution: e.target.checked }))} />}
                  label={`Pollution pixels (${pollutionFeatures.length})`}
                />
              </Stack>
              <Typography className="legend-note" sx={{ mt: 1.2 }}>
                Use this panel if layer control is hidden.
              </Typography>
              <Typography className="legend-note" sx={{ mt: 2 }}>
                Run full workflow test creates demo records end-to-end (water body, analysis, sources, joins,
                deterministic score, AI report, AI log) without relying on external live providers.
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                <Button size="small" variant="outlined" onClick={() => setFocusTarget("analysis")}>
                  Focus analysis
                </Button>
                <Button size="small" variant="outlined" onClick={() => setFocusTarget("pollution")}>
                  Focus pollution
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Box>

        <Box>
          <Card className="map-card">
            <CardContent sx={{ p: 0 }}>
              <MapContainer
                center={mapCenter}
                zoom={8}
                className="map-wrap"
                style={{ height: 560, width: "100%", minWidth: 420 }}
              >
                <MapResizeFix />
                <MapFocusManager focusTarget={focusTarget} analysisBounds={analysisBounds} pollutionBounds={pollutionBounds} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LayersControl position="topright">
                  {layerVisibility.water ? <LayersControl.Overlay checked name="Water body / analysis area">
                    <LayerGroup>
                      {analysisBounds ? (
                        <Rectangle
                          bounds={analysisBounds}
                          pathOptions={{ color: "#0ea5e9", weight: 2, fillOpacity: 0.08 }}
                        >
                          <Popup>
                            <strong>Water analysis bbox</strong>
                            <br />
                            Area used for worker discovery and source correlation.
                          </Popup>
                        </Rectangle>
                      ) : null}
                      <Circle
                        center={mapCenter}
                        radius={5000}
                        pathOptions={{ color: "#0284c7", weight: 1.5, dashArray: "8 6", fillOpacity: 0.03 }}
                      >
                        <Popup>
                          <strong>Water influence ring</strong>
                          <br />
                          5km visualization ring for nearby potential environmental pressure sources.
                        </Popup>
                      </Circle>
                    </LayerGroup>
                  </LayersControl.Overlay> : null}

                  {layerVisibility.backendAll ? <LayersControl.Overlay checked name="Backend sources (all)">
                    <LayerGroup>
                      {backendSources.map((source) => (
                        <CircleMarker
                          key={`${source.sourceId}-${source.osmId}`}
                          center={[source.latitude, source.longitude]}
                          pathOptions={{
                            color: SOURCE_COLORS[source.sourceType] ?? SOURCE_COLORS.UNKNOWN,
                            fillColor: SOURCE_COLORS[source.sourceType] ?? SOURCE_COLORS.UNKNOWN,
                          }}
                          radius={8}
                          fillOpacity={0.82}
                        >
                          <Popup>
                            <strong>{source.name ?? "Unnamed source"}</strong>
                            <br />
                            Type: {source.sourceType}
                            <br />
                            Distance: {source.distanceMeters ?? "n/a"}m
                          </Popup>
                        </CircleMarker>
                      ))}
                    </LayerGroup>
                  </LayersControl.Overlay> : null}

                  {sourceTypeGroups.FACTORY.length > 0 ? (
                    <LayersControl.Overlay checked name="Factories">
                      <LayerGroup>
                        {sourceTypeGroups.FACTORY.map((source) => (
                          <CircleMarker
                            key={`factory-${source.sourceId}`}
                            center={[source.latitude, source.longitude]}
                            pathOptions={{ color: SOURCE_COLORS.FACTORY, fillColor: SOURCE_COLORS.FACTORY }}
                            radius={9}
                            fillOpacity={0.85}
                          >
                            <Popup>
                              <strong>{source.name ?? "Factory"}</strong>
                              <br />Factory marker from backend analysis.
                            </Popup>
                          </CircleMarker>
                        ))}
                      </LayerGroup>
                    </LayersControl.Overlay>
                  ) : null}

                  {layerVisibility.farms ? <LayersControl.Overlay checked name="Farms">
                    <LayerGroup>
                      {sourceTypeGroups.FARM.map((source) => (
                        <CircleMarker
                          key={`farm-${source.sourceId}`}
                          center={[source.latitude, source.longitude]}
                          pathOptions={{ color: SOURCE_COLORS.FARM, fillColor: SOURCE_COLORS.FARM }}
                          radius={8}
                          fillOpacity={0.85}
                        >
                          <Popup>
                            <strong>{source.name ?? "Farm"}</strong>
                            <br />Farm marker from backend analysis.
                          </Popup>
                        </CircleMarker>
                      ))}
                    </LayerGroup>
                  </LayersControl.Overlay> : null}

                  {layerVisibility.construction ? <LayersControl.Overlay checked name="Construction sites">
                    <LayerGroup>
                      {sourceTypeGroups.CONSTRUCTION.map((source) => (
                        <CircleMarker
                          key={`construction-${source.sourceId}`}
                          center={[source.latitude, source.longitude]}
                          pathOptions={{ color: SOURCE_COLORS.CONSTRUCTION, fillColor: SOURCE_COLORS.CONSTRUCTION }}
                          radius={8}
                          fillOpacity={0.85}
                        >
                          <Popup>
                            <strong>{source.name ?? "Construction site"}</strong>
                            <br />Construction marker from backend analysis.
                          </Popup>
                        </CircleMarker>
                      ))}
                    </LayerGroup>
                  </LayersControl.Overlay> : null}

                  {layerVisibility.apiTesting ? <LayersControl.Overlay checked name="Factories">
                    <LayerGroup>
                      {apiTestingSites.map((site) => (
                        <CircleMarker
                          key={`${site.osm_id}-${site.lat}-${site.lon}`}
                          center={[site.lat, site.lon]}
                          pathOptions={{ color: RISK_COLORS[site.risk] ?? RISK_COLORS.medium }}
                          radius={site.risk === "very-high" ? 8 : site.risk === "high" ? 6 : 5}
                          fillOpacity={0.78}
                        >
                          <Popup>
                            <strong>{site.name}</strong>
                            <br />
                            Risk: {site.risk}
                            <br />
                            Industry: {site.industry_label}
                          </Popup>
                        </CircleMarker>
                      ))}
                    </LayerGroup>
                  </LayersControl.Overlay> : null}

                  {layerVisibility.pollution ? <LayersControl.Overlay checked name="Pollution raster overlay">
                    <LayerGroup>
                      {pollutionFeatures.map((feature) => (
                        <Rectangle
                          key={feature.id}
                          bounds={feature.bounds}
                          pathOptions={{
                            color: pollutionColor(feature.value),
                            fillColor: pollutionColor(feature.value),
                            fillOpacity: 0.28,
                            weight: 0,
                          }}
                        >
                          <Popup>
                            <strong>Pixel value: {feature.value}</strong>
                            <br />
                            Sentinel-derived raster cell centered at {feature.center[0].toFixed(5)}, {" "}
                            {feature.center[1].toFixed(5)}.
                          </Popup>
                        </Rectangle>
                      ))}
                      {pollutionHotspots.length > 2 ? (
                        <Polyline
                          positions={pollutionHotspots.map((item) => item.center)}
                          pathOptions={{ color: "#22c55e", weight: 2.5, opacity: 0.9 }}
                        />
                      ) : null}
                    </LayerGroup>
                  </LayersControl.Overlay> : null}
                </LayersControl>
              </MapContainer>
            </CardContent>
          </Card>
        </Box>
        <Box>
          <Card className="panel-card">
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                Risk Distribution (api_testing)
              </Typography>
              <Box sx={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={riskChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="risk" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0f766e" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
              <Typography className="legend-note">Toggle map overlays to compare backend and static risk layers.</Typography>
              <Typography className="legend-note" sx={{ mt: 1 }}>
                Pollution overlay range: min {pollutionStats.min} / max {pollutionStats.max}.
              </Typography>
              <Typography variant="subtitle2" sx={{ mt: 1.6, mb: 0.8 }}>
                Pollution Scale
              </Typography>
              <Stack spacing={0.6}>
                {POLLUTION_BANDS.map((band) => (
                  <Box key={band.label} className="legend-row">
                    <span className="legend-dot" style={{ background: band.color }} />
                    <Typography>{band.label}</Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>

          <Card className="panel-card" sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6">Pipeline Status</Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                <Chip label={`Analysis: ${analysis ? "Ready" : "Pending"}`} color={analysis ? "success" : "default"} />
                <Chip label={`Report: ${riskReport ? "Ready" : "Pending"}`} color={riskReport ? "success" : "default"} />
                <Chip label={`Cached reports: ${reportHistory.length}`} color={reportHistory.length ? "success" : "default"} />
              </Stack>
              <Typography className="mono-line">Analysis ID: {analysis?.analysisId ?? "-"}</Typography>
              <Typography className="mono-line">Report ID: {riskReport?.id ?? "-"}</Typography>
              {analysis?.analysisId ? (
                <Button component={Link} to={`/analysis/${analysis.analysisId}`} sx={{ mt: 1 }} size="small">
                  Open analysis page
                </Button>
              ) : null}
              {riskReport?.id ? (
                <Button component={Link} to={`/report/${riskReport.id}`} sx={{ mt: 1, ml: 1 }} size="small">
                  Open report page
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card className="panel-card" sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6">Cached Reports</Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {reportHistory.length === 0 ? <Typography color="text.secondary">No cached reports yet.</Typography> : null}
                {reportHistory.map((item) => (
                  <Button key={item.id} component={Link} to={`/report/${item.id}`} size="small" variant="text">
                    {item.id} ({item.riskOverview?.level ?? "-"})
                  </Button>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Container>
  );
};

const MapResizeFix = () => {
  const map = useMap();

  useEffect(() => {
    const timeout = setTimeout(() => {
      map.invalidateSize();
    }, 80);

    return () => clearTimeout(timeout);
  }, [map]);

  return null;
};

const MapFocusManager = ({ focusTarget, analysisBounds, pollutionBounds }) => {
  const map = useMap();

  useEffect(() => {
    if (focusTarget === "pollution" && pollutionBounds) {
      map.fitBounds(pollutionBounds, { padding: [20, 20] });
      return;
    }

    if (focusTarget === "analysis" && analysisBounds) {
      map.fitBounds(analysisBounds, { padding: [20, 20] });
    }
  }, [analysisBounds, focusTarget, map, pollutionBounds]);

  return null;
};
