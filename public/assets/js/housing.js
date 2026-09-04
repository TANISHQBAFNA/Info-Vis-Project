/**
 * Dual-place housing dashboard. Reads committed snapshots only.
 */
(function (global) {
  "use strict";

  const DEFAULTS = { va: "51059", mumbai: "M/E" };

  const METRICS = {
    va: [
      { id: "ppsf", label: "Sale $ / sq ft", kind: "ppsf", hint: "Redfin closed-sale median PPSF" },
      { id: "zhvi", label: "Typical home $", kind: "usd", hint: "Zillow ZHVI, mid-tier" },
      { id: "fmr_2br", label: "2BR FMR / mo", kind: "rent", hint: "HUD FY2026 Fair Market Rent" },
      { id: "acs_median_rent", label: "ACS rent / mo", kind: "rent", hint: "Census ACS median gross rent" }
    ],
    mumbai: [
      { id: "asr_psf", label: "ASR ₹ / sq ft", kind: "inr", hint: "IGR ready reckoner midpoint, carpet-equivalent ₹/sq ft" }
    ]
  };

  const HousingDash = {
    place: "va",
    metric: "ppsf",
    selectedId: DEFAULTS.va,
    sources: null,
    vaRows: [],
    vaGeo: null,
    mxRows: [],
    mxGeo: null,
    mxCity: null,

    boot() {
      const log = document.getElementById("boot-log");
      const screen = document.getElementById("boot-screen");
      const line = (t) => { if (log) log.textContent = t; };
      Promise.all([
        d3.json("assets/data/housing/sources.json"),
        d3.csv("assets/data/housing/va-housing.csv", parseVa),
        d3.json("assets/data/housing/va-counties.geojson"),
        d3.csv("assets/data/housing/mumbai-wards.csv", parseMx),
        d3.json("assets/data/housing/mumbai-wards.geojson"),
        d3.json("assets/data/housing/mumbai-city.json")
      ]).then(([sources, vaRows, vaGeo, mxRows, mxGeo, mxCity]) => {
        this.sources = sources;
        this.vaRows = vaRows;
        this.vaGeo = vaGeo;
        this.mxRows = mxRows;
        this.mxGeo = mxGeo;
        this.mxCity = mxCity;
        try { this.mount(); }
        catch (err) {
          console.error("mount fail", err);
          const dash = document.querySelector(".dashboard");
          if (dash) dash.hidden = false;
        }
        if (screen) screen.classList.add("is-done");
      }).catch(err => {
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

    rows() { return this.place === "va" ? this.vaRows : this.mxRows; },
    geo() { return this.place === "va" ? this.vaGeo : this.mxGeo; },
    idKey() { return this.place === "va" ? "fips" : "id"; },
    selected() {
      const key = this.idKey();
      return this.rows().find(r => String(r[key]) === String(this.selectedId)) || this.rows()[0];
    },
    metricDef() {
      return METRICS[this.place].find(m => m.id === this.metric) || METRICS[this.place][0];
    },

    setPlace(place) {
      if (place !== "va" && place !== "mumbai") return;
      this.place = place;
      this.metric = METRICS[place][0].id;
      this.selectedId = DEFAULTS[place];
      this.render();
    },

    setMetric(id) {
      if (!METRICS[this.place].some(m => m.id === id)) return;
      this.metric = id;
      this.render();
    },

    select(id) {
      if (!id) return;
      const key = this.idKey();
      if (!this.rows().some(r => String(r[key]) === String(id))) return;
      this.selectedId = id;
      this.render();
    },

    bind() {
      document.querySelectorAll("[data-place]").forEach(btn => {
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
        t = setTimeout(() => this.drawMap(), 160);
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
        const hits = this.rows().filter(r =>
          !s || String(r.name).toLowerCase().includes(s) ||
          String(r.places || "").toLowerCase().includes(s) ||
          String(r[key]).toLowerCase() === s
        ).slice(0, 12);
        list.innerHTML = hits.map(r =>
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
      document.querySelectorAll("[data-place]").forEach(btn => {
        const on = btn.getAttribute("data-place") === this.place;
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.classList.toggle("is-active", on);
      });
      this.renderMetrics();
      this.renderKpis();
      this.renderAbout();
      this.drawMap();
      this.stamp();
      const search = document.getElementById("place-search");
      const sel = this.selected();
      if (search && sel) search.value = sel.name;
    },

    renderMetrics() {
      const row = document.getElementById("metric-row");
      if (!row) return;
      row.innerHTML = METRICS[this.place].map(m =>
        `<button type="button" class="chip${m.id === this.metric ? " is-active" : ""}" data-metric="${m.id}">${esc(m.label)}</button>`
      ).join("");
      row.querySelectorAll("[data-metric]").forEach(btn => {
        btn.addEventListener("click", () => this.setMetric(btn.getAttribute("data-metric")));
      });
    },

    renderKpis() {
      const row = document.getElementById("kpi-row");
      if (!row) return;
      const m = this.metricDef();
      const rows = this.rows();
      const vals = rows.map(r => +r[m.id]).filter(Number.isFinite);
      const max = rows.slice().sort((a, b) => (+b[m.id] || -1) - (+a[m.id] || -1))[0];
      const min = rows.slice().sort((a, b) => (+a[m.id] || 1e12) - (+b[m.id] || 1e12))[0];
      const med = d3.median(vals);
      const fmt = (v) => global.HousingMaps.fmt(v, m.kind);
      const cards = [
        kpi("PLACES", rows.length, this.place === "va" ? "counties + cities" : "BMC wards"),
        kpi("HIGHEST", fmt(max && max[m.id]), max ? max.name : "—"),
        kpi("MEDIAN", fmt(med), m.label),
        kpi("LOWEST", fmt(min && min[m.id]), min ? min.name : "—")
      ];
      if (this.place === "mumbai" && this.mxCity) {
        cards.push(kpi("RBI HPI", this.mxCity.rbi_hpi_all_india, this.mxCity.rbi_hpi_quarter + " all-India"));
        cards.push(kpi("2BHK RENT", "₹" + d3.format(",")(this.mxCity.rent_2bhk_inr), "city, not mapped"));
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
      if (this.place === "va") {
        feed.innerHTML =
          `<p class="intel-lede">FIPS ${esc(w.fips)}. Values are index snapshots, not a live listing feed.</p>
           <div class="stat-grid">
             <div class="stat-card"><span>Sale $ / sq ft</span><strong>${fmt(w.ppsf, "ppsf")}</strong></div>
             <div class="stat-card"><span>Typical home (ZHVI)</span><strong>${fmt(w.zhvi, "usd")}</strong></div>
             <div class="stat-card"><span>HUD 2BR FMR</span><strong>${fmt(w.fmr_2br, "rent")}</strong></div>
             <div class="stat-card"><span>ACS median rent</span><strong>${fmt(w.acs_median_rent, "rent")}</strong></div>
             <div class="stat-card"><span>Redfin median sale</span><strong>${fmt(w.median_sale, "usd")}</strong></div>
             <div class="stat-card"><span>ACS median value</span><strong>${fmt(w.acs_median_value, "usd")}</strong></div>
           </div>
           <p class="intel-body">HUD FMR is a bedroom rent, not per square foot — the US government does not publish county rent PSF. Many Northern Virginia counties share the Washington HMFA 2BR of $2,246, so that layer looks flat on purpose.</p>
           <p class="combo-meta">ZHVI ${esc(this.sources.vintages.zhvi)} · Redfin ${esc(this.sources.vintages.redfin_ppsf)} · HUD ${esc(this.sources.vintages.hud_fmr)} · ${esc(this.sources.vintages.acs)}</p>`;
      } else {
        feed.innerHTML =
          `<p class="intel-lede">${esc(w.places)} · BMC ward ${esc(w.id)}</p>
           <div class="stat-grid">
             <div class="stat-card"><span>ASR ₹ / sq ft</span><strong>${fmt(w.asr_psf, "inr")}</strong></div>
             <div class="stat-card"><span>ASR ₹ / sq m</span><strong>₹${d3.format(",")(+w.asr_sqm)}</strong></div>
           </div>
           <p class="intel-body">Ready reckoner is the stamp-duty floor, usually below transacted price. Midpoint of published residential zone rates, mapped onto the 24 BMC wards because that is the polygon set we can draw. Residex locality ₹/sq ft has no public API.</p>
           <p class="intel-body">Locality rent PSF does not exist as an official series. City 2BHK rent ₹${d3.format(",")(this.mxCity.rent_2bhk_inr)} is a Magicbricks index, shown only as a KPI.</p>
           <p class="combo-meta">${esc(this.mxCity.asr_vintage)}. RBI HPI all-India ${this.mxCity.rbi_hpi_all_india} (${esc(this.mxCity.rbi_hpi_quarter)}, base ${esc(this.mxCity.rbi_hpi_base)}).</p>`;
      }
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
          ? "Each shape is a county or independent city"
          : "Each shape is a BMC administrative ward";
      }
      if (!global.HousingMaps) return;
      try {
        HousingMaps.draw({
          geo: this.geo(),
          rows: this.rows().map(r => Object.assign({}, r, { label: r.name })),
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

    stamp() {
      const el = document.getElementById("live-stamp");
      const tick = document.getElementById("ticker-line");
      const v = this.sources && this.sources.vintages || {};
      if (el) {
        el.textContent = this.place === "va"
          ? "ZHVI " + (v.zhvi || "") + " · PPSF " + (v.redfin_ppsf || "")
          : (v.mumbai_asr || "ASR");
      }
      if (tick) {
        tick.textContent = this.place === "va"
          ? "Redfin closed-sale $ / sq ft, Zillow ZHVI, HUD FY2026 2BR FMR, ACS 5-year rent. Not listings."
          : "IGR ASR ₹ / sq ft on BMC wards. RBI HPI is city/all-India. Rent is city-only (Magicbricks).";
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

  function parseVa(d) {
    return {
      fips: d.fips,
      name: d.name,
      zhvi: +d.zhvi,
      ppsf: +d.ppsf,
      median_sale: +d.median_sale,
      fmr_2br: +d.fmr_2br,
      acs_median_rent: +d.acs_median_rent,
      acs_median_value: +d.acs_median_value
    };
  }
  function parseMx(d) {
    return {
      id: d.id,
      name: d.name,
      places: d.places,
      asr_sqm: +d.asr_sqm,
      asr_psf: +d.asr_psf
    };
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
