/**
 * Mumbai live dashboard — Open-Meteo weather + air quality at 24 ward centroids.
 */
(function (global) {
  "use strict";

  const WARD_CSV  = "assets/data/mumbai/Wards.csv";
  const NOTE_CSV  = "assets/data/mumbai/WardInfo.csv";
  const THEMES    = "assets/data/mumbai/ExposureThemes.json";
  const DEFAULT   = "ME";
  const CACHE_MS  = 15 * 60 * 1000;

  const AQI_STOPS = [
    { max: 50,  label: "Good",           color: "#4f8a3e" },
    { max: 100, label: "Moderate",       color: "#d4a017" },
    { max: 150, label: "USG",            color: "#e07020" },
    { max: 200, label: "Unhealthy",      color: "#c4332a" },
    { max: 300, label: "Very unhealthy", color: "#8b1e4a" },
    { max: Infinity, label: "Hazardous", color: "#4a1028" }
  ];

  function aqiColor(v) {
    const n = +v;
    if (!Number.isFinite(n)) return "#c8b8a4";
    return AQI_STOPS.find(s => n <= s.max).color;
  }
  function aqiLabel(v) {
    const n = +v;
    if (!Number.isFinite(n)) return "—";
    return AQI_STOPS.find(s => n <= s.max).label;
  }

  const MumbaiDash = {
    wards: [],
    themes: null,
    selectedId: DEFAULT,
    liveOk: false,
    liveAt: null,
    liveErr: null,
    aqiColor,
    aqiLabel,

    selected() {
      return this.wards.find(w => w.id === this.selectedId) || this.wards[0];
    },
    worstAqi() {
      return this.wards.slice().sort((a, b) => (b.live?.now?.aqi || 0) - (a.live?.now?.aqi || 0))[0];
    },

    boot() {
      const log = document.getElementById("boot-log");
      const screen = document.getElementById("boot-screen");
      const line = (t) => { if (log) log.textContent = t; };
      Promise.all([
        d3.csv(WARD_CSV, parseWard),
        d3.csv(NOTE_CSV),
        d3.json(THEMES)
      ]).then(([wards, notes, themes]) => {
        line("WARDS 24");
        const noteMap = new Map(notes.map(n => [n.ward, n]));
        this.wards = wards.map(w => {
          const n = noteMap.get(w.ward) || {};
          return Object.assign(w, {
            note: n.note || "",
            zone: n.zone || w.zone,
            live: emptyLive()
          });
        });
        this.themes = themes;
        this.selectedId = DEFAULT;
        line("OPEN-METEO…");
        return this.pullLive();
      }).then(() => {
        line(this.liveOk ? "LIVE" : "CACHE / FALLBACK");
        this.mount();
        if (screen) screen.classList.add("is-done");
      }).catch(err => {
        console.error(err);
        line("Could not load data — " + (err && err.message ? err.message : err));
      });
    },

    pullLive() {
      const cached = readCache();
      if (cached && Date.now() - cached.at < CACHE_MS) {
        this.applyLive(cached.payload, cached.at, true);
        return Promise.resolve();
      }
      const BATCH = 8;
      const jobs = [];
      for (let i = 0; i < this.wards.length; i += BATCH) {
        const slice = this.wards.slice(i, i + BATCH);
        const lats = slice.map(w => w.lat).join(",");
        const lons = slice.map(w => w.lon).join(",");
        jobs.push(Promise.all([
          fetchJson(weatherUrl(lats, lons)),
          fetchJson(airUrl(lats, lons))
        ]));
      }
      return Promise.all(jobs)
        .then(results => {
          const wx = [];
          const aq = [];
          results.forEach(([w, a]) => {
            wx.push.apply(wx, asArr(w));
            aq.push.apply(aq, asArr(a));
          });
          const payload = { wx, aq };
          writeCache(payload);
          this.applyLive(payload, Date.now(), false);
        })
        .catch(err => {
          console.warn("live fetch failed", err);
          this.liveErr = String(err && err.message ? err.message : err);
          if (cached) this.applyLive(cached.payload, cached.at, true);
          else this.liveOk = false;
        });
    },

    applyLive(payload, at, fromCache) {
      const wx = payload.wx || [];
      const aq = payload.aq || [];
      this.wards.forEach((w, i) => {
        w.live = stitch(wx[i], aq[i]);
      });
      this.liveOk = this.wards.some(w => Number.isFinite(w.live.now.aqi));
      this.liveAt = at;
      this.fromCache = fromCache;
    },

    mount() {
      const dash = document.querySelector(".dashboard");
      if (dash) dash.hidden = false;
      this.renderKpis();
      this.renderSearch();
      this.renderAbout();
      this.drawAll();
      this.bind();
      this.stamp();
    },

    drawAll() {
      if (!global.MXViz) return;
      const sel = this.selected();
      const run = (name, fn) => {
        try { fn(); }
        catch (err) { console.warn("chart fail " + name, err); }
      };
      run("map", () => MXViz.drawMap(this.wards, sel));
      run("heat", () => MXViz.drawHeat(this.wards, sel));
      run("ridge", () => MXViz.drawRidge(this.wards, sel));
      run("traces", () => MXViz.drawTraces(this.wards, sel));
      this.renderAbout();
      this.stamp();
    },

    selectWard(id) {
      if (!id || !this.wards.some(w => w.id === id)) return;
      this.selectedId = id;
      const search = document.getElementById("ward-search");
      if (search) search.value = this.selected().ward;
      this.drawAll();
    },

    renderKpis() {
      const row = document.getElementById("kpi-row");
      if (!row) return;
      const n = this.wards.length;
      const worst = this.worstAqi();
      const maxAqi = worst && worst.live ? worst.live.now.aqi : NaN;
      const raining = this.wards.filter(w => (w.live.now.rain || 0) > 0.1).length;
      const wettest = this.wards.slice().sort((a, b) =>
        d3.sum(b.live.rain14, d => d.rain) - d3.sum(a.live.rain14, d => d.rain)
      )[0];
      const wetMm = wettest ? d3.sum(wettest.live.rain14, d => d.rain) : 0;
      row.innerHTML = [
        kpi("WARDS", n, "BMC administrative"),
        kpi("WORST AQI", Number.isFinite(maxAqi) ? Math.round(maxAqi) : "—",
          worst ? worst.short + " · " + aqiLabel(maxAqi) : "awaiting live"),
        kpi("RAINING NOW", raining, raining ? "centroid(s) > 0.1 mm" : "dry at centroids"),
        kpi("14-DAY RAIN", Math.round(wetMm) + " mm", wettest ? "peak · " + wettest.short : "—")
      ].join("");
    },

    renderSearch() {
      const input = document.getElementById("ward-search");
      const list = document.getElementById("ward-results");
      if (!input || !list) return;
      const close = () => { list.hidden = true; list.innerHTML = ""; };
      const open = (q) => {
        const s = (q || "").trim().toLowerCase();
        const hits = this.wards.filter(w =>
          !s || w.ward.toLowerCase().includes(s) || w.places.toLowerCase().includes(s) ||
          w.id.toLowerCase() === s
        ).slice(0, 12);
        list.innerHTML = hits.map(w =>
          `<button type="button" role="option" data-id="${w.id}">
            <strong>${esc(w.ward)}</strong>
            <span>${esc(w.places)}</span>
          </button>`
        ).join("");
        list.hidden = !hits.length;
      };
      input.addEventListener("focus", () => open(input.value));
      input.addEventListener("input", () => open(input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { input.blur(); close(); }
      });
      list.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-id]");
        if (!btn) return;
        this.selectWard(btn.getAttribute("data-id"));
        close();
      });
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".command-bar")) close();
      });
      input.value = this.selected().ward;
    },

    renderAbout() {
      const w = this.selected();
      const title = document.getElementById("about-title");
      const stamp = document.getElementById("about-stamp");
      const feed = document.getElementById("about-feed");
      if (!w || !feed) return;
      if (title) title.textContent = w.ward;
      if (stamp) stamp.textContent = this.liveOk
        ? (this.fromCache ? "cached live · " : "live · ") + fmtWhen(this.liveAt)
        : (this.liveErr ? "feed error · static notes" : "awaiting feed");
      const now = w.live.now;
      const rain14 = d3.sum(w.live.rain14, d => d.rain);
      const rain48 = d3.sum(w.live.hours48, d => d.rain);
      feed.innerHTML =
        `<p class="intel-lede">${esc(w.places)} · ${esc(w.zone)} zone · ${fmtPop(w.pop)} · ${w.area} km²</p>
         <dl class="live-dl">
           <div><dt>US AQI</dt><dd style="color:${aqiColor(now.aqi)}">${fmtNum(now.aqi, 0)} <small>${esc(aqiLabel(now.aqi))}</small></dd></div>
           <div><dt>PM2.5</dt><dd>${fmtNum(now.pm25, 1)} µg/m³</dd></div>
           <div><dt>NO₂</dt><dd>${fmtNum(now.no2, 1)} µg/m³</dd></div>
           <div><dt>Ozone</dt><dd>${fmtNum(now.o3, 1)} µg/m³</dd></div>
           <div><dt>Temp / RH</dt><dd>${fmtNum(now.temp, 1)}°C · ${fmtNum(now.humidity, 0)}%</dd></div>
           <div><dt>Rain now</dt><dd>${fmtNum(now.rain, 1)} mm</dd></div>
           <div><dt>Rain 48h</dt><dd>${fmtNum(rain48, 1)} mm</dd></div>
           <div><dt>Rain 14d</dt><dd>${fmtNum(rain14, 0)} mm</dd></div>
         </dl>
         <p>${esc(w.note)}</p>
         <p class="combo-meta">Hotspots ${esc(w.hotspots)}. Slum share of area ${w.slum}%. Exposure index ${w.index.toFixed(2)} is a static composite — live AQI and rain sit on top, they do not replace it.</p>
         <p class="combo-meta">Centroid ${w.lat.toFixed(3)}°N, ${w.lon.toFixed(3)}°E. Open-Meteo weather + air-quality APIs, Asia/Kolkata. ${this.liveErr ? "Last error: " + esc(this.liveErr) : "No key required."}</p>`;
    },

    stamp() {
      const el = document.getElementById("live-stamp");
      const tick = document.getElementById("ticker-line");
      if (el) {
        el.textContent = this.liveOk
          ? (this.fromCache ? "cached " : "live ") + fmtWhen(this.liveAt)
          : "live feed down";
      }
      if (tick) {
        const w = this.selected();
        const worst = this.worstAqi();
        tick.textContent = this.liveOk
          ? `${w.short} AQI ${fmtNum(w.live.now.aqi, 0)} (${aqiLabel(w.live.now.aqi)}) · worst now ${worst.short} ${fmtNum(worst.live.now.aqi, 0)} · rain-now ${this.wards.filter(x => x.live.now.rain > 0.1).length}/24 wards`
          : "Open-Meteo unreachable from this origin. Notes still load. Retry in a few minutes.";
      }
    },

    bind() {
      const reset = document.getElementById("btn-reset");
      if (reset) reset.addEventListener("click", () => {
        this.selectWard(DEFAULT);
      });
      let t;
      window.addEventListener("resize", () => {
        clearTimeout(t);
        t = setTimeout(() => this.drawAll(), 160);
      });
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

  function parseWard(d) {
    const name = d.ward;
    return {
      id: d.id,
      ward: name,
      short: name.split("·")[0].trim(),
      places: d.places,
      pop: +d.population,
      area: +d.area_km2,
      lat: +d.lat,
      lon: +d.lon,
      flood: +d.flood, heat: +d.heat, air: +d.air, services: +d.services,
      index: +d.index,
      hotspots: d.hotspots,
      slum: +d.slum_pct,
      zone: d.zone
    };
  }

  function emptyLive() {
    return {
      now: { temp: NaN, humidity: NaN, rain: 0, aqi: NaN, pm25: NaN, no2: NaN, o3: NaN },
      hours24: [], hours48: [], rain14: [], rainToday: 0
    };
  }

  function stitch(wx, aq) {
    const live = emptyLive();
    if (!wx && !aq) return live;
    const curW = wx && wx.current || {};
    const curA = aq && aq.current || {};
    live.now = {
      temp: +curW.temperature_2m,
      humidity: +curW.relative_humidity_2m,
      rain: +curW.precipitation || 0,
      aqi: +curA.us_aqi,
      pm25: +curA.pm2_5,
      no2: +curA.nitrogen_dioxide,
      o3: +curA.ozone
    };
    const wH = (wx && wx.hourly) || {};
    const aH = (aq && aq.hourly) || {};
    const precip = wH.precipitation || [];
    const byW = new Map();
    (wH.time || []).forEach((t, i) => byW.set(t, +precip[i] || 0));
    const aqi = aH.us_aqi || [];
    const pm = aH.pm2_5 || [];
    const no2 = aH.nitrogen_dioxide || [];
    const o3 = aH.ozone || [];
    const hours = [];
    (aH.time || []).forEach((t, i) => {
      hours.push({
        t,
        date: parseIst(t),
        aqi: +aqi[i],
        pm25: +pm[i],
        no2: +no2[i],
        o3: +o3[i],
        rain: byW.has(t) ? byW.get(t) : 0
      });
    });
    const now = Date.now();
    live.hours48 = hours.filter(h => +h.date <= now).slice(-48);
    live.hours24 = live.hours48.slice(-24);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const days = (wx && wx.daily && wx.daily.time) || [];
    const rainD = (wx && wx.daily && wx.daily.precipitation_sum) || [];
    live.rain14 = days.map((day, i) => ({ day, rain: +rainD[i] || 0 }))
      .filter(d => d.day <= today)
      .slice(-14);
    const todayRow = live.rain14.find(d => d.day === today);
    live.rainToday = todayRow ? todayRow.rain : (live.rain14.length ? live.rain14[live.rain14.length - 1].rain : 0);
    return live;
  }

  function parseIst(t) {
    if (!t) return new Date(NaN);
    const s = String(t).replace(" ", "T");
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
    return new Date(s + "+05:30");
  }

  function weatherUrl(lats, lons) {
    return "https://api.open-meteo.com/v1/forecast"
      + "?latitude=" + lats + "&longitude=" + lons
      + "&current=temperature_2m,relative_humidity_2m,precipitation"
      + "&hourly=precipitation"
      + "&daily=precipitation_sum"
      + "&past_days=14&forecast_days=1&timezone=Asia%2FKolkata";
  }

  function airUrl(lats, lons) {
    return "https://air-quality-api.open-meteo.com/v1/air-quality"
      + "?latitude=" + lats + "&longitude=" + lons
      + "&current=us_aqi,pm2_5,nitrogen_dioxide,ozone"
      + "&hourly=us_aqi,pm2_5,nitrogen_dioxide,ozone"
      + "&past_days=2&forecast_days=1&timezone=Asia%2FKolkata";
  }

  function asArr(x) { return Array.isArray(x) ? x : [x]; }

  function fetchJson(url) {
    return fetch(url).then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function cacheKey() { return "mx-live-v3"; }
  function readCache() {
    try { return JSON.parse(sessionStorage.getItem(cacheKey()) || "null"); }
    catch (e) { return null; }
  }
  function writeCache(payload) {
    try { sessionStorage.setItem(cacheKey(), JSON.stringify({ at: Date.now(), payload })); }
    catch (e) { /* quota */ }
  }

  function kpi(k, v, s) {
    return `<article class="kpi"><span class="kpi-label">${esc(k)}</span><span class="kpi-value">${v}</span><span class="kpi-sub">${esc(s)}</span></article>`;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function fmtNum(v, d) {
    return Number.isFinite(+v) ? (+v).toFixed(d) : "—";
  }
  function fmtPop(n) {
    return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : (n / 1e3).toFixed(0) + "k";
  }
  function fmtWhen(ms) {
    if (!ms) return "—";
    const d = new Date(ms);
    return d.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";
  }

  global.MumbaiDash = MumbaiDash;
  MumbaiDash.boot();
})(window);
