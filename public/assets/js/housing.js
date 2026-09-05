/**
 * Dual-place housing dashboard. Zillow + Census + Open-Meteo at runtime.
 */
(function (global) {
  "use strict";

  const DEFAULTS = { va: "51059", mumbai: "M/E" };

  const METRICS = {
    va: [
      { id: "zhvi", label: "Typical home $", kind: "usd", group: "Price", live: true, hint: "Zillow ZHVI mid-tier, fetched live" },
      { id: "zhvi_yoy", label: "ZHVI YoY", kind: "yoy", group: "Price", live: true, hint: "Year-over-year change from the same ZHVI file" },
      { id: "years_rent", label: "Years of rent to buy", kind: "years", group: "Price", live: true, hint: "ZHVI ÷ (ZORI × 12). How many years of typical rent equal the typical home." },
      { id: "ppsf", label: "Sale $ / sq ft", kind: "ppsf", group: "Price", live: false, hint: "Redfin closed-sale median PPSF — yearly overlay, file too big to fetch live" },
      { id: "sale", label: "Median sale $", kind: "usd", group: "Price", live: true, hint: "Zillow county median sale price" },
      { id: "inv", label: "For-sale inventory", kind: "count", group: "Market", live: true, hint: "Zillow for-sale inventory" },
      { id: "listings", label: "New listings", kind: "count", group: "Market", live: true, hint: "Zillow new listings" },
      { id: "cuts", label: "% price cuts", kind: "pct", group: "Market", live: true, hint: "Share of listings with a price cut" },
      { id: "doz", label: "Days to pending", kind: "days", group: "Market", live: true, hint: "Zillow mean days to pending" },
      { id: "heat", label: "Market heat", kind: "heat", group: "Market", live: true, hint: "Zillow market heat index (0–100)" },
      { id: "zori", label: "ZORI rent / mo", kind: "rent", group: "Rent", live: true, hint: "Zillow Observed Rent Index" },
      { id: "fmr_2br", label: "HUD 2BR FMR", kind: "rent", group: "Rent", live: false, hint: "HUD FY2026 Fair Market Rent, 2-bedroom. Annual. HUD USER xlsx is blocked." },
      { id: "acs_rent", label: "ACS rent / mo", kind: "rent", group: "Rent", live: true, hint: "Census ACS median gross rent via Census Reporter" }
    ],
    mumbai: [
      { id: "asr_psf", label: "ASR ₹ / sq ft", kind: "inr", group: "Price", live: false, hint: "IGR ready reckoner midpoint — no public JSON API" },
      { id: "aqi", label: "US AQI now", kind: "aqi", group: "Now", live: true, hint: "Open-Meteo air quality at ward centroid" },
      { id: "pm25", label: "PM2.5", kind: "pm", group: "Now", live: true, hint: "Open-Meteo PM2.5 µg/m³" },
      { id: "temp", label: "Temp now", kind: "temp", group: "Now", live: true, hint: "Open-Meteo temperature at ward centroid" },
      { id: "rain", label: "Rain today", kind: "rain", group: "Now", live: true, hint: "Open-Meteo daily precipitation sum, Asia/Kolkata" }
    ]
  };

  const HousingDash = {
    place: "va",
    metric: "zhvi",
    selectedId: DEFAULTS.va,
    sources: null,
    va: null,
    mx: null,

    boot() {
      const log = document.getElementById("boot-log");
      const screen = document.getElementById("boot-screen");
      const line = (t) => { if (log) log.textContent = t; };
      if (!global.HousingLive) {
        line("housing-live.js missing");
        return;
      }
      Promise.all([
        d3.json("assets/data/housing/sources.json"),
        HousingLive.loadVirginia(line),
        HousingLive.loadMumbai(line)
      ]).then(([sources, va, mx]) => {
        this.sources = sources;
        this.va = va;
        this.mx = mx;
        try { this.mount(); }
        catch (err) {
          console.error("mount fail", err);
          const dash = document.querySelector(".dashboard");
          if (dash) dash.hidden = false;
        }
        if (screen) screen.classList.add("is-done");
      }).catch((err) => {
        console.error(err);
        line("Could not load data — " + (err && err.message ? err.message : err));
      });
    },

    mount() {
      const dash = document.querySelector(".dashboard");
      if (dash) dash.hidden = false;
      this.bind();
      this.render();
    },

    pack() { return this.place === "va" ? this.va : this.mx; },
    rows() { return (this.pack() && this.pack().rows) || []; },
    geo() { return this.pack() && this.pack().geo; },
    idKey() { return this.place === "va" ? "fips" : "id"; },
    selected() {
      const key = this.idKey();
      return this.rows().find((r) => String(r[key]) === String(this.selectedId)) || this.rows()[0];
    },
    metricDef() {
      return METRICS[this.place].find((m) => m.id === this.metric) || METRICS[this.place][0];
    },

    setPlace(place) {
      if (place !== "va" && place !== "mumbai") return;
      this.place = place;
      this.metric = METRICS[place][0].id;
      this.selectedId = DEFAULTS[place];
      this.render();
    },

    setMetric(id) {
      if (!METRICS[this.place].some((m) => m.id === id)) return;
      this.metric = id;
      this.render();
    },

    select(id) {
      if (!id) return;
      const key = this.idKey();
      if (!this.rows().some((r) => String(r[key]) === String(id))) return;
      this.selectedId = id;
      this.render();
    },

    bind() {
      document.querySelectorAll("[data-place]").forEach((btn) => {
        btn.addEventListener("click", () => this.setPlace(btn.getAttribute("data-place")));
      });
      const reset = document.getElementById("btn-reset");
      if (reset) reset.addEventListener("click", () => {
        this.selectedId = DEFAULTS[this.place];
        this.render();
      });
      this.bindSearch();
      let t;
      window.addEventListener("resize", () => {
        clearTimeout(t);
        t = setTimeout(() => { this.drawMap(); this.drawTime(); }, 160);
      });
    },

    bindSearch() {
      const input = document.getElementById("place-search");
      const list = document.getElementById("place-results");
      if (!input || !list) return;
      const close = () => { list.hidden = true; list.innerHTML = ""; };
      const open = (q) => {
        const s = (q || "").trim().toLowerCase();
        const key = this.idKey();
        const hits = this.rows().filter((r) =>
          !s || String(r.name).toLowerCase().includes(s) ||
          String(r.places || "").toLowerCase().includes(s) ||
          String(r.metro || "").toLowerCase().includes(s) ||
          String(r[key]).toLowerCase() === s
        ).slice(0, 12);
        list.innerHTML = hits.map((r) =>
          `<button type="button" data-id="${esc(r[key])}"><strong>${esc(r.name)}</strong></button>`
        ).join("");
        list.hidden = !hits.length;
      };
      input.addEventListener("focus", () => open(input.value));
      input.addEventListener("input", () => open(input.value));
      list.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-id]");
        if (!btn) return;
        this.select(btn.getAttribute("data-id"));
        close();
      });
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".command-bar")) close();
      });
    },

    render() {
      document.querySelectorAll("[data-place]").forEach((btn) => {
        const on = btn.getAttribute("data-place") === this.place;
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.classList.toggle("is-active", on);
      });
      this.renderMetrics();
      this.renderKpis();
      try { this.renderAbout(); }
      catch (err) { console.warn("about fail", err); }
      this.drawMap();
      this.drawTime();
      this.stamp();
      const search = document.getElementById("place-search");
      const sel = this.selected();
      if (search && sel) search.value = sel.name;
    },

    renderMetrics() {
      const row = document.getElementById("metric-row");
      if (!row) return;
      const groups = [];
      METRICS[this.place].forEach((m) => {
        let g = groups.find((x) => x.name === m.group);
        if (!g) { g = { name: m.group, items: [] }; groups.push(g); }
        g.items.push(m);
      });
      row.innerHTML = groups.map((g) =>
        `<div class="metric-group"><span class="metric-group-label">${esc(g.name)}</span>${g.items.map((m) =>
          `<button type="button" class="chip${m.id === this.metric ? " is-active" : ""}" data-metric="${m.id}">${esc(m.label)}${m.live ? '<i class="live-dot" title="Live fetch"></i>' : ""}</button>`
        ).join("")}</div>`
      ).join("");
      row.querySelectorAll("[data-metric]").forEach((btn) => {
        btn.addEventListener("click", () => this.setMetric(btn.getAttribute("data-metric")));
      });
    },

    renderKpis() {
      const row = document.getElementById("kpi-row");
      if (!row) return;
      const m = this.metricDef();
      const rows = this.rows();
      const vals = rows.map((r) => +r[m.id]).filter(Number.isFinite);
      const max = rows.slice().sort((a, b) => (+b[m.id] || -1e12) - (+a[m.id] || -1e12))[0];
      const min = rows.slice().sort((a, b) => (+a[m.id] || 1e12) - (+b[m.id] || 1e12))[0];
      const med = d3.median(vals);
      const fmt = (v) => global.HousingMaps.fmt(v, m.kind);
      const cards = [
        kpi("PLACES", rows.length, this.place === "va" ? "counties + cities" : "BMC wards"),
        kpi("HIGHEST", fmt(max && max[m.id]), max ? max.name : "—"),
        kpi("MEDIAN", fmt(med), m.label),
        kpi("LOWEST", fmt(min && min[m.id]), min ? min.name : "—")
      ];
      if (this.place === "mumbai" && this.mx && this.mx.city) {
        cards.push(kpi("RBI HPI", this.mx.city.rbi_hpi_all_india, this.mx.city.rbi_hpi_quarter + " all-India"));
        cards.push(kpi("2BHK RENT", "₹" + d3.format(",")(this.mx.city.rent_2bhk_inr), "city, not mapped"));
      }
      if (this.place === "va" && this.va && this.va.live) {
        cards.push(kpi("FEED", this.va.live.zillow ? "LIVE" : "FALLBACK", this.va.live.census ? "Zillow + ACS" : "Zillow"));
      }
      row.innerHTML = cards.join("");
    },

    renderAbout() {
      const w = this.selected();
      const feed = document.getElementById("about-feed");
      const title = document.getElementById("about-title");
      const stamp = document.getElementById("about-stamp");
      if (!w || !feed) return;
      if (title) title.textContent = w.name;
      const m = this.metricDef();
      if (stamp) stamp.textContent = m.hint;
      const fmt = global.HousingMaps.fmt;
      const spark = global.HousingMaps.spark;
      if (this.place === "va") {
        const homeP = global.HousingPath && HousingPath.project(w.zhviSeries, { officialYoy: w.zhvfYoy, years: 5 });
        const rentP = global.HousingPath && HousingPath.project(w.zoriSeries, { years: 5 });
        const agoHome = homeP && homeP.ago;
        const agoRent = rentP && rentP.ago;
        const y5h = homeP && homeP.y5;
        const y5r = rentP && rentP.y5;
        const agoYears = (agoHome && agoRent) ? agoHome.v / (agoRent.v * 12) : null;
        feed.innerHTML =
          `<p class="intel-lede">FIPS ${esc(w.fips)}${w.metro ? " · " + esc(w.metro) : ""}. Green dots on chips are live CDN fetches. Path below is 10 years of ZHVI×ZORI, not another map.</p>
           <h3 class="feed-h">10 years → now → +5y cone</h3>
           <div class="stat-grid">
             ${stat("Home 10y ago", fmt(agoHome && agoHome.v, "usd"), agoHome && agoHome.date)}
             ${stat("Home now", fmt(w.zhvi, "usd"), w.zhviVintage)}
             ${stat("Home +5y trend", fmt(y5h && y5h.mid, "usd"), homeP ? (d3.format("+.1%")(homeP.cagr) + " CAGR") : "")}
             ${stat("Rent 10y ago", fmt(agoRent && agoRent.v, "rent"), agoRent && agoRent.date)}
             ${stat("Rent now", fmt(w.zori, "rent"), w.zoriVintage)}
             ${stat("Rent +5y trend", fmt(y5r && y5r.mid, "rent"), rentP ? (d3.format("+.1%")(rentP.cagr) + " CAGR") : "")}
             ${stat("Years of rent then", fmt(agoYears, "years"))}
             ${stat("Years of rent now", fmt(w.years_rent, "years"), "ZHVI ÷ (ZORI×12)")}
             ${stat("Zillow metro Y1", Number.isFinite(w.zhvfYoy) ? d3.format("+.1f")(w.zhvfYoy) + "%" : "—", w.zhvfName || "no MSA forecast")}
           </div>
           <p class="intel-body">${homeP && Number.isFinite(homeP.officialYoy)
             ? "Year 1 of the home cone uses Zillow’s metro forecast (" + esc(w.zhvfName || "MSA") + "). Years 2–5 and all rent years are a trailing CAGR cone ±1σ of yearly returns — a trend extension, not a priced model. Nobody publishes a 5-year county forecast."
             : "No Zillow metro forecast for this county. Cone is trailing CAGR ±1σ of yearly returns. Not a model."}</p>
           <h3 class="feed-h">Price</h3>
           <div class="stat-grid">
             ${stat("Typical home (ZHVI)", fmt(w.zhvi, "usd"), w.zhviVintage)}
             ${stat("ZHVI YoY", fmt(w.zhvi_yoy, "yoy"), "same file")}
             ${stat("Sale $ / sq ft", fmt(w.ppsf, "ppsf"), w.ppsfVintage || "Redfin snapshot")}
             ${stat("Median sale", fmt(w.sale, "usd"), w.saleVintage || "Zillow")}
           </div>
           <h3 class="feed-h">Market</h3>
           <div class="stat-grid">
             ${stat("Inventory", fmt(w.inv, "count"))}
             ${stat("New listings", fmt(w.listings, "count"))}
             ${stat("% price cuts", fmt(w.cuts, "pct"))}
             ${stat("Days to pending", fmt(w.doz, "days"))}
             ${stat("Market heat", fmt(w.heat, "heat"))}
           </div>
           <h3 class="feed-h">Rent &amp; ACS</h3>
           <div class="stat-grid">
             ${stat("ZORI rent", fmt(w.zori, "rent"), w.zoriVintage)}
             ${stat("HUD 2BR FMR", fmt(w.fmr_2br, "rent"), this.va.hudVintage)}
             ${stat("ACS median rent", fmt(w.acs_rent, "rent"))}
             ${stat("ACS 2BR rent", fmt(w.acs_2br, "rent"))}
             ${stat("ACS median value", fmt(w.acs_value, "usd"))}
             ${stat("Population", fmt(w.acs_pop, "count"))}
             ${stat("Housing units", fmt(w.units, "count"))}
             ${stat("Vacant", fmt(w.vacant_pct, "pct"))}
             ${stat("Owner-occupied", fmt(w.owner_pct, "pct"))}
             ${stat("Rent ≥50% income", fmt(w.burden50_pct, "pct"))}
           </div>
           <p class="intel-body">HUD FMR is a bedroom rent, not per square foot. Many Northern Virginia counties share the Washington HMFA 2BR, so that layer looks flat on purpose. Closed-sale $/ft² has no Zillow county replacement (ZHVI PSF discontinued); Redfin’s county file is ~230 MB and cannot run in the browser.</p>
           <p class="combo-meta">${this.liveNoteVa()}</p>`;
      } else {
        const city = this.mx && this.mx.city;
        const tSpark = spark(w.tempSeries);
        const rSpark = spark(w.rainSeries);
        feed.innerHTML =
          `<p class="intel-lede">${esc(w.places)} · BMC ward ${esc(w.id)}. ASR is the stamp-duty floor. Weather and AQI are live at the ward centroid.</p>
           <h3 class="feed-h">Official price floor</h3>
           <div class="stat-grid">
             ${stat("ASR ₹ / sq ft", fmt(w.asr_psf, "inr"), city && city.asr_vintage)}
             ${stat("ASR ₹ / sq m", "₹" + d3.format(",")(+w.asr_sqm), "IGR ready reckoner")}
           </div>
           <h3 class="feed-h">Now at this ward</h3>
           <div class="stat-grid">
             ${stat("US AQI", fmt(w.aqi, "aqi"))}
             ${stat("PM2.5", fmt(w.pm25, "pm"))}
             ${stat("PM10", fmt(w.pm10, "pm"))}
             ${stat("Temperature", fmt(w.temp, "temp"))}
             ${stat("Humidity", Number.isFinite(w.humidity) ? d3.format(".0f")(w.humidity) + "%" : "—")}
             ${stat("Wind", Number.isFinite(w.wind) ? d3.format(".1f")(w.wind) + " km/h" : "—")}
             ${stat("Rain today", fmt(w.rain, "rain"))}
             ${stat("Precip now", fmt(w.precipNow, "rain"))}
           </div>
           ${tSpark ? `<p class="spark-label">Temperature, next 48h</p>${tSpark}` : ""}
           ${rSpark ? `<p class="spark-label">Precipitation, next 48h</p>${rSpark}` : ""}
           <p class="intel-body">Ready reckoner is usually below transacted price. Mapped onto 24 BMC wards because that is the polygon set we can draw. Residex locality ₹/ft² and Magicbricks listings have no CORS JSON API — not scraped. City 2BHK rent is a named research KPI, not a ward layer.</p>
           <p class="combo-meta">${this.liveNoteMx()}</p>`;
      }
    },

    liveNoteVa() {
      const v = this.va || {};
      const z = v.vintages || {};
      const bits = [];
      bits.push(v.live && v.live.zillow ? "Zillow live ZHVI " + (z.zhvi || "") : "Zillow fallback");
      bits.push(v.live && v.live.census ? "ACS live " + (v.acsRelease || "") : "ACS snapshot");
      bits.push("HUD " + (v.hudVintage || "FY2026"));
      bits.push("Redfin PPSF overlay");
      if (v.errors && v.errors.length) bits.push("errors: " + v.errors.join("; "));
      return bits.join(" · ");
    },

    liveNoteMx() {
      const mx = this.mx || {};
      const city = mx.city || {};
      const bits = [];
      bits.push(mx.live && mx.live.weather ? "Open-Meteo live" : "weather unavailable");
      if (mx.fetchedAt) bits.push("wx " + mx.fetchedAt.replace("T", " ").slice(0, 16) + "Z");
      bits.push(city.asr_vintage || "ASR");
      bits.push("RBI HPI " + (city.rbi_hpi_all_india || "") + " " + (city.rbi_hpi_quarter || ""));
      if (mx.errors && mx.errors.length) bits.push("errors: " + mx.errors.join("; "));
      return bits.join(" · ");
    },

    drawMap() {
      const title = document.getElementById("map-title");
      const hint = document.getElementById("map-hint");
      const m = this.metricDef();
      if (title) {
        title.textContent = this.place === "va"
          ? "Virginia · " + m.label
          : "Mumbai · " + m.label;
      }
      if (hint) {
        hint.textContent = this.place === "va"
          ? (m.live ? "Live Zillow / Census · each shape is a county or independent city" : "Yearly overlay · each shape is a county or independent city")
          : (m.live ? "Live Open-Meteo at ward centroid" : "Each shape is a BMC administrative ward");
      }
      if (!global.HousingMaps || !this.geo()) return;
      try {
        HousingMaps.draw({
          geo: this.geo(),
          rows: this.rows().map((r) => Object.assign({}, r, { label: r.name })),
          idKey: this.idKey(),
          metric: m.id,
          kind: m.kind,
          metricLabel: m.label,
          selectedId: this.selectedId,
          onSelect: (id) => this.select(id),
          tip: (event, html) => this.tip(html, event && event.clientX, event && event.clientY)
        });
      } catch (err) {
        console.warn("map fail", err);
      }
    },

    drawTime() {
      const title = document.getElementById("time-title");
      const hint = document.getElementById("time-hint");
      const tip = (event, html) => this.tip(html, event && event.clientX, event && event.clientY);
      if (!global.HousingPath) return;
      if (this.place === "va") {
        const w = this.selected();
        if (title) title.textContent = (w ? w.name : "County") + " · 10-year walk and 5-year cone";
        if (hint) {
          hint.textContent = Number.isFinite(w && w.zhvfYoy)
            ? "Left: rent×price path (iso-yield diagonals). Right: index 10y ago = 100. Dashed = trend; Y1 home uses Zillow metro forecast."
            : "Left: rent×price path. Right: index 10y ago = 100. Cone is CAGR ± yearly volatility. Not a 5-year official forecast.";
        }
        try {
          HousingPath.drawWalk({ row: w, rows: this.rows(), tip });
          HousingPath.drawFan({ row: w });
        } catch (err) {
          console.warn("time fail", err);
        }
      } else {
        if (title) title.textContent = "Mumbai · pay vs air (no 10-year ward series)";
        if (hint) hint.textContent = "IGR ASR has no locality time series. Scatter is yearly ₹/ft² vs live AQI — a different cut, not a fake history.";
        try {
          HousingPath.drawMxNow({
            rows: this.rows(),
            selectedId: this.selectedId,
            onSelect: (id) => this.select(id),
            tip
          });
        } catch (err) {
          console.warn("mx time fail", err);
        }
      }
    },

    stamp() {
      const el = document.getElementById("live-stamp");
      const tick = document.getElementById("ticker-line");
      if (this.place === "va") {
        const live = this.va && this.va.live && this.va.live.zillow;
        if (el) el.textContent = live ? "Zillow + ACS live" : "snapshot fallback";
        if (tick) {
          tick.textContent = live
            ? "10y ZHVI×ZORI walk + 5y cone (Zillow metro Y1, then CAGR). HUD FMR and Redfin $/ft² stay yearly overlays."
            : "Live Zillow fetch failed; showing committed fallback where needed. " + ((this.va && this.va.errors) || []).join("; ");
        }
      } else {
        const live = this.mx && this.mx.live && this.mx.live.weather;
        if (el) el.textContent = live ? "Open-Meteo live" : "ASR only";
        if (tick) {
          tick.textContent = live
            ? "IGR ASR ₹/ft² is the official yearly floor (no JSON API). AQI, PM, rain, temp fetch from Open-Meteo at each ward centroid every 15 minutes."
            : "Open-Meteo blocked or failed. ASR snapshot still mapped. " + ((this.mx && this.mx.errors) || []).join("; ");
        }
      }
    },

    tip(html, x, y) {
      const el = document.getElementById("mc-tooltip");
      if (!el) return;
      if (!html) { el.hidden = true; return; }
      el.innerHTML = html;
      el.hidden = false;
      const r = el.getBoundingClientRect();
      let left = x + 14, top = y + 14;
      if (left + r.width > innerWidth - 8) left = x - r.width - 10;
      if (top + r.height > innerHeight - 8) top = y - r.height - 10;
      el.style.left = left + "px";
      el.style.top = top + "px";
    }
  };

  function stat(label, value, note) {
    return `<div class="stat-card"><span>${esc(label)}</span><strong>${value}</strong>${note ? `<em>${esc(note)}</em>` : ""}</div>`;
  }
  function kpi(k, v, s) {
    return `<article class="kpi"><span class="kpi-label">${esc(k)}</span><span class="kpi-value">${v}</span><span class="kpi-sub">${esc(s)}</span></article>`;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  global.HousingDash = HousingDash;
  HousingDash.boot();
})(window);
