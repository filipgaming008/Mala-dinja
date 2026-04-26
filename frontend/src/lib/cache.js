const ANALYSIS_KEY = "valeria.latestAnalysis";
const REPORT_KEY = "valeria.latestReport";
const REPORT_HISTORY_KEY = "valeria.reportHistory";

const safeParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const emitCacheUpdated = () => {
  window.dispatchEvent(new CustomEvent("valeria-cache-updated"));
};

export const cache = {
  getLatestAnalysis: () => safeParse(localStorage.getItem(ANALYSIS_KEY), null),
  setLatestAnalysis: (analysis) => {
    localStorage.setItem(ANALYSIS_KEY, JSON.stringify(analysis));
    emitCacheUpdated();
  },
  getLatestReport: () => safeParse(localStorage.getItem(REPORT_KEY), null),
  setLatestReport: (report) => {
    localStorage.setItem(REPORT_KEY, JSON.stringify(report));

    const history = safeParse(localStorage.getItem(REPORT_HISTORY_KEY), []);
    const deduped = [report, ...history.filter((item) => item?.id !== report?.id)].slice(0, 30);
    localStorage.setItem(REPORT_HISTORY_KEY, JSON.stringify(deduped));
    emitCacheUpdated();
  },
  getReportHistory: () => safeParse(localStorage.getItem(REPORT_HISTORY_KEY), []),
};
