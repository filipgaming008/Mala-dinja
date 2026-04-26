import { useEffect, useState } from "react";
import { AppBar, Box, Button, Container, Stack, Toolbar, Typography } from "@mui/material";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { AnalysisPage } from "./pages/AnalysisPage.jsx";
import { ReportPage } from "./pages/ReportPage.jsx";
import { cache } from "./lib/cache.js";

const NavButton = ({ to, label }) => {
  const location = useLocation();
  const active = location.pathname === to;

  return (
    <Button component={Link} to={to} variant={active ? "contained" : "text"} color="inherit">
      {label}
    </Button>
  );
};

const App = () => {
  const [latestAnalysisId, setLatestAnalysisId] = useState(cache.getLatestAnalysis()?.analysisId ?? "demo");
  const [latestReportId, setLatestReportId] = useState(cache.getLatestReport()?.id ?? "demo");

  useEffect(() => {
    const sync = () => {
      setLatestAnalysisId(cache.getLatestAnalysis()?.analysisId ?? "demo");
      setLatestReportId(cache.getLatestReport()?.id ?? "demo");
    };

    window.addEventListener("valeria-cache-updated", sync);
    return () => window.removeEventListener("valeria-cache-updated", sync);
  }, []);

  return (
    <Box className="app-shell">
      <AppBar position="sticky" color="transparent" elevation={0} sx={{ borderBottom: "1px solid var(--border)" }}>
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ justifyContent: "space-between", py: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Valeria
            </Typography>
            <Stack direction="row" spacing={1}>
              <NavButton to="/dashboard" label="Dashboard" />
              <NavButton to={`/analysis/${latestAnalysisId}`} label="Analysis View" />
              <NavButton to={`/report/${latestReportId}`} label="Report View" />
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/analysis/:analysisId" element={<AnalysisPage />} />
        <Route path="/report/:reportId" element={<ReportPage />} />
      </Routes>
    </Box>
  );
};

export default App;
