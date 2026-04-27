import { useEffect, useState } from "react";
import { Alert, Button, Card, CardContent, Chip, CircularProgress, Container, Grid, Stack, Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, extractErrorMessage } from "../lib/api.js";
import { cache } from "../lib/cache.js";

const levelToBaseline = (level) => {
  switch (level) {
    case "VERY_HIGH":
      return 88;
    case "HIGH":
      return 70;
    case "MEDIUM":
      return 52;
    default:
      return 32;
  }
};

const buildTrajectory = (report) => {
  const base = levelToBaseline(report.riskOverview.level);
  const confidenceModifier = Math.round((report.riskOverview.confidenceScore ?? 0.6) * 8);

  return [
    { horizon: "1y", value: Math.max(10, Math.min(100, base + confidenceModifier)) },
    { horizon: "5y", value: Math.max(10, Math.min(100, base + confidenceModifier - 4)) },
    { horizon: "10y", value: Math.max(10, Math.min(100, base + confidenceModifier - 2)) },
    { horizon: "50y", value: Math.max(10, Math.min(100, base + confidenceModifier + 1)) },
  ];
};

export const ReportPage = () => {
  const { reportId } = useParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

  useEffect(() => {
    const targetId = reportId === "demo" ? cache.getLatestReport()?.id : reportId;
    if (!targetId) return;

    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get(`/risk-reports/${targetId}`);
        setReport(data.data);
        cache.setLatestReport(data.data);
      } catch (e) {
        setError(extractErrorMessage(e));
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [reportId]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Risk Report
      </Typography>
      {reportId === "demo" ? <Alert severity="info">Loaded latest cached report from dashboard.</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      {loading ? <CircularProgress /> : null}

      {report ? (
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <Card className="report-card">
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Chip label={report.riskOverview.level} color="warning" />
                  <Typography className="mono-line">{report.id}</Typography>
                </Stack>
                <Typography variant="h6">Executive Summary</Typography>
                <Typography sx={{ mt: 1 }}>{report.executiveSummary}</Typography>
                <Button size="small" sx={{ mt: 1 }} onClick={() => cache.setLatestReport(report)}>
                  Pin as latest report
                </Button>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card className="panel-card">
              <CardContent>
                <Typography variant="h6">Risk Overview</Typography>
                <Typography>Score: {report.riskOverview.score}</Typography>
                <Typography>Confidence: {report.riskOverview.confidenceScore}</Typography>
                <Typography sx={{ mt: 1 }}>{report.riskOverview.explanation}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card className="panel-card">
              <CardContent>
                <Typography variant="h6">Plans</Typography>
                <Typography sx={{ mt: 1, fontWeight: 700 }}>Verification</Typography>
                {report.verificationPlan.map((item) => (
                  <Typography key={item}>- {item}</Typography>
                ))}
                <Typography sx={{ mt: 1, fontWeight: 700 }}>Mitigation</Typography>
                {report.mitigationPlan.map((item) => (
                  <Typography key={item}>- {item}</Typography>
                ))}
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card className="panel-card">
              <CardContent>
                <Typography variant="h6">AI Risk Drivers</Typography>
                <Typography sx={{ mt: 1, fontWeight: 700 }}>Possible Drivers</Typography>
                {(report.aiRiskAnalysis?.possibleDrivers ?? []).map((item) => (
                  <Typography key={`driver-${item}`}>- {item}</Typography>
                ))}
                <Typography sx={{ mt: 1, fontWeight: 700 }}>Satellite Signals</Typography>
                {(report.aiRiskAnalysis?.satelliteObservableSignals ?? []).map((item) => (
                  <Typography key={`signal-${item}`}>- {item}</Typography>
                ))}
                <Typography sx={{ mt: 1, fontWeight: 700 }}>Limitations</Typography>
                {(report.aiRiskAnalysis?.limitations ?? []).map((item) => (
                  <Typography key={`limitation-${item}`}>- {item}</Typography>
                ))}
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12}>
            <Card className="panel-card">
              <CardContent>
                <Typography variant="h6">Source Mitigation Guidance</Typography>
                {(report.sourceMitigation?.sourceRecommendations ?? []).length === 0 ? (
                  <Typography sx={{ mt: 1 }} color="text.secondary">
                    No source-specific guidance available for this report.
                  </Typography>
                ) : null}
                {(report.sourceMitigation?.sourceRecommendations ?? []).map((source) => (
                  <Card key={`${source.sourceName}-${source.sourceType}`} variant="outlined" sx={{ mt: 1.5 }}>
                    <CardContent>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {source.sourceName}
                        </Typography>
                        <Chip label={source.sourceType} size="small" />
                        <Chip label={source.riskLevel} size="small" color="warning" />
                      </Stack>
                      <Typography sx={{ mt: 1, fontWeight: 700 }}>Immediate Actions</Typography>
                      {source.immediateActions.map((item) => (
                        <Typography key={`${source.sourceName}-immediate-${item}`}>- {item}</Typography>
                      ))}
                      <Typography sx={{ mt: 1, fontWeight: 700 }}>Long-Term Mitigations</Typography>
                      {source.longTermMitigations.map((item) => (
                        <Typography key={`${source.sourceName}-mitigation-${item}`}>- {item}</Typography>
                      ))}
                      <Typography sx={{ mt: 1, fontWeight: 700 }}>Monitoring Suggestions</Typography>
                      {source.monitoringSuggestions.map((item) => (
                        <Typography key={`${source.sourceName}-monitoring-${item}`}>- {item}</Typography>
                      ))}
                      <Typography sx={{ mt: 1.5 }} color="text.secondary">
                        {source.businessFriendlyExplanation}
                      </Typography>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12}>
            <Card className="panel-card">
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Long-Term Risk Outlook
                </Typography>
                <Typography color="text.secondary" sx={{ mb: 1.5 }}>
                  Trajectory line is a visualization index based on current risk level and confidence. Narrative text below
                  remains the authoritative backend AI output.
                </Typography>
                <Grid item xs={12} sx={{ mb: 1.5 }}>
                  <Card variant="outlined">
                    <CardContent sx={{ height: 220 }}>
                      <ResponsiveContainer>
                        <LineChart data={buildTrajectory(report)}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="horizon" />
                          <YAxis domain={[0, 100]} />
                          <Tooltip />
                          <Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={3} dot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid container spacing={1.5}>
                  <Grid item xs={12} md={3}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle2">1 year</Typography>
                        <Typography sx={{ mt: 0.5 }}>{report.longTermImpact.oneYear}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle2">5 years</Typography>
                        <Typography sx={{ mt: 0.5 }}>{report.longTermImpact.fiveYears}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle2">10 years</Typography>
                        <Typography sx={{ mt: 0.5 }}>{report.longTermImpact.tenYears}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle2">50 years</Typography>
                        <Typography sx={{ mt: 0.5 }}>{report.longTermImpact.fiftyYears}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12}>
            <Alert severity="info">{report.disclaimer}</Alert>
          </Grid>
        </Grid>
      ) : null}
    </Container>
  );
};
