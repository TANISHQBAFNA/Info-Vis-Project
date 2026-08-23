const MissionControl = {
  state: {
    county: null,
    theme: null,
    caseKey: null,
    band: "all",
    intelMode: "overview"
  },
  data: {
    svi: [],
    info: new Map(),
    taxonomy: null,
    daily: [],
    dailyKeys: []
  },
  caseToSvi: {
    Danville: "Danville City",
    Galax: "Galax City",
    Henry: "Henry",
    Petersburg: "Petersburg City",
    Sussex: "Sussex"
  },

  async boot() {
    const log = document.getElementById("boot-log");
    const write = (msg) => { if (log) log.textContent = msg; };

    write("Loading SVI ranks…");
    const sviRows = await d3.csv("assets/data/SVICounty.csv", (d) => ({
      county: d.COUNTY,
      theme1: +d.THEME1,
      theme2: +d.THEME2,
      theme3: +d.THEME3,
      theme4: +d.THEME4,
      svi: +d.THEMES
    }));

    write("Loading county details…");
    const infoRows = await d3.csv("assets/data/County Info.csv", (d) => ({
      county: d.County,
      est: d.Est,
      origin: d.Origin,
      etymology: d.Etymology,
      population: +String(d.Population || "").replace(/[^\d.]/g, ""),
      area: parseArea(d.Area)
    }));

    write("Loading SVI themes…");
    const taxonomy = await d3.json("assets/data/SVICategory.json");

    write("Loading COVID case counts…");
    const parseTime = d3.timeParse("%d-%m-%Y");
    const daily = await d3.csv("assets/data/SVI-Top5-DailyCovidCases.csv");
    const dailyKeys = daily.columns.slice(1);
    daily.forEach((d) => {
      d.date = parseTime(d.date);
      dailyKeys.forEach((k) => { d[k] = +d[k]; });
    });

    const info = new Map();
    infoRows.forEach((row) => info.set(normName(row.county), row));
    sviRows.forEach((row, i) => {
      row.rank = i + 1;
      row.info = info.get(normName(row.county)) || null;
      row.band = bandOf(row.svi);
    });

    this.data.svi = sviRows;
    this.data.info = info;
    this.data.taxonomy = taxonomy;
    this.data.daily = daily.filter((d) => d.date);
    this.data.dailyKeys = dailyKeys;

    this.renderKpis();
    this.renderLegend();
    this.bindChrome();

    document.querySelector(".dashboard").hidden = false;
    this.observeResize();
    this.drawAll();
    this.selectCounty("Galax City", { mode: "county" });
    document.getElementById("boot-screen").classList.add("is-done");
    this.startClocks();
  },

  drawAll() {
    if (window.MCViz?.drawCircular) MCViz.drawCircular();
    if (window.MCViz?.drawRadar) MCViz.drawRadar();
    if (window.MCViz?.drawStacked) MCViz.drawStacked();
    if (window.MCViz?.drawTaxonomy) MCViz.drawTaxonomy();
  },

  observeResize() {
    const redraw = debounce(() => this.drawAll(), 160);
    const ro = new ResizeObserver(redraw);
    ["circular-chart", "radar-chart", "stacked-chart", "taxonomy-chart"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) ro.observe(el);
    });
  },

  bindChrome() {
    document.getElementById("btn-reset").addEventListener("click", () => this.reset());
    document.getElementById("kpi-row").addEventListener("click", (e) => {
      const btn = e.target.closest(".kpi");
      if (!btn) return;
      this.selectBand(btn.dataset.band);
    });

    const input = document.getElementById("county-search");
    const results = document.getElementById("county-results");
    input.addEventListener("input", () => this.renderSearch(input.value));
    input.addEventListener("focus", () => this.renderSearch(input.value));
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".command-bar")) results.hidden = true;
    });
    results.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-county]");
      if (!btn) return;
      input.value = btn.dataset.county;
      results.hidden = true;
      this.selectCounty(btn.dataset.county);
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
    const results = document.getElementById("county-results");
    const q = (query || "").trim().toLowerCase();
    const matches = this.data.svi
      .filter((d) => !q || d.county.toLowerCase().includes(q))
      .slice(0, 12);
    results.innerHTML = matches
      .map((d) => `<li><button type="button" data-county="${escapeAttr(d.county)}">${d.county} · SVI ${d.svi.toFixed(3)}</button></li>`)
      .join("");
    results.hidden = matches.length === 0;
  },

  renderKpis() {
    const counts = { high: 0, "mod-high": 0, "mod-low": 0, low: 0 };
    this.data.svi.forEach((d) => { counts[d.band] += 1; });
    const peak = d3.max(this.data.daily, (d) => this.data.dailyKeys.reduce((sum, k) => sum + d[k], 0)) || 0;
    const kpis = [
      { band: "all", label: "Counties & cities", value: String(this.data.svi.length), sub: "Virginia jurisdictions", accent: "var(--ink)" },
      { band: "high", label: "High SVI", value: String(counts.high), sub: "Score ≥ 0.75", accent: "var(--high)" },
      { band: "mod-high", label: "Moderate–high", value: String(counts["mod-high"]), sub: "0.50 – 0.75", accent: "var(--mod-high)" },
      { band: "low", label: "Low SVI", value: String(counts.low), sub: "Score ≤ 0.25", accent: "var(--low)" },
      { band: "sentinel", label: "Peak daily cases", value: peak.toLocaleString(), sub: "Stacked total, five counties", accent: "var(--accent)" }
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
    const line = items[this.tickerIndex % items.length];
    document.getElementById("ticker-line").textContent = line;
  },

  tickerItems() {
    const top = this.data.svi[0];
    const bottom = this.data.svi[this.data.svi.length - 1];
    const items = [
      "CDC/ATSDR SVI ranks every tract on 15 social factors, rolled into four themes and one overall score.",
      `${top.county} holds the highest SVI in the Commonwealth (${top.svi.toFixed(3)}).`,
      `${bottom.county} ranks lowest SVI (${bottom.svi.toFixed(3)}) — more buffer when a disaster hits.`,
      "Galax City is 8 sq mi with 6,660 people. Density plus thin infrastructure is the vulnerability signature.",
      "January 2022 Omicron wave: Galax recorded 550 new cases in a single day — about 8% of the city.",
      "Click a county, a theme, or a case layer to update the notes on the right.",
      "High-SVI places did not just get sicker by chance — poverty, crowding, and transport gaps compound exposure."
    ];
    const row = this.selectedRow();
    if (row) items.unshift(`${row.county} · SVI ${row.svi.toFixed(3)} · rank ${row.rank} of ${this.data.svi.length}`);
    if (this.state.theme) items.unshift(`Theme: ${this.state.theme}`);
    return items;
  },

  selectedRow() {
    return this.data.svi.find((d) => d.county === this.state.county) || null;
  },

  sviToCase(county) {
    const found = Object.entries(this.caseToSvi).find(([, v]) => v === county);
    return found ? found[0] : null;
  },

  selectCounty(name, opts = {}) {
    const row = this.data.svi.find((d) => d.county === name);
    if (!row) return;
    this.state.county = row.county;
    this.state.caseKey = this.sviToCase(row.county);
    this.state.intelMode = opts.mode || "county";
    if (opts.theme) this.state.theme = opts.theme;
    this.sync();
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
    if (band === "sentinel") {
      this.state.intelMode = "sentinel";
      this.state.caseKey = this.state.caseKey || "Galax";
      this.selectCounty(this.caseToSvi[this.state.caseKey] || "Galax City", { mode: "sentinel" });
      return;
    }
    this.state.intelMode = band === "all" ? "overview" : "band";
    this.sync();
  },

  selectCaseKey(key) {
    this.state.caseKey = key;
    const county = this.caseToSvi[key];
    if (county) this.selectCounty(county, { mode: "cases" });
    else {
      this.state.intelMode = "cases";
      this.sync();
    }
  },

  reset() {
    this.state.county = "Galax City";
    this.state.theme = null;
    this.state.caseKey = "Galax";
    this.state.band = "all";
    this.state.intelMode = "overview";
    document.getElementById("county-search").value = "";
    this.sync();
  },

  sync() {
    this.renderKpis();
    this.renderIntel();
    this.updateTicker();
    if (window.MCViz?.updateCircular) MCViz.updateCircular();
    if (window.MCViz?.drawRadar) MCViz.drawRadar();
    if (window.MCViz?.updateStacked) MCViz.updateStacked();
    if (window.MCViz?.updateTaxonomy) MCViz.updateTaxonomy();
  },

  renderIntel() {
    const feed = document.getElementById("intel-feed");
    const stamp = document.getElementById("intel-stamp");
    const mode = this.state.intelMode;
    stamp.textContent =
      mode === "county" ? "County" :
      mode === "theme" ? "SVI factor" :
      mode === "band" ? "SVI band" :
      mode === "sentinel" || mode === "cases" ? "COVID cases" :
      "Overview";

    if (mode === "theme") feed.innerHTML = this.themeIntel();
    else if (mode === "band") feed.innerHTML = this.bandIntel();
    else if (mode === "sentinel" || mode === "cases") feed.innerHTML = this.caseIntel();
    else if (mode === "county") feed.innerHTML = this.countyIntel();
    else feed.innerHTML = this.overviewIntel();

    feed.querySelectorAll("[data-county]").forEach((el) => {
      el.addEventListener("click", () => this.selectCounty(el.dataset.county));
    });
    feed.querySelectorAll("[data-theme]").forEach((el) => {
      el.addEventListener("click", () => this.selectTheme(el.dataset.theme));
    });
    feed.querySelectorAll("[data-case]").forEach((el) => {
      el.addEventListener("click", () => this.selectCaseKey(el.dataset.case));
    });
  },

  overviewIntel() {
    const high = this.data.svi.filter((d) => d.band === "high").length;
    const top = this.data.svi.slice(0, 5);
    const bottom = this.data.svi.slice(-5).reverse();
    return `
      <p class="intel-kicker">Overview</p>
      <h3>COVID-19 DID NOT LAND EVENLY</h3>
      <p class="intel-lede">The pandemic touched everyone. Who got crushed depended on status — as individuals and as members of a place.</p>
      <p class="intel-body">While some people shifted to remote work and grocery delivery, others had to keep showing up so the rest of society could function. Social identity decided inclusion. Inclusion decided <strong>vulnerability</strong>.</p>
      <p class="intel-body">This console binds Virginia’s county-level COVID telemetry to CDC’s Social Vulnerability Index. ${this.data.svi.length} jurisdictions. ${high} sit in the high band. Click anything that glows — a bar, a ring, an axis, a case layer — and the briefing rewrites.</p>
      <div class="callout">Every community faces disasters. Poverty, no vehicle, crowded housing: those are not side notes. They are the SVI. They decide who can get out, who can stay home, and who gets sick first.</div>
      <p class="intel-kicker">Highest SVI</p>
      <div class="chip-list">${top.map((d) => `<button class="chip" data-county="${escapeAttr(d.county)}" type="button">${d.county}</button>`).join("")}</div>
      <p class="intel-kicker">Lowest SVI</p>
      <div class="chip-list">${bottom.map((d) => `<button class="chip" data-county="${escapeAttr(d.county)}" type="button">${d.county}</button>`).join("")}</div>
      <p class="intel-body">Method notes: circular array after <a href="https://d3-graph-gallery.com/circular_barplot.html" target="_blank" rel="noopener">d3-graph-gallery</a>. Index definitions from CDC/ATSDR SVI. Case stream is VDH daily counts for five high-SVI sentinels, Mar 2020–May 2022.</p>
    `;
  },

  countyIntel() {
    const row = this.selectedRow();
    if (!row) return this.overviewIntel();
    const info = row.info;
    const pop = info?.population;
    const area = info?.area;
    const density = pop && area ? pop / area : null;
    const caseKey = this.sviToCase(row.county);
    const meters = [
      ["Socioeconomic", row.theme1, "Socioeconomic"],
      ["Household", row.theme2, "Household Composition & Disability"],
      ["Minority / language", row.theme3, "Minority Status & language"],
      ["Housing / transport", row.theme4, "Housing Type & Transportation"]
    ];
    const assessment = countyAssessment(row, { pop, area, density, caseKey });
    return `
      <p class="intel-kicker">County</p>
      <h3>${row.county}</h3>
      <p class="intel-lede">${bandLabel(row.band)} · rank ${row.rank} of ${this.data.svi.length} · SVI ${row.svi.toFixed(4)}</p>
      <div class="stat-grid">
        <div class="stat-card"><span>POPULATION</span><strong>${pop ? pop.toLocaleString() : "—"}</strong></div>
        <div class="stat-card"><span>AREA</span><strong>${area ? area.toLocaleString() + " sq mi" : "—"}</strong></div>
        <div class="stat-card"><span>DENSITY</span><strong>${density ? Math.round(density).toLocaleString() + " /sq mi" : "—"}</strong></div>
        <div class="stat-card"><span>ESTABLISHED</span><strong>${info?.est || "—"}</strong></div>
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
      <p class="intel-body">${assessment}</p>
      ${info?.origin ? `<p class="intel-body"><strong>Origin.</strong> ${info.origin}</p>` : ""}
      ${caseKey ? `<div class="callout">This jurisdiction is on the sentinel case stream. Open layer <button class="chip" data-case="${caseKey}" type="button">${caseKey}</button> to read the epidemic curve.</div>` : ""}
    `;
  },

  themeIntel() {
    const name = this.state.theme;
    const copy = FACTORS[name] || FACTORS["Social Vulnerability Index (SVI)"];
    const row = this.selectedRow();
    const value = themeValue(row, name);
    return `
      <p class="intel-kicker">${copy.kicker}</p>
      <h3>${name}</h3>
      ${value != null ? `<p class="intel-lede">${row.county} scores ${(+value).toFixed(4)} on this axis.</p>` : ""}
      <p class="intel-body">${copy.body}</p>
      ${copy.leaves ? `<p class="intel-kicker">Related factors</p><div class="chip-list">${copy.leaves.map((leaf) => `<button class="chip" data-theme="${escapeAttr(leaf)}" type="button">${leaf}</button>`).join("")}</div>` : ""}
      <p class="intel-body">${copy.why}</p>
    `;
  },

  bandIntel() {
    const band = this.state.band;
    const rows = this.data.svi.filter((d) => d.band === band);
    const sample = rows.slice(0, 8);
    const copy = BAND_COPY[band] || BAND_COPY.high;
    return `
      <p class="intel-kicker">${bandLabel(band)}</p>
      <h3>${rows.length} JURISDICTIONS</h3>
      <p class="intel-body">${copy}</p>
      <div class="chip-list">
        ${sample.map((d) => `<button class="chip" data-county="${escapeAttr(d.county)}" type="button">${d.county} ${d.svi.toFixed(2)}</button>`).join("")}
      </div>
    `;
  },

  caseIntel() {
    const key = this.state.caseKey || "Galax";
    const county = this.caseToSvi[key];
    const row = this.data.svi.find((d) => d.county === county);
    const series = this.data.daily;
    const peak = d3.greatest(series, (d) => d[key]);
    const last = series[series.length - 1];
    return `
      <p class="intel-kicker">COVID case trend</p>
      <h3>${key} daily cases</h3>
      <p class="intel-lede">${county} · SVI ${row ? row.svi.toFixed(3) : "—"} · ${row ? bandLabel(row.band) : ""}</p>
      <div class="stat-grid">
        <div class="stat-card"><span>PEAK DAILY</span><strong>${peak ? peak[key].toLocaleString() : "—"}</strong></div>
        <div class="stat-card"><span>PEAK DATE</span><strong>${peak ? d3.timeFormat("%d %b %Y")(peak.date) : "—"}</strong></div>
      </div>
      <p class="intel-body">The stream tracks five high-SVI places — Danville, Galax, Henry, Petersburg, Sussex — from March 2020 through May 2022. They were chosen because social vulnerability and case burden travel together, not because they are the only wounded counties.</p>
      <div class="callout">Galax City, population 6,660, hit 550 new cases on 20 Jan 2022. That is not a rounding error. In a city of eight square miles, Omicron moved like a spark through dry grass.</div>
      <p class="intel-body">The top-SVI places share a pattern: high density or trapped geography, household composition near the ceiling, and socioeconomic scores that leave no slack. Low-SVI counties (Powhatan, New Kent, Hanover) sit at the other pole — lower density, stronger household and housing scores, more room to absorb a shock.</p>
      <div class="chip-list">
        ${this.data.dailyKeys.map((k) => `<button class="chip" data-case="${k}" type="button">${k}</button>`).join("")}
      </div>
    `;
  },

  tooltip: {
    show(event, html) {
      const el = document.getElementById("mc-tooltip");
      el.innerHTML = html;
      el.hidden = false;
      const x = event.clientX + 14;
      const y = event.clientY + 14;
      const maxX = window.innerWidth - el.offsetWidth - 12;
      const maxY = window.innerHeight - el.offsetHeight - 12;
      el.style.left = Math.min(x, maxX) + "px";
      el.style.top = Math.min(y, maxY) + "px";
    },
    hide() {
      document.getElementById("mc-tooltip").hidden = true;
    }
  }
};

window.MissionControl = MissionControl;
window.MCViz = window.MCViz || {};

const FACTORS = {
  "Social Vulnerability Index (SVI)": {
    kicker: "ROOT INDEX",
    body: "Census tracts are the grains. CDC/ATSDR ranks each tract on 15 social factors, groups them into four themes, then issues an overall percentile. This console rolls those ranks up to Virginia counties and independent cities so the index can talk to case counts.",
    why: "A high overall SVI is not a personality test. It is a forecast of who will need help first when the next wave, flood, or shutdown arrives.",
    leaves: ["Socioeconomic", "Household Composition & Disability", "Minority Status & language", "Housing Type & Transportation"]
  },
  Socioeconomic: {
    kicker: "THEME 01",
    body: "Poverty, unemployment, income, and missing diplomas. This theme measures whether a place has slack — savings, jobs, and the paperwork of opportunity — when work stops and clinics fill.",
    why: "In this dataset the highest-SVI counties pin this axis near 1.0. Thin wallets become thin options: you cannot isolate if you cannot miss a shift.",
    leaves: ["Below Poverty", "Unemployed", "Income", "No High School Diploma"]
  },
  "Household Composition & Disability": {
    kicker: "THEME 02",
    body: "Age at both ends, disability, and single-parent households. These are the people who need caregivers, and the caregivers who cannot leave.",
    why: "Galax City scores 1.000 here — the ceiling. A household under strain cannot also be the public-health system.",
    leaves: ["Aged 65 or Older", "Aged 17 or Younger", "Civilian with a Disability", "Single-Parent Household"]
  },
  "Minority Status & language": {
    kicker: "THEME 03",
    body: "Minority population and people who speak English less than well. Language and racialized access shape who hears the warning, who trusts the messenger, and who gets a test.",
    why: "This theme is not destiny. It is a map of where outreach has to work harder than a press conference.",
    leaves: ["Minority", "Speaks English Less Than well"]
  },
  "Housing Type & Transportation": {
    kicker: "THEME 04",
    body: "Multi-unit buildings, mobile homes, crowding, no vehicle, group quarters. Housing is how a virus travels at night. Transport is how a worker still has to travel in the morning.",
    why: "Crowding plus no car is a trap: you share air at home and you cannot leave the exposure geography.",
    leaves: ["Multi Unit structure", "Mobile Homes", "Crowding", "No Vehicle", "Group Quaters"]
  },
  "Below Poverty": { kicker: "FACTOR", body: "Share of people living below poverty. Poverty turns a two-week isolation order into a choice between rent and health.", why: "High-SVI Virginia cities load this factor hard. It is the first gear in the socioeconomic theme." },
  Unemployed: { kicker: "FACTOR", body: "Unemployment. Job loss in a pandemic is both an outcome and a cause — it strips insurance, food security, and the ability to stay home on purpose.", why: "Watch this axis alongside income. Together they describe whether a county can pause." },
  Income: { kicker: "FACTOR", body: "Income level, inverted into vulnerability. Lower income, higher rank. Money is the quiet PPE.", why: "The original stacked-case story is also an income story: who could disappear from the workplace and who could not." },
  "No High School Diploma": { kicker: "FACTOR", body: "Adults without a high-school diploma. Education tracks job type, health literacy, and bargaining power over risk.", why: "It is not a moral score. It is a channel through which warnings either arrive or bounce." },
  "Aged 65 or Older": { kicker: "FACTOR", body: "Older adults. COVID lethality climbed the age curve. Places with older households needed a different kind of shield.", why: "Pair this with disability and no-vehicle scores: aging in place without a ride is a medical emergency waiting on a calendar." },
  "Aged 17 or Younger": { kicker: "FACTOR", body: "Children. Schools, childcare, and multigenerational homes stitch kids into the transmission graph.", why: "Households with children could not treat lockdown as a quiet office." },
  "Civilian with a Disability": { kicker: "FACTOR", body: "Civilians with a disability. Support networks, accessible transport, and medical dependence all raise the cost of disruption.", why: "A disaster plan that assumes everyone can walk to a site has already failed this factor." },
  "Single-Parent Household": { kicker: "FACTOR", body: "Single-parent households. One adult, every role. When school closed, work and care collided with no spare adult.", why: "Galax’s household theme hitting 1.0 is this kind of pressure, stacked." },
  Minority: { kicker: "FACTOR", body: "Minority population share. In U.S. pandemic data, racialized exposure at work and in housing kept repeating.", why: "Read it with language, crowding, and income — never as a standalone stereotype." },
  "Speaks English Less Than well": { kicker: "FACTOR", body: "Limited English. Alerts, vaccine sites, and clinic scripts fail if they only exist in one tongue.", why: "This is a communications design problem with a body count." },
  "Multi Unit structure": { kicker: "FACTOR", body: "Multi-unit housing. Shared halls, shared air, shared elevators.", why: "Density is not urban glamour during a respiratory wave. It is a multiplier." },
  "Mobile Homes": { kicker: "FACTOR", body: "Mobile homes. Construction quality, siting, and tenure often travel with fewer protective resources.", why: "In rural Virginia this factor can rival city crowding as a vulnerability signature." },
  Crowding: { kicker: "FACTOR", body: "Crowding — more people than rooms. Isolation becomes a story you tell, not a room you enter.", why: "This is one of the most mechanical COVID links in the whole index." },
  "No Vehicle": { kicker: "FACTOR", body: "No vehicle. Testing sites, grocery, and night-shift jobs all recede.", why: "Transit-poor counties make staying safe a logistics puzzle." },
  "Group Quaters": { kicker: "FACTOR", body: "Group quarters — dorms, prisons, nursing homes, shelters. The virus loves a roster.", why: "A single introduction can become a cluster before the rest of the county notices." }
};

const BAND_COPY = {
  high: "High SVI (≥ 0.75) is the red ring. These places entered COVID already carrying poverty, household strain, and housing pressure. Galax, Petersburg, Danville, Emporia, Hopewell sit at the top of the array. The case stream’s sentinel five were pulled from this neighborhood of the index.",
  "mod-high": "Moderate-to-high SVI is the warning amber. Not the ceiling, but enough stacked disadvantage that a long wave still finds the seams — especially where density or group quarters add a spark.",
  "mod-low": "Low-to-moderate SVI. Some protective structure, some remaining weak joints. These counties are easy to ignore in a highlight reel and still worth watching when a variant arrives.",
  low: "Low SVI (≤ 0.25) is the green ring. Powhatan, New Kent, Hanover, Poquoson, Mathews live here. Density is usually lower. Socioeconomic and housing scores leave slack. That slack is the difference between a wave and a wreck."
};

function countyAssessment(row, extra) {
  const bits = [];
  if (row.rank === 1) {
    bits.push("Highest SVI in the Commonwealth. This is the calibration target — the place the rest of the array is measured against.");
  } else if (row.svi >= 0.75) {
    bits.push("High vulnerability. Socioeconomic and housing pressure are not background color here; they are the operating environment.");
  } else if (row.svi <= 0.25) {
    bits.push("Low vulnerability on the index. More buffer on income, household, and housing — which is why the radar sits close to the origin.");
  } else {
    bits.push("Mid-band SVI. The radar will show which theme is carrying the risk — click an axis to isolate it.");
  }
  if (extra.area && extra.area <= 15 && extra.density && extra.density > 400) {
    bits.push(`Small footprint (${extra.area} sq mi) with real density. Limited land cannot host unlimited clinics, housing, and jobs. That squeeze is part of the SVI story.`);
  }
  if (row.theme2 >= 0.95) {
    bits.push("Household composition is near the ceiling. Care burdens are structural, not anecdotal.");
  }
  if (extra.caseKey) {
    bits.push("Because this county is on the sentinel stream, the bottom chart is not decoration — it is this place’s epidemic handwriting.");
  }
  return bits.join(" ");
}

function themeValue(row, name) {
  if (!row) return null;
  if (name === "Social Vulnerability Index (SVI)" || name === "SVI") return row.svi;
  if (name === "Socioeconomic") return row.theme1;
  if (name === "Household Composition & Disability") return row.theme2;
  if (name === "Minority Status & language") return row.theme3;
  if (name === "Housing Type & Transportation") return row.theme4;
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
    high: "High vulnerability",
    "mod-high": "Moderate to high vulnerability",
    "mod-low": "Low to moderate vulnerability",
    low: "Low vulnerability",
    all: "All jurisdictions",
    sentinel: "Sentinel stream"
  }[band] || band;
}

function bandColor(v) {
  if (v > 0.75) return "#9c5a4e";
  if (v > 0.5) return "#c48962";
  if (v > 0.25) return "#cbb688";
  return "#7d9a86";
}

function parseArea(s) {
  if (!s) return null;
  const m = String(s).match(/([\d,.]+)\s*sq/i);
  if (m) return parseFloat(m[1].replace(/,/g, ""));
  const n = parseFloat(String(s).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ city$/, "")
    .replace(/[^a-z0-9]+/g, "");
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

window.MCUtils = { bandOf, bandColor, bandLabel, themeValue, mountSize, debounce };

window.addEventListener("load", () => {
  MissionControl.boot().catch((err) => {
    const log = document.getElementById("boot-log");
    if (log) log.textContent = "Could not load data — " + err.message;
    console.error(err);
  });
});
