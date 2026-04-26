import { useEffect, useState } from "react";
import { Alert, Button, Card, CardContent, Chip, CircularProgress, Container, Grid, Stack, Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../lib/api.js";
import { cache } from "../lib/cache.js";

export const AnalysisPage = () => {
  const { analysisId } = useParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    const targetId = analysisId === "demo" ? cache.getLatestAnalysis()?.analysisId : analysisId;
    if (!targetId) return;

    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get(`/water-analysis/${targetId}`);
        setAnalysis(data.data);
      } catch (e) {
        setError(extractErrorMessage(e));
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [analysisId]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Analysis Details
      </Typography>
      {analysisId === "demo" ? <Alert severity="info">Loaded latest cached analysis from dashboard.</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      {loading ? <CircularProgress /> : null}

      {analysis ? (
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <Card className="panel-card">
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip label={analysis.status} />
                  <Typography className="mono-line">{analysis.analysisId}</Typography>
                </Stack>
                <Typography sx={{ mt: 1 }}>
                  {analysis.waterBody.name} ({analysis.waterBody.type}) - {analysis.waterBody.countryCode}
                </Typography>
                <Button size="small" sx={{ mt: 1 }} onClick={() => cache.setLatestAnalysis(analysis)}>
                  Pin as latest analysis
                </Button>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card className="panel-card">
              <CardContent>
                <Typography variant="h6">Deterministic Score</Typography>
                <Typography>Level: {analysis.riskScore?.level ?? "-"}</Typography>
                <Typography>Score: {analysis.riskScore?.score ?? "-"}</Typography>
                <Typography>Confidence: {analysis.riskScore?.confidenceScore ?? "-"}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card className="panel-card">
              <CardContent>
                <Typography variant="h6">Detected Indicators</Typography>
                <pre className="mono-line">{JSON.stringify(analysis.detectedIndicators, null, 2)}</pre>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : null}
    </Container>
  );
};
