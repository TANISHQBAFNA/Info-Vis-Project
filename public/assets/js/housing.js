/**
 * Dual-place housing dashboard. Zillow + Census at runtime; Mumbai ASR + census stock.
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
      { id: "asr_psf", label: "ASR ₹ / sq ft", kind: "inr", group: "Floor", live: false, hint: "IGR ready reckoner midpoint — stamp-duty floor, not transacted price" },
      { id: "asr_sqm", label: "ASR ₹ / sq m", kind: "inr_sqm", group: "Floor", live: false, hint: "Same ready-reckoner rate before conversion to sq ft" },
      { id: "floor_1000", label: "1,000 ft² RR floor", kind: "inr_amt", group: "Unit", live: false, hint: "Ready-reckoner value of 1,000 carpet sq ft in this ward" },
      { id: "years_city_rent", label: "Years of city 2BHK rent", kind: "years", group: "Unit", live: false, hint: "Ward 1,000 ft² RR floor ÷ (Magicbricks city 2BHK rent × 12). City rent, ward floor." },
      { id: "households", label: "Census households", kind: "count", group: "Stock", live: false, hint: "Census 2011 households aggregated to this BMC ward" },
      { id: "vs_peak", label: "% of Malabar Hill", kind: "pct", group: "Stock", live: false, hint: "This ward’s ASR as a share of Ward D (Malabar Hill), the 24-ward peak" }
    ]
  };

  const HousingDash = {
    place: "va",
    metric: "zhvi",
    selectedId: DEFAULTS.va,
    compareId: null,
    pairId: null,
    callouts: [],
    dim: null,
    kicker: "",
    stage: "map",
    scrubIndex: null,
    camera: "wide",
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
      if (global.HousingCine && HousingCine.bind) HousingCine.bind(this);
      else this.render({ full: true });
    },

    pack() { return this.place === "va" ? this.va : this.mx; },
    rows() { return (this.pack() && this.pack().rows) || []; },
    geo() { return this.pack() && this.pack().geo; },
    idKey() { return this.place === "va" ? "fips" : "id"; },
    selected() {
      const key = this.idKey();
      if (!this.selectedId) return null;
      return this.rows().find((r) => String(r[key]) === String(this.selectedId)) || this.rows()[0];
    },
    metricDef() {
      return METRICS[this.place].find((m) => m.id === this.metric) || METRICS[this.place][0];
    },

    setPlace(place, fromCine) {
      if (place !== "va" && place !== "mumbai") return;
      if (!fromCine && global.HousingCine && HousingCine.scenes && HousingCine.scenes.length) {
        HousingCine.goPlace(place);
        return;
      }
      this.place = place;
      this.metric = METRICS[place][0].id;
      this.selectedId = DEFAULTS[place];
      this.compareId = null;
      this.scrubIndex = null;
      this.camera = "wide";
      this.render({ full: true, wipe: true });
    },

    setMetric(id) {
      if (!METRICS[this.place].some((m) => m.id === id)) return;
      this.metric = id;
      this.render({ skipTime: true });
    },

    select(id) {
      if (!id) return;
      const key = this.idKey();
      if (!this.rows().some((r) => String(r[key]) === String(id))) return;
      this.selectedId = id;
      this.camera = "tight";
      this.dim = "story";
      this.scrubIndex = null;
      this.render({ fly: true });
    },

    applyScene(scene, how) {
      if (!scene) return;
      const placeChanged = scene.place && scene.place !== this.place;
      if (placeChanged) {
        this.place = scene.place;
        this.compareId = null;
        this.scrubIndex = null;
        if (this._playTimer) {
          this._playTimer.stop();
          this._playTimer = null;
          this.syncPlayBtn && this.syncPlayBtn();
        }
      }
      if (scene.metric && METRICS[this.place] && METRICS[this.place].some((m) => m.id === scene.metric)) {
        this.metric = scene.metric;
      }
      if (scene.select === "none" || scene.select === "") this.selectedId = null;
      else if (scene.select) this.selectedId = scene.select;
      this.pairId = scene.pair || null;
      this.callouts = scene.callouts || [];
      this.dim = scene.dim || null;
      this.kicker = scene.kicker || "";
      this.camera = scene.camera || "wide";
      this.stage = scene.stage || "map";
      this.setStage(this.stage);
      this.render({ full: placeChanged, wipe: placeChanged, fly: !!(how && how.fly) });
      requestAnimationFrame(() => {
        this.drawMap({ fly: !!(how && how.fly) });
        this.drawTime();
      });
    },

    setStage(stage) {
      this.stage = stage || "map";
      document.body.dataset.stage = this.stage;
      document.querySelectorAll(".film-picture").forEach((el) => {
        el.classList.toggle("is-on", el.getAttribute("data-stage") === this.stage);
      });
    },

    toggleCompare() {
      if (this.compareId && String(this.compareId) === String(this.selectedId)) {
        this.compareId = null;
      } else {
        this.compareId = this.selectedId;
      }
      this.syncPin();
      this.render();
    },

    syncPin() {
      const btn = document.getElementById("btn-pin");
      if (!btn) return;
      const on = !!this.compareId;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-active", on);
      const cmp = this.compareId && this.rows().find((r) => String(r[this.idKey()]) === String(this.compareId));
      btn.textContent = on ? ("Holding " + (cmp ? cmp.name : "place")) : "Hold to compare";
    },

    setScrub(i) {
      this.scrubIndex = i;
      this.drawTime();
      this.syncScrub();
    },

    playWalk() {
      if (this.place !== "va") return;
      if (this._playTimer) {
        this._playTimer.stop();
        this._playTimer = null;
        this.syncPlayBtn();
        return;
      }
      const w = this.selected();
      if (!global.HousingPath || !w) return;
      const walk = HousingPath.alignedWalk(w.zhviSeries, w.zoriSeries);
      if (walk.length < 3) return;
      const reduce = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        this.scrubIndex = walk.length - 1;
        this.drawTime();
        this.syncScrub();
        return;
      }
      let i = 0;
      this.scrubIndex = 0;
      this.drawTime();
      this.syncScrub();
      this._playTimer = d3.interval(() => {
        i += 1;
        if (i >= walk.length) {
          this._playTimer.stop();
          this._playTimer = null;
          this.scrubIndex = walk.length - 1;
          this.drawTime();
          this.syncScrub();
          this.syncPlayBtn();
          return;
        }
        this.scrubIndex = i;
        this.drawTime();
        this.syncScrub();
      }, 240);
      this.syncPlayBtn();
    },

    syncPlayBtn() {
      const btn = document.getElementById("btn-play-years");
      if (btn) btn.textContent = this._playTimer ? "Pause" : "Play years";
    },

    syncScrub() {
      const wrap = document.getElementById("year-scrub-wrap");
      const input = document.getElementById("year-scrub");
      const lab = document.getElementById("year-scrub-label");
      if (!wrap || !input) return;
      if (this.place !== "va") {
        wrap.hidden = true;
        return;
      }
      const w = this.selected();
      const walk = global.HousingPath && w ? HousingPath.alignedWalk(w.zhviSeries, w.zoriSeries) : [];
      if (walk.length < 3) {
        wrap.hidden = true;
        return;
      }
      wrap.hidden = false;
      input.max = String(walk.length - 1);
      const i = Number.isFinite(this.scrubIndex) ? this.scrubIndex : walk.length - 1;
      input.value = String(i);
      const yr = walk[i] && walk[i].year;
      if (lab) lab.textContent = yr == null ? "now" : String(yr);
      input.setAttribute("aria-valuetext", lab ? lab.textContent : "");
    },

    bind() {
      document.querySelectorAll("[data-place]").forEach((btn) => {
        btn.addEventListener("click", () => this.setPlace(btn.getAttribute("data-place")));
      });
      const reset = document.getElementById("btn-reset");
      if (reset) reset.addEventListener("click", () => {
        this.selectedId = DEFAULTS[this.place];
        this.compareId = null;
        this.scrubIndex = null;
        this.camera = "wide";
        this.syncPin();
        this.render({ full: true });
      });
      const pin = document.getElementById("btn-pin");
      if (pin) pin.addEventListener("click", () => this.toggleCompare());
      const play = document.getElementById("btn-play-years");
      if (play) play.addEventListener("click", () => this.playWalk());
      const scrub = document.getElementById("year-scrub");
      if (scrub) {
        scrub.addEventListener("input", () => this.setScrub(+scrub.value));
      }
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

    render(opts) {
      opts = opts || {};
      document.querySelectorAll("[data-place]").forEach((btn) => {
        const on = btn.getAttribute("data-place") === this.place;
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.classList.toggle("is-active", on);
      });
      this.syncPin();
      this.renderMetrics();
      this.renderKpis();
      this.renderHero();
      try { this.renderAbout(); }
      catch (err) { console.warn("about fail", err); }
      this.drawMap(opts);
      if (!opts.skipTime) this.drawTime();
      this.stamp();
      const search = document.getElementById("place-search");
      const sel = this.selected();
      if (search && sel) search.value = sel.name;
    },

    renderHero() {
      const el = document.getElementById("cine-hero");
      if (!el) return;
      const w = this.selected();
      const m = this.metricDef();
      if (!m || !global.HousingMaps) {
        el.innerHTML = "";
        return;
      }
      const kicker = this.kicker || (this.place === "va" ? "Virginia" : "Mumbai");
      let name = w ? w.name : (this.place === "va" ? "Virginia · 133 counties" : "BMC · Navi Mumbai · Mumbai 3.0");
      let metric = m.label;
      let value;
      let note = "";
      if (w && w.layer === "navi") {
        metric = "Census 2011";
        value = HousingMaps.fmt(w.pop, "count");
        note = "CIDCO city · node ASR not mapped";
      } else if (w && w.layer === "m3") {
        metric = "Notified area";
        value = HousingMaps.fmt(w.area_km2, "km2");
        note = "124 villages · no ready reckoner";
      } else if (w) {
        value = HousingMaps.fmt(w[m.id], m.kind);
        if (Number.isFinite(w.zhvfYoy)) note = "Metro Y1 " + d3.format("+.1f")(w.zhvfYoy) + "% · " + (w.zhvfName || "");
      } else if (this.place === "mumbai" && this.camera === "bmc") {
        name = "Brihanmumbai · 24 wards";
        const vals = this.rows().map((r) => r[m.id]).filter((v) => v != null && v !== "" && Number.isFinite(+v));
        value = HousingMaps.fmt(d3.median(vals), m.kind);
        note = "Stamp-duty floor. Two more cities sit east.";
      } else if (this.place === "mumbai" && (this.callouts || []).length) {
        name = "Island · Creek · Frontier";
        metric = "Three Mumbais";
        value = "BMC · NMMC · KSC";
        note = "Only BMC has a ready reckoner on this map";
      } else if (this.place === "mumbai") {
        name = "BMC · Navi Mumbai · Mumbai 3.0";
        metric = "Click a shape";
        value = "Your turn";
        note = "24 wards + NMMC + KSC New Town";
      } else {
        const vals = this.rows().map((r) => r[m.id]).filter((v) => v != null && v !== "" && Number.isFinite(+v));
        value = HousingMaps.fmt(d3.median(vals), m.kind);
      }
      el.innerHTML =
        `<p class="cine-hero-kicker">${esc(kicker)}</p>` +
        `<p class="cine-hero-place">${esc(name)}</p>` +
        `<p class="cine-hero-metric">${esc(metric)}</p>` +
        `<p class="cine-hero-value">${value}</p>` +
        (note ? `<p class="cine-hero-note">${esc(note)}</p>` : "");
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
      const ranked = rows.filter((r) => r[m.id] != null && r[m.id] !== "" && Number.isFinite(+r[m.id]));
      const vals = ranked.map((r) => +r[m.id]);
      const max = ranked.slice().sort((a, b) => (+b[m.id]) - (+a[m.id]))[0];
      const min = ranked.slice().sort((a, b) => (+a[m.id]) - (+b[m.id]))[0];
      const med = d3.median(vals);
      const fmt = (v) => global.HousingMaps.fmt(v, m.kind);
      const cards = [
        kpi("PLACES", this.place === "va" ? rows.length : "24 + 2", this.place === "va" ? "counties + cities" : "BMC · NMMC · 3.0"),
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
      if (!feed) return;
      if (!w) {
        if (title) title.textContent = this.place === "va" ? "Virginia" : "Mumbai";
        if (stamp) stamp.textContent = "Establishing shot";
        feed.innerHTML = this.place === "va"
          ? `<p class="intel-lede">133 counties and independent cities. Color is Zillow’s typical home (ZHVI), live. Scroll to go in — the ceiling, then the floor, then the county that holds most of the expensive story.</p>`
          : `<p class="intel-lede">Three Mumbais. BMC has a stamp-duty floor. Navi Mumbai already has people. Mumbai 3.0 is a plan on 124 villages. The camera holds the city with a rate, then crosses the creek.</p>`;
        return;
      }
      if (title) title.textContent = w.name;
      const m = this.metricDef();
      if (stamp) stamp.textContent = m.hint;
      const fmt = global.HousingMaps.fmt;
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
      } else if (w.layer === "navi") {
        feed.innerHTML =
          `<p class="intel-lede">${esc(w.places)}. CIDCO planned city (1971), NMMC 1992. Node-level IGR ready reckoner exists and is not compiled onto this map.</p>
           <h3 class="feed-h">People, not a floor</h3>
           <div class="stat-grid">
             ${stat("Population", fmt(w.pop, "count"), w.census_vintage || "Census 2011")}
             ${stat("Households", fmt(w.households, "count"), "NMMC")}
             ${stat("Area", fmt(w.area_km2, "km2"), "NMMC")}
           </div>
           <p class="intel-body">${esc(w.note || "")}</p>
           <p class="combo-meta">${this.liveNoteMx()}</p>`;
      } else if (w.layer === "m3") {
        feed.innerHTML =
          `<p class="intel-lede">${esc(w.places)}. MMRDA New Town Development Authority, notified 15 Oct 2024. Envelope on this map is schematic, not a cadastral sheet.</p>
           <h3 class="feed-h">A plan, not a rate</h3>
           <div class="stat-grid">
             ${stat("Notified area", fmt(w.area_km2, "km2"), "KSC New Town")}
             ${stat("Villages", fmt(w.villages, "count"), "Panvel, Uran, Pen")}
             ${stat("Ready reckoner", "—", "none yet")}
           </div>
           <p class="intel-body">${esc(w.note || "")}</p>
           <p class="combo-meta">${this.liveNoteMx()}</p>`;
      } else {
        const city = this.mx && this.mx.city;
        feed.innerHTML =
          `<p class="intel-lede">${esc(w.places)} · BMC ward ${esc(w.id)} · ${esc(w.region || "")}. Ready reckoner is the stamp-duty floor, usually below transacted price.</p>
           <h3 class="feed-h">Ready reckoner</h3>
           <div class="stat-grid">
             ${stat("ASR ₹ / sq ft", fmt(w.asr_psf, "inr"), city && city.asr_vintage)}
             ${stat("ASR ₹ / sq m", fmt(w.asr_sqm, "inr_sqm"), "IGR Maharashtra")}
             ${stat("Rank of 24", fmt(w.asr_rank, "rank"), "1 = highest floor")}
             ${stat("vs 24-ward median", fmt(w.vs_median, "pct"))}
             ${stat("% of Malabar Hill", fmt(w.vs_peak, "pct"), "Ward D peak")}
           </div>
           <h3 class="feed-h">What a home costs at this floor</h3>
           <div class="stat-grid">
             ${stat("650 ft² 1BHK floor", fmt(w.floor_650, "inr_amt"), "typical carpet 1BHK")}
             ${stat("1,000 ft² 2BHK floor", fmt(w.floor_1000, "inr_amt"), "typical carpet 2BHK")}
             ${stat("6% stamp on 650 ft²", fmt(w.stamp_650, "inr_amt"), "illustration on RR value, not a quote")}
             ${stat("Years of city 2BHK rent", fmt(w.years_city_rent, "years"), "1,000 ft² RR ÷ city rent × 12")}
           </div>
           <h3 class="feed-h">Housing stock (Census 2011)</h3>
           <div class="stat-grid">
             ${stat("Households", fmt(w.households, "count"), "aggregated to this BMC ward")}
             ${stat("Population", fmt(w.pop, "count"), "Census 2011")}
           </div>
           <p class="intel-body">No official locality rent ₹/ft² and no Residex JSON API — not scraped. City 2BHK rent ₹${city ? d3.format(",")(city.rent_2bhk_inr) : "—"} (Magicbricks) is a city KPI used only in the years-of-rent ratio. RBI HPI is all-India ${city ? city.rbi_hpi_all_india : ""}, not a ward series.</p>
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
      const census = mx.census || {};
      const bits = [];
      bits.push(city.asr_vintage || "ASR");
      bits.push(census.vintage || "Census 2011");
      bits.push("RBI HPI " + (city.rbi_hpi_all_india || "") + " " + (city.rbi_hpi_quarter || ""));
      bits.push("city 2BHK rent ₹" + d3.format(",")(city.rent_2bhk_inr || 0));
      bits.push("NMMC OSM 13180880");
      bits.push("KSC envelope schematic");
      return bits.join(" · ");
    },

    drawMap(opts) {
      opts = opts || {};
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
          ? (m.live ? "Live Zillow / Census · hover to spotlight · click to lock" : "Yearly overlay · hover to spotlight · click to lock")
          : "BMC 24 wards · Navi Mumbai · Mumbai 3.0 (schematic) · hover to spotlight";
      }
      if (!global.HousingMaps || !this.geo()) return;
      try {
        HousingMaps.draw({
          place: this.place,
          geo: this.geo(),
          rows: this.rows().map((r) => Object.assign({}, r, { label: r.label || r.name })),
          idKey: this.idKey(),
          metric: m.id,
          kind: m.kind,
          metricLabel: m.label,
          selectedId: this.selectedId,
          compareId: this.compareId,
          pairId: this.pairId,
          callouts: this.callouts || [],
          dim: this.dim,
          camera: this.camera || "wide",
          force: !!opts.full,
          wipe: !!opts.wipe,
          fly: !!opts.fly,
          camT: opts.fly ? 1 : (global.HousingCine ? HousingCine.progress(HousingCine.scenes[HousingCine.i]) : 1),
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
        const leftH = document.getElementById("time-h-left");
        const rightH = document.getElementById("time-h-right");
        if (title) title.textContent = (w ? w.name : "County") + " · 10-year walk and 5-year cone";
        if (leftH) leftH.textContent = "Walk · rent × home value";
        if (rightH) rightH.textContent = "Index · 10y ago = 100, then a cone";
        if (hint) {
          hint.textContent = Number.isFinite(w && w.zhvfYoy)
            ? "Left: rent×price path (iso-yield diagonals). Right: index 10y ago = 100. Dashed = trend; Y1 home uses Zillow metro forecast."
            : "Left: rent×price path. Right: index 10y ago = 100. Cone is CAGR ± yearly volatility. Not a 5-year official forecast.";
        }
        try {
          if (!w) {
            const walkEl = document.getElementById("path-walk");
            const fanEl = document.getElementById("path-fan");
            if (walkEl) walkEl.innerHTML = "<p class=\"path-empty\">A county is not locked yet. The map is the state.</p>";
            if (fanEl) fanEl.innerHTML = "";
          } else {
          const cmp = this.compareId && this.rows().find((r) => String(r.fips) === String(this.compareId));
          HousingPath.drawWalk({
            row: w,
            rows: this.rows(),
            compareRow: cmp && String(cmp.fips) !== String(w.fips) ? cmp : null,
            yearIndex: this.scrubIndex,
            onYear: (i) => this.setScrub(i),
            tip
          });
          HousingPath.drawFan({ row: w, yearIndex: this.scrubIndex });
          }
        } catch (err) {
          console.warn("time fail", err);
        }
        this.syncScrub();
      } else {
        const leftH = document.getElementById("time-h-left");
        const rightH = document.getElementById("time-h-right");
        if (title) title.textContent = "Mumbai · ready-reckoner ladder and housing stock";
        if (hint) hint.textContent = "No 10-year ward price series. Cross-section of 24 ASR floors vs Census 2011 households — not weather, not invented history.";
        if (leftH) leftH.textContent = "Ladder · ASR ₹ / sq ft";
        if (rightH) rightH.textContent = "Stock · RR floor vs 2011 households";
        try {
          HousingPath.drawMxLadder({
            rows: this.rows(),
            selectedId: this.selectedId,
            onSelect: (id) => this.select(id),
            tip
          });
          HousingPath.drawMxStock({
            rows: this.rows(),
            selectedId: this.selectedId,
            onSelect: (id) => this.select(id),
            tip
          });
          } catch (err) {
            console.warn("mx time fail", err);
          }
          this.syncScrub();
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
        if (el) el.textContent = "ASR + Census 2011";
        if (tick) {
          tick.textContent = "IGR ready reckoner ₹/ft² is the stamp-duty floor. Unit floors, stamp illustration, and years of city 2BHK rent are derived from that. Households/population are Census 2011. No weather.";
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
