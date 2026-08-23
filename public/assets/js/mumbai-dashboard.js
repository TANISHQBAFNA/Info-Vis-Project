const MumbaiDash = {
  state: {
    ward: null,
    theme: null,
    rainKey: null,
    band: "all",
    intelMode: "overview"
  },
  data: {
    wards: [],
    info: new Map(),
    taxonomy: null,
    daily: [],
    dailyKeys: [],
    live: { aqi: null, aqiWard: null, rainToday: null, source: "pending" }
  },
  focus: [
    { id: "ME", key: "Govandi" },
    { id: "FN", key: "Sion" },
    { id: "L", key: "Kurla" },
    { id: "N", key: "Ghatkopar" },
    { id: "GN", key: "Dadar" }
  ],

  async boot() {
    const log = document.getElementById("boot-log");
    const write = (msg) => { if (log) log.textContent = msg; };

    write("Loading 24 BMC wards…");
    const rows = await d3.csv("assets/data/mumbai/Wards.csv", (d) => ({
      id: d.id,
      ward: d.ward,
      places: d.places,
      population: +d.population,
      area: +d.area_km2,
      lat: +d.lat,
      lon: +d.lon,
      theme1: +d.flood,
      theme2: +d.heat,
      theme3: +d.air,
      theme4: +d.services,
      svi: +d.index,
      hotspots: +d.hotspots,
      slum: +d.slum_pct,
      zone: d.zone
    }));

    write("Loading ward notes…");
    const infoRows = await d3.csv("assets/data/mumbai/WardInfo.csv", (d) => ({
      ward: d.ward,
      places: d.places,
      zone: d.zone,
      note: d.note
    }));

    write("Loading index themes…");
    const taxonomy = await d3.json("assets/data/mumbai/ExposureThemes.json");

    const info = new Map();
    infoRows.forEach((row) => info.set(row.ward, row));
    rows.forEach((row, i) => {
      row.rank = i + 1;
      row.info = info.get(row.ward) || null;
      row.band = bandOf(row.svi);
    });

    this.data.wards = rows;
    this.data.info = info;
    this.data.taxonomy = taxonomy;

    write("Fetching live rain and AQI…");
    await this.loadLive();

    this.renderKpis();
    this.renderLegend();
    this.bindChrome();
    document.querySelector(".dashboard").hidden = false;
    this.observeResize();
    this.drawAll();
    this.selectWard("M East · Govandi", { mode: "ward" });
    this.lockComboToChart();
    document.getElementById("boot-screen").classList.add("is-done");
    this.startClocks();
  },

  async loadLive() {
    const stamp = document.getElementById("live-stamp");
    const hint = document.getElementById("rain-hint");
    try {
      const lats = this.focus.map((f) => this.wardById(f.id).lat).join(",");
      const lons = this.focus.map((f) => this.wardById(f.id).lon).join(",");
      const rainUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&daily=precipitation_sum&past_days=14&forecast_days=1&timezone=Asia%2FKolkata`;
      const aqiUrl = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=19.076&longitude=72.8777&current=pm2_5,us_aqi,european_aqi&timezone=Asia%2FKolkata";
      const [rainRes, aqiRes] = await Promise.all([fetch(rainUrl), fetch(aqiUrl)]);
      if (!rainRes.ok || !aqiRes.ok) throw new Error("live feed unavailable");
      const rainJson = await rainRes.json();
      const aqiJson = await aqiRes.json();
      const series = Array.isArray(rainJson) ? rainJson : [rainJson];
      const times = series[0].daily.time;
      const keys = this.focus.map((f) => f.key);
      this.data.dailyKeys = keys;
      this.data.daily = times.map((t, i) => {
        const row = { date: d3.isoParse(t) };
        series.forEach((loc, li) => {
          row[keys[li]] = +(loc.daily.precipitation_sum[i] || 0);
        });
        return row;
      });
      const last = this.data.daily[this.data.daily.length - 1];
      this.data.live.rainToday = last ? keys.reduce((s, k) => s + last[k], 0) / keys.length : null;
      this.data.live.aqi = aqiJson.current;
      this.data.live.source = "Open-Meteo";
      if (stamp) stamp.textContent = `Rain + AQI · ${times[times.length - 1]}`;
      if (hint) hint.textContent = "Last 15 days · Open-Meteo · click a layer";
    } catch (err) {
      console.warn(err);
      this.data.live.source = "offline";
      this.buildFallbackRain();
      if (stamp) stamp.textContent = "Index only · live feed offline";
      if (hint) hint.textContent = "Sample monsoon week · live rain unavailable";
    }
  },

  async loadWardAqi(row) {
    if (!row) return;
    try {
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${row.lat}&longitude=${row.lon}&current=pm2_5,us_aqi&timezone=Asia%2FKolkata`;
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      this.data.live.aqiWard = { ward: row.ward, ...json.current };
      this.renderIntel();
    } catch (_) { /* keep city AQI */ }
  },

  buildFallbackRain() {
    const keys = this.focus.map((f) => f.key);
    this.data.dailyKeys = keys;
    const start = new Date("2026-08-09T00:00:00+05:30");
    const sample = {
      Govandi: [6, 8, 24, 18, 15, 9, 22, 14, 12, 9, 5, 3, 8, 12, 8],
      Sion: [5, 7, 21, 16, 14, 8, 20, 13, 11, 8, 5, 3, 8, 11, 7],
      Kurla: [7, 9, 26, 19, 16, 10, 23, 15, 13, 9, 5, 3, 9, 12, 8],
      Ghatkopar: [5, 7, 22, 14, 13, 7, 20, 13, 12, 8, 5, 3, 8, 11, 7],
      Dadar: [4, 6, 18, 12, 11, 6, 16, 11, 10, 7, 4, 2, 7, 10, 6]
    };
    this.data.daily = sample.Govandi.map((_, i) => {
      const date = new Date(start.getTime() + i * 86400000);
      const row = { date };
      keys.forEach((k) => { row[k] = sample[k][i]; });
      return row;
    });
    this.data.live.rainToday = 7.2;
  },

  wardById(id) {
    return this.data.wards.find((d) => d.id === id);
  },

  drawAll() {
    if (window.MXViz?.drawCircular) MXViz.drawCircular();
    if (window.MXViz?.drawRadar) MXViz.drawRadar();
    if (window.MXViz?.drawRain) MXViz.drawRain();
    if (window.MXViz?.drawTaxonomy) MXViz.drawTaxonomy();
    this.lockComboToChart();
  },

  lockComboToChart() {
    const chart = document.getElementById("panel-array");
    const notes = document.getElementById("panel-intel");
    if (!chart || !notes) return;
    if (window.matchMedia("(max-width: 760px)").matches) {
      notes.style.height = "";
      notes.style.maxHeight = "";
      return;
    }
    const apply = () => {
      const h = Math.round(chart.getBoundingClientRect().height);
      if (h > 0) {
        notes.style.height = `${h}px`;
        notes.style.maxHeight = `${h}px`;
      }
    };
    apply();
    requestAnimationFrame(apply);
  },

  observeResize() {
    const redraw = debounce(() => this.drawAll(), 160);
    const ro = new ResizeObserver(redraw);
    ["circular-chart", "radar-chart", "stacked-chart", "taxonomy-chart"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) ro.observe(el);
    });
    const comboChart = document.getElementById("panel-array");
    if (comboChart) {
      const lock = debounce(() => this.lockComboToChart(), 80);
      new ResizeObserver(lock).observe(comboChart);
    }
    window.addEventListener("resize", debounce(() => this.lockComboToChart(), 80));
  },

  bindChrome() {
    document.getElementById("btn-reset").addEventListener("click", () => this.reset());
    document.getElementById("kpi-row").addEventListener("click", (e) => {
      const btn = e.target.closest(".kpi");
      if (!btn) return;
      this.selectBand(btn.dataset.band);
    });
    const input = document.getElementById("ward-search");
    const results = document.getElementById("ward-results");
    input.addEventListener("input", () => this.renderSearch(input.value));
    input.addEventListener("focus", () => this.renderSearch(input.value));
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".command-bar")) results.hidden = true;
    });
    results.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-ward]");
      if (!btn) return;
      input.value = btn.dataset.ward;
      results.hidden = true;
      this.selectWard(btn.dataset.ward);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.reset();
      if (e.key === "/" && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      }
    });
  },

  renderSearch(query) {
    const results = document.getElementById("ward-results");
    const q = (query || "").trim().toLowerCase();
    const matches = this.data.wards
      .filter((d) => !q || d.ward.toLowerCase().includes(q) || d.places.toLowerCase().includes(q))
      .slice(0, 12);
    results.innerHTML = matches
      .map((d) => `<li><button type="button" data-ward="${escapeAttr(d.ward)}">${d.ward} · ${d.svi.toFixed(3)}</button></li>`)
      .join("");
    results.hidden = matches.length === 0;
  },

  renderKpis() {
    const counts = { high: 0, "mod-high": 0, "mod-low": 0, low: 0 };
    this.data.wards.forEach((d) => { counts[d.band] += 1; });
    const rain = this.data.live.rainToday;
    const aqi = this.data.live.aqi?.us_aqi;
    const kpis = [
      { band: "all", label: "BMC wards", value: String(this.data.wards.length), sub: "Greater Mumbai", accent: "var(--ink)" },
      { band: "high", label: "High exposure", value: String(counts.high), sub: "Index ≥ 0.75", accent: "var(--high)" },
      { band: "mod-high", label: "Moderate–high", value: String(counts["mod-high"]), sub: "0.50 – 0.75", accent: "var(--mod-high)" },
      { band: "low", label: "Low exposure", value: String(counts.low), sub: "Index ≤ 0.25", accent: "var(--low)" },
      {
        band: "focus",
        label: aqi != null ? "City AQI (US)" : "Rain, 5 wards",
        value: aqi != null ? String(Math.round(aqi)) : (rain != null ? `${rain.toFixed(1)} mm` : "—"),
        sub: aqi != null ? `PM2.5 ${Math.round(this.data.live.aqi.pm2_5)} µg/m³ · today` : "Open-Meteo today",
        accent: "var(--accent)"
      }
    ];
    document.getElementById("kpi-row").innerHTML = kpis.map((k) => `
      <button class="kpi${this.state.band === k.band ? " is-active" : ""}" data-band="${k.band}" style="--kpi-accent:${k.accent}">
        <span class="kpi-label">${k.label}</span>
        <span class="kpi-value">${k.value}</span>
        <span class="kpi-sub">${k.sub}</span>
      </button>
    `).join("");
  },

  renderLegend() {
    const items = [
      { band: "high", label: "High ≥ 0.75", color: "var(--high)" },
      { band: "mod-high", label: "Moderate–high", color: "var(--mod-high)" },
      { band: "mod-low", label: "Moderate–low", color: "var(--mod-low)" },
      { band: "low", label: "Low ≤ 0.25", color: "var(--low)" }
    ];
    document.getElementById("array-legend").innerHTML = items.map((item) => `
      <button class="legend-swatch" data-band="${item.band}" type="button">
        <i style="background:${item.color}"></i>${item.label}
      </button>
    `).join("");
    document.getElementById("array-legend").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-band]");
      if (btn) this.selectBand(btn.dataset.band);
    });
  },

  startClocks() {
    this.tickerIndex = 0;
    this.updateTicker();
    setInterval(() => {
      this.tickerIndex += 1;
      this.updateTicker();
    }, 5200);
  },

  updateTicker() {
    const items = this.tickerItems();
    document.getElementById("ticker-line").textContent = items[this.tickerIndex % items.length];
  },

  tickerItems() {
    const top = this.data.wards[0];
    const bottom = this.data.wards[this.data.wards.length - 1];
    const items = [
      "Four themes: flood/drainage, heat/housing, air/health, services/density. Ranked across 24 BMC wards.",
      `${top.ward} sits at the top of the index (${top.svi.toFixed(3)}).`,
      `${bottom.ward} ranks lowest (${bottom.svi.toFixed(3)}).`,
      "F North holds the most BMC flood hotspots. M East is the MCAP heat hotspot.",
      "Rain layers are Open-Meteo. The index itself is a synthesis of MCAP, IISER flood vulnerability, and census structure — not a BMC official score.",
      "August 2026: monsoon, high tide, Ghatkopar landslide, malaria up. That is the live story, not COVID."
    ];
    const row = this.selectedRow();
    if (row) items.unshift(`${row.ward} · index ${row.svi.toFixed(3)} · rank ${row.rank} of 24`);
    if (this.state.theme) items.unshift(`Theme: ${this.state.theme}`);
    return items;
  },

  selectedRow() {
    return this.data.wards.find((d) => d.ward === this.state.ward) || null;
  },

  selectWard(name, opts = {}) {
    const row = this.data.wards.find((d) => d.ward === name);
    if (!row) return;
    this.state.ward = row.ward;
    const focus = this.focus.find((f) => f.id === row.id);
    this.state.rainKey = focus ? focus.key : this.state.rainKey;
    this.state.intelMode = opts.mode || "ward";
    if (opts.theme) this.state.theme = opts.theme;
    this.sync();
    this.loadWardAqi(row);
  },

  selectTheme(name) {
    this.state.theme = name;
    this.state.intelMode = "theme";
    this.sync();
  },

  selectBand(band) {
    if (this.state.band === band && band !== "all") {
      this.state.band = "all";
      this.state.intelMode = "overview";
      this.sync();
      return;
    }
    this.state.band = band;
    if (band === "focus") {
      this.state.intelMode = "rain";
      this.state.rainKey = this.state.rainKey || "Govandi";
      const id = this.focus.find((f) => f.key === this.state.rainKey)?.id;
      const row = this.wardById(id) || this.data.wards[0];
      this.selectWard(row.ward, { mode: "rain" });
      return;
    }
    this.state.intelMode = band === "all" ? "overview" : "band";
    this.sync();
  },

  selectRainKey(key) {
    this.state.rainKey = key;
    const id = this.focus.find((f) => f.key === key)?.id;
    const row = this.wardById(id);
    if (row) this.selectWard(row.ward, { mode: "rain" });
    else {
      this.state.intelMode = "rain";
      this.sync();
    }
  },

  reset() {
    this.state.ward = "M East · Govandi";
    this.state.theme = null;
    this.state.rainKey = "Govandi";
    this.state.band = "all";
    this.state.intelMode = "overview";
    document.getElementById("ward-search").value = "";
    this.sync();
  },

  sync() {
    this.renderKpis();
    this.renderIntel();
    this.updateTicker();
    if (window.MXViz?.updateCircular) MXViz.updateCircular();
    if (window.MXViz?.drawRadar) MXViz.drawRadar();
    if (window.MXViz?.updateRain) MXViz.updateRain();
    if (window.MXViz?.updateTaxonomy) MXViz.updateTaxonomy();
  },

  renderIntel() {
    const feed = document.getElementById("intel-feed");
    const stamp = document.getElementById("intel-stamp");
    const title = document.getElementById("intel-title");
    const radarTitle = document.getElementById("radar-title");
    const taxonomyTitle = document.getElementById("taxonomy-title");
    const ward = this.state.ward;
    if (title) title.textContent = ward ? `About ${ward}` : "About this ward";
    if (radarTitle) radarTitle.textContent = ward ? `Exposure themes for ${ward}` : "Exposure themes for this ward";
    if (taxonomyTitle) taxonomyTitle.textContent = ward ? `What the index measures in ${ward}` : "What the index measures";
    const mode = this.state.intelMode;
    stamp.textContent =
      mode === "ward" ? "Ward" :
      mode === "theme" ? "Theme" :
      mode === "band" ? "Band" :
      mode === "rain" ? "Rainfall" :
      "Overview";

    if (mode === "theme") feed.innerHTML = this.themeIntel();
    else if (mode === "band") feed.innerHTML = this.bandIntel();
    else if (mode === "rain") feed.innerHTML = this.rainIntel();
    else if (mode === "ward") feed.innerHTML = this.wardIntel();
    else feed.innerHTML = this.overviewIntel();

    feed.querySelectorAll("[data-ward]").forEach((el) => {
      el.addEventListener("click", () => this.selectWard(el.dataset.ward));
    });
    feed.querySelectorAll("[data-theme]").forEach((el) => {
      el.addEventListener("click", () => this.selectTheme(el.dataset.theme));
    });
    feed.querySelectorAll("[data-rain]").forEach((el) => {
      el.addEventListener("click", () => this.selectRainKey(el.dataset.rain));
    });
    this.lockComboToChart();
  },

  overviewIntel() {
    const high = this.data.wards.filter((d) => d.band === "high").length;
    const top = this.data.wards.slice(0, 5);
    const bottom = this.data.wards.slice(-5).reverse();
    return `
      <p class="intel-kicker">Overview</p>
      <h3>Mumbai’s risk is not even</h3>
      <p class="intel-lede">Monsoon 2026 is the live layer: rain, high tide, waterlogging, a Ghatkopar landslide, malaria up. The bones of the index are slower — flood studies, heat maps, air, housing.</p>
      <p class="intel-body">24 BMC administrative wards. ${high} sit in the high band. Click a bar, a ring, an axis, or a rain layer. The circular chart ranks a monsoon-weighted composite: flood 35%, heat 25%, air 20%, services 20%, then percentile-ranked like SVI.</p>
      <div class="callout">This is not a BMC official score. Theme signals come from MCAP (2022), IISER combined flood vulnerability (2025), OpenCity census structure, and typical AQI geography. Rain and AQI are live Open-Meteo.</div>
      <p class="intel-kicker">Highest exposure</p>
      <div class="chip-list">${top.map((d) => `<button class="chip" data-ward="${escapeAttr(d.ward)}" type="button">${d.ward}</button>`).join("")}</div>
      <p class="intel-kicker">Lowest exposure</p>
      <div class="chip-list">${bottom.map((d) => `<button class="chip" data-ward="${escapeAttr(d.ward)}" type="button">${d.ward}</button>`).join("")}</div>
    `;
  },

  wardIntel() {
    const row = this.selectedRow();
    if (!row) return this.overviewIntel();
    const density = row.population && row.area ? row.population / row.area : null;
    const meters = [
      ["Flood / drainage", row.theme1, "Flood / drainage"],
      ["Heat / housing", row.theme2, "Heat / housing"],
      ["Air / health", row.theme3, "Air / health"],
      ["Services / density", row.theme4, "Services / density"]
    ];
    const aqi = this.data.live.aqiWard?.ward === row.ward ? this.data.live.aqiWard : this.data.live.aqi;
    const focus = this.focus.find((f) => f.id === row.id);
    return `
      <p class="intel-kicker">${row.zone}</p>
      <h3>${row.ward}</h3>
      <p class="intel-lede">${bandLabel(row.band)} · rank ${row.rank} of 24 · index ${row.svi.toFixed(4)}</p>
      <p class="intel-body">${row.places}</p>
      <div class="stat-grid">
        <div class="stat-card"><span>Population (2011)</span><strong>${row.population.toLocaleString()}</strong></div>
        <div class="stat-card"><span>Area</span><strong>${row.area.toLocaleString()} km²</strong></div>
        <div class="stat-card"><span>Density</span><strong>${density ? Math.round(density).toLocaleString() + " /km²" : "—"}</strong></div>
        <div class="stat-card"><span>Flood hotspots</span><strong>${row.hotspots}</strong></div>
        <div class="stat-card"><span>Slum share (est.)</span><strong>${row.slum}%</strong></div>
        <div class="stat-card"><span>${aqi?.us_aqi != null ? "AQI (US)" : "Live AQI"}</span><strong>${aqi?.us_aqi != null ? Math.round(aqi.us_aqi) : "—"}</strong></div>
      </div>
      <div class="meters">
        ${meters.map(([label, value, theme]) => `
          <button class="meter${this.state.theme === theme ? " is-active" : ""}" data-theme="${escapeAttr(theme)}" type="button">
            <span class="meter-label">${label}</span>
            <span class="meter-track"><span class="meter-fill" style="width:${value * 100}%;background:${bandColor(value)}"></span></span>
            <span class="meter-val">${value.toFixed(3)}</span>
          </button>
        `).join("")}
      </div>
      <p class="intel-body">${row.info?.note || wardAssessment(row)}</p>
      ${focus ? `<div class="callout">This ward is in the rainfall chart. Open the <button class="chip" data-rain="${focus.key}" type="button">${focus.key}</button> layer.</div>` : ""}
    `;
  },

  themeIntel() {
    const name = this.state.theme;
    const copy = FACTORS[name] || FACTORS["Mumbai Exposure Index"];
    const row = this.selectedRow();
    const value = themeValue(row, name);
    return `
      <p class="intel-kicker">${copy.kicker}</p>
      <h3>${name}</h3>
      ${value != null ? `<p class="intel-lede">${row.ward} scores ${(+value).toFixed(4)} on this axis.</p>` : ""}
      <p class="intel-body">${copy.body}</p>
      ${copy.leaves ? `<p class="intel-kicker">Related factors</p><div class="chip-list">${copy.leaves.map((leaf) => `<button class="chip" data-theme="${escapeAttr(leaf)}" type="button">${leaf}</button>`).join("")}</div>` : ""}
      <p class="intel-body">${copy.why}</p>
    `;
  },

  bandIntel() {
    const band = this.state.band;
    const rows = this.data.wards.filter((d) => d.band === band);
    const sample = rows.slice(0, 8);
    const copy = BAND_COPY[band] || BAND_COPY.high;
    return `
      <p class="intel-kicker">${bandLabel(band)}</p>
      <h3>${rows.length} wards</h3>
      <p class="intel-body">${copy}</p>
      <div class="chip-list">
        ${sample.map((d) => `<button class="chip" data-ward="${escapeAttr(d.ward)}" type="button">${d.ward} ${d.svi.toFixed(2)}</button>`).join("")}
      </div>
    `;
  },

  rainIntel() {
    const key = this.state.rainKey || "Govandi";
    const focus = this.focus.find((f) => f.key === key);
    const row = this.wardById(focus?.id);
    const series = this.data.daily;
    const peak = series.length ? d3.greatest(series, (d) => d[key]) : null;
    const today = series[series.length - 1];
    return `
      <p class="intel-kicker">Rainfall</p>
      <h3>${key}</h3>
      <p class="intel-lede">${row ? row.ward : ""} · last 15 days of precipitation</p>
      <div class="stat-grid">
        <div class="stat-card"><span>Today (or latest)</span><strong>${today ? today[key].toFixed(1) + " mm" : "—"}</strong></div>
        <div class="stat-card"><span>Peak day</span><strong>${peak ? peak[key].toFixed(1) + " mm" : "—"}</strong></div>
      </div>
      <p class="intel-body">Open-Meteo point forecast at the ward centroid — not a BMC rain gauge. Use it as a live monsoon pulse next to the slower exposure index. ${row && row.theme1 >= 0.75 ? "This ward already sits high on flood/drainage, so the same millimetres matter more." : ""}</p>
      <p class="intel-kicker">Other rain layers</p>
      <div class="chip-list">${this.focus.map((f) => `<button class="chip" data-rain="${f.key}" type="button">${f.key}</button>`).join("")}</div>
    `;
  }
};

const FACTORS = {
  "Mumbai Exposure Index": {
    kicker: "Index",
    body: "A 0–1 rank across 24 BMC wards. Flood is weighted highest (it is August). Heat, air, and services fill the rest. Percentile ranking makes the circular chart comparable to the Virginia SVI grammar.",
    why: "The point is not a fake official number. It is a way to see which wards stack hazards.",
    leaves: ["Flood / drainage", "Heat / housing", "Air / health", "Services / density"]
  },
  "Flood / drainage": {
    kicker: "Theme",
    body: "Waterlogging hotspots, coastal outfalls, nallahs, reclamation, and high-tide lock. F North has the most BMC hotspots. Thirteen wards sit in IISER’s 2025 high flood-vulnerability band, including Colaba, Worli, Dadar, Govandi, Andheri, and Kandivali.",
    why: "Rain millimetres are citywide. Who floods is local.",
    leaves: ["Waterlogging hotspots", "Coastal outfalls & high tide", "Stormwater / nallahs", "Low-lying reclamation"]
  },
  "Heat / housing": {
    kicker: "Theme",
    body: "Land surface temperature, informal housing, canopy, crowding. MCAP: M East has over 40% of people on surfaces hotter than 35°C. Metal roofs and missing trees turn the same heatwave into different wards.",
    why: "Heat is the slow disaster between monsoons.",
    leaves: ["Land surface temperature", "Informal housing / slums", "Tree canopy", "Crowding"]
  },
  "Air / health": {
    kicker: "Theme",
    body: "PM2.5, NO2, dumps, industry, and monsoon disease. Deonar, Trombay, Kurla, the airport belt, and Byculla sit higher. Live AQI is Open-Meteo at the ward point. BMC’s 2026 monsoon watch: malaria up, dengue breeding sites still active.",
    why: "Winter will make this theme the live layer. In August it still marks who lives next to the dump and the highway.",
    leaves: ["PM2.5 & NO2", "Industry & dumps", "Monsoon vector disease"]
  },
  "Services / density": {
    kicker: "Theme",
    body: "Density, sanitation, open space, last-mile drains. Dharavi (H East), M East, Kurla, and Malad carry the service strain. A high score here means the same flood or heatwave hits more people with fewer exits.",
    why: "This is the SVI-like bone inside a climate index.",
    leaves: ["Population density", "Sanitation access", "Open space", "Last-mile drainage"]
  },
  "Waterlogging hotspots": { kicker: "Factor", body: "BMC-reported flooding spots. F North has 54 — the city high. Living within 250 m of a hotspot is the MCAP exposure metric.", why: "Hotspots are where rain becomes a civic event." },
  "Coastal outfalls & high tide": { kicker: "Factor", body: "When the tide is up, stormwater cannot leave. BMC publishes tide times daily in monsoon. Island City and creek wards feel this first.", why: "Same rain, different clock." },
  "Stormwater / nallahs": { kicker: "Factor", body: "Mithi, Poisar, Dahisar, Oshiwara. Encroached sections and debris turn a drain into a tank.", why: "Kurla and Andheri East live on this geometry." },
  "Low-lying reclamation": { kicker: "Factor", body: "Backbay, Worli, Bandra-Kurla. New land, old outfalls.", why: "High land value, high flood list." },
  "Land surface temperature": { kicker: "Factor", body: "Satellite heat, not the Colaba weather station. Eastern suburbs run hotter.", why: "M East is the MCAP heat example." },
  "Informal housing / slums": { kicker: "Factor", body: "Metal, plastic, no setback, shared water. Heat, flood, and vector risk arrive together.", why: "Estimated slum share is in the ward cards — treat it as order-of-magnitude." },
  "Tree canopy": { kicker: "Factor", body: "SGNP, Aarey, Malabar Hill vs Deonar and Dharavi.", why: "Canopy is the cheapest heat infrastructure." },
  Crowding: { kicker: "Factor", body: "People per room, people per km². C ward is tiny and packed. M East is large and still packed.", why: "Density decides whether a hotspot is an inconvenience or a mass event." },
  "PM2.5 & NO2": { kicker: "Factor", body: "CPCB / BMC / MPCB / IITM stations plus Open-Meteo. Winter is worse. The index still marks industrial and highway wards in monsoon.", why: "AQI is the live number; the theme is the geography." },
  "Industry & dumps": { kicker: "Factor", body: "Deonar dumping ground, Trombay, Mahul, SEEPZ, the port.", why: "Air and stigma stack on the same wards as heat and flood." },
  "Monsoon vector disease": { kicker: "Factor", body: "Malaria cases were up about 11% this season vs last. BMC found thousands of Aedes breeding sites. Stagnant floodwater is the mechanism.", why: "Health is not a separate dashboard in August." },
  "Population density": { kicker: "Factor", body: "2011 census over BMC ward area. Island City compact wards vs sprawling T and R Central.", why: "Old census, still the best open ward table." },
  "Sanitation access": { kicker: "Factor", body: "MCAP called out F North: only about half of households with a latrine in some pockets, on top of flood exposure.", why: "Flood plus toilets is a public-health sentence." },
  "Open space": { kicker: "Factor", body: "Maidans, mangroves, SGNP vs built-out Kurla and M East.", why: "Open space is flood storage and heat relief." },
  "Last-mile drainage": { kicker: "Factor", body: "The pipe that does not exist inside a slum pocket. City-scale pumps do not drain a lane.", why: "This is why services is a theme, not a footnote." }
};

const BAND_COPY = {
  high: "High exposure (≥ 0.75). These wards stack flood and/or heat with thin services. M East, Kurla, H East, F North, and K East sit here. The rain chart is drawn from this end of the index plus Ghatkopar (N) after the August 2026 landslide.",
  "mod-high": "Moderate-to-high. Dadar, Byculla, Marine Lines, Kandivali, Bhandup. Not the worst scores, but enough stacked hazard that a heavy-rain-plus-tide day still finds them.",
  "mod-low": "Low-to-moderate. Mixed island-city and western-suburb wards. One theme may still spike — check the radar.",
  low: "Low exposure (≤ 0.25). Grant Road / Malabar Hill, Mulund, Bandra West, Borivali. More elevation, canopy, or services. They still flood in spots; they do not lead the city."
};

function wardAssessment(row) {
  if (row.rank === 1) return "Highest composite exposure among the 24 wards. Other bars are ranked against this one.";
  if (row.svi >= 0.75) return "High exposure. Flood and heat are not background; they are the operating environment.";
  if (row.svi <= 0.25) return "Low on this index. More buffer on heat, air, or services — the radar sits closer to the origin.";
  return "Mid-band. Click a radar axis to see which theme is carrying the risk.";
}

function themeValue(row, name) {
  if (!row) return null;
  if (name === "Mumbai Exposure Index") return row.svi;
  if (name === "Flood / drainage") return row.theme1;
  if (name === "Heat / housing") return row.theme2;
  if (name === "Air / health") return row.theme3;
  if (name === "Services / density") return row.theme4;
  return null;
}

function bandOf(v) {
  if (v > 0.75) return "high";
  if (v > 0.5) return "mod-high";
  if (v > 0.25) return "mod-low";
  return "low";
}

function bandLabel(band) {
  return {
    high: "High exposure",
    "mod-high": "Moderate to high exposure",
    "mod-low": "Low to moderate exposure",
    low: "Low exposure",
    all: "All wards",
    focus: "Five rain wards"
  }[band] || band;
}

function bandColor(v) {
  if (v > 0.75) return "#9c5a4e";
  if (v > 0.5) return "#c48962";
  if (v > 0.25) return "#cbb688";
  return "#7d9a86";
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function mountSize(id) {
  const el = document.getElementById(id);
  const r = el.getBoundingClientRect();
  return { el, width: Math.max(160, r.width), height: Math.max(160, r.height) };
}

window.MXUtils = { bandOf, bandColor, bandLabel, themeValue, mountSize, debounce };

MumbaiDash.tooltip = {
  el: null,
  show(event, html) {
    const el = this.el || (this.el = document.getElementById("mc-tooltip"));
    el.hidden = false;
    el.innerHTML = html;
    el.style.left = `${event.clientX + 12}px`;
    el.style.top = `${event.clientY + 12}px`;
  },
  hide() {
    const el = this.el || document.getElementById("mc-tooltip");
    if (el) el.hidden = true;
  }
};

window.addEventListener("load", () => {
  MumbaiDash.boot().catch((err) => {
    const log = document.getElementById("boot-log");
    if (log) log.textContent = "Could not load data — " + err.message;
    console.error(err);
  });
});
