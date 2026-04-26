const INDICATORS = {
  "NDCI (Chlorophyll-a)": { min: -0.005, max: 0.05, cmap: "RdYlGn_r" },
  "NDTI (Normalized Difference Turbidity Index)": { min: -0.05, max: 0.25, cmap: "YlOrBr" },
  "Dogliotti Turbidity (FNU proxy)": { min: 0.0, max: 150.0, cmap: "inferno" },
  "TSS (Suspended Solids)": { min: 0.075, max: 0.185, cmap: "YlOrBr" },
  "FAI (Floating Algae Index proxy)": { min: -0.02, max: 0.05, cmap: "RdYlGn" },
  "Organic Matter Proxy (Green/Red ratio)": { min: 0.6, max: 1.6, cmap: "PuBuGn" },
};

const state = {
  entries: [],
  selectedFile: null,
};

const map = L.map("map", { zoomControl: true }).setView([40.42, 17.22], 11);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let geoLayer = null;
let imageLayer = null;

const el = {
  indicator: document.getElementById("indicator"),
  min: document.getElementById("min"),
  max: document.getElementById("max"),
  search: document.getElementById("search"),
  mode: document.getElementById("mode"),
  method: document.getElementById("method"),
  resolution: document.getElementById("resolution"),
  list: document.getElementById("list"),
  count: document.getElementById("count"),
  title: document.getElementById("title"),
  details: document.getElementById("details"),
};

function setOptions(select, options, selected = "All") {
  select.innerHTML = "";
  for (const value of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = value === selected;
    select.appendChild(option);
  }
}

function populateFilters(entries) {
  setOptions(el.mode, ["All", ...new Set(entries.map((e) => e.scan_mode || "unknown"))]);
  setOptions(el.method, ["All", ...new Set(entries.map((e) => e.scan_method || "unknown"))]);
  setOptions(el.resolution, ["All", ...new Set(entries.map((e) => String(e.resolution_m || "-")))]);
}

function currentIndicator() {
  return el.indicator.value || Object.keys(INDICATORS)[0];
}

function filteredEntries() {
  const search = (el.search.value || "").toLowerCase();
  return state.entries.filter((entry) => {
    if (el.mode.value !== "All" && entry.scan_mode !== el.mode.value) return false;
    if (el.method.value !== "All" && entry.scan_method !== el.method.value) return false;
    if (el.resolution.value !== "All" && String(entry.resolution_m) !== el.resolution.value) return false;
    const blob = `${entry.file} ${entry.scan_start} ${entry.scan_end} ${entry.scan_mode} ${entry.scan_method}`.toLowerCase();
    return blob.includes(search);
  });
}

function drawMap(entry) {
  if (geoLayer) {
    map.removeLayer(geoLayer);
    geoLayer = null;
  }
  if (imageLayer) {
    map.removeLayer(imageLayer);
    imageLayer = null;
  }

  if (!entry || !Array.isArray(entry.bbox) || entry.bbox.length !== 4) {
    return;
  }

  const bounds = [
    [entry.bbox[1], entry.bbox[0]],
    [entry.bbox[3], entry.bbox[2]],
  ];

  if (entry.aoi_geojson) {
    geoLayer = L.geoJSON(entry.aoi_geojson, {
      style: { color: "#f97316", weight: 2, fillOpacity: 0.08 },
    }).addTo(map);
  }

  const indicator = currentIndicator();
  const min = encodeURIComponent(el.min.value);
  const max = encodeURIComponent(el.max.value);
  const url = `/api/cache/${encodeURIComponent(entry.file)}/preview?indicator=${encodeURIComponent(indicator)}&min=${min}&max=${max}`;
  imageLayer = L.imageOverlay(url, bounds, { opacity: 0.9 }).addTo(map);
  map.fitBounds(bounds, { padding: [20, 20] });
}

function renderList() {
  const entries = filteredEntries();
  if (!entries.find((x) => x.file === state.selectedFile)) {
    state.selectedFile = entries[0]?.file || null;
  }

  el.count.textContent = `${entries.length} filtered / ${state.entries.length} total`;
  el.list.innerHTML = "";

  for (const entry of entries) {
    const button = document.createElement("button");
    button.className = `item ${entry.file === state.selectedFile ? "active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <div><strong>${entry.scan_start || "-"}</strong> <span class="small">${entry.resolution_m} m</span></div>
      <div class="small muted">${entry.scan_mode} · ${entry.scan_method}</div>
      <div class="small meta">${entry.file}</div>
    `;
    button.addEventListener("click", () => {
      state.selectedFile = entry.file;
      render();
    });
    el.list.appendChild(button);
  }

  const selected = entries.find((x) => x.file === state.selectedFile) || null;
  if (!selected) {
    el.title.textContent = "No cache selected";
    el.details.textContent = "";
    drawMap(null);
    return;
  }

  el.title.textContent = selected.file;
  el.details.textContent = `${selected.scan_mode} | ${selected.scan_method} | cloud ${selected.s2_cloudy_water_pct}% | s1 ${selected.s1_fill_pct}%`;
  drawMap(selected);
}

function render() {
  renderList();
}

async function init() {
  setOptions(el.indicator, Object.keys(INDICATORS), "NDCI (Chlorophyll-a)");
  const defaults = INDICATORS[currentIndicator()];
  el.min.value = defaults.min;
  el.max.value = defaults.max;

  const response = await fetch("/api/cache");
  const data = await response.json();
  state.entries = data.entries || [];
  populateFilters(state.entries);

  const filters = [el.indicator, el.min, el.max, el.search, el.mode, el.method, el.resolution];
  for (const input of filters) {
    input.addEventListener("input", render);
    input.addEventListener("change", render);
  }

  el.indicator.addEventListener("change", () => {
    const v = INDICATORS[currentIndicator()];
    el.min.value = v.min;
    el.max.value = v.max;
    render();
  });

  state.selectedFile = state.entries[0]?.file || null;
  render();
}

init().catch((error) => {
  el.title.textContent = "Failed to load cache API";
  el.details.textContent = String(error);
});
