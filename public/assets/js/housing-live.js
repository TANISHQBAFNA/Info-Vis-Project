/**
 * Runtime housing feeds. Browser fetch only — no API keys.
 *
 * Live (CORS *): Zillow Research county CSVs, Census Reporter ACS,
 * Open-Meteo weather + air quality.
 * Yearly / no public JSON: HUD FMR, Redfin PPSF, IGR ASR, RBI HPI.
 */
(function (global) {
  "use strict";

  const ZILLOW_BASE = "https://files.zillowstatic.com/research/public_csvs/";
  const ZILLOW_FILES = {
    zhvi: "zhvi/County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv",
    zori: "zori/County_zori_uc_sfrcondomfr_sm_month.csv",
    zhvf: "zhvf_growth/Metro_zhvf_growth_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv",
    sale: "median_sale_price/County_median_sale_price_uc_sfrcondo_sm_month.csv",
    inv: "invt_fs/County_invt_fs_uc_sfrcondo_sm_month.csv",
    listings: "new_listings/County_new_listings_uc_sfrcondo_sm_month.csv",
    cuts: "perc_listings_price_cut/County_perc_listings_price_cut_uc_sfrcondo_sm_month.csv",
    doz: "mean_doz_pending/County_mean_doz_pending_uc_sfrcondo_sm_month.csv",
    heat: "market_temp_index/County_market_temp_index_uc_sfrcondo_month.csv"
  };
  const CENSUS_URL = "https://api.censusreporter.org/1.0/data/show/latest"
    + "?table_ids=B25064,B25077,B25002,B25003,B25070,B25031,B01003,B25001"
    + "&geo_ids=050%7C04000US51";
  const CACHE_NAME = "housing-live-v1";
  const META_KEY = "housing-live-meta";
  const ZILLOW_TTL = 12 * 3600 * 1000;
  const ACS_TTL = 24 * 3600 * 1000;
  const WX_TTL = 15 * 60 * 1000;
  const WX_STORE = "housing-mx-wx-v1";

  const HousingLive = {
    async loadVirginia(onProgress) {
      const say = onProgress || function () {};
      const errors = [];
      say("Loading county boundaries and yearly overlays…");
      const [geo, hud, ppsf, fallback] = await Promise.all([
        d3.json("assets/data/housing/va-counties.geojson"),
        d3.json("assets/data/housing/hud-fmr.json"),
        d3.csv("assets/data/housing/va-ppsf.csv"),
        d3.csv("assets/data/housing/va-housing.csv").catch(() => [])
      ]);

      say("Fetching Census ACS (live)…");
      let acs = {};
      let acsLive = false;
      try {
        const acsJson = JSON.parse(await cachedText(CENSUS_URL, ACS_TTL));
        acs = parseCensus(acsJson);
        acsLive = true;
      } catch (err) {
        errors.push("Census Reporter: " + msg(err));
      }

      say("Fetching Zillow county series (live)…");
      const zillow = {};
      const vintages = {};
      const keys = Object.keys(ZILLOW_FILES);
      const settled = await Promise.allSettled(keys.map(async (key) => {
        say("Zillow " + key + "…");
        const text = await cachedText(ZILLOW_BASE + ZILLOW_FILES[key], ZILLOW_TTL);
        if (key === "zhvf") return { key, parsed: parseZhvf(text) };
        const keep = (key === "zhvi" || key === "zori") ? 120 : 24;
        const parsed = parseZillowVA(text, { asPercent: key === "cuts", keep });
        return { key, parsed };
      }));
      let zillowLive = false;
      settled.forEach((item, i) => {
        const key = keys[i];
        if (item.status === "fulfilled") {
          zillow[key] = item.value.parsed;
          vintages[key] = item.value.parsed.latest;
          zillowLive = true;
        } else {
          errors.push("Zillow " + key + ": " + msg(item.reason));
        }
      });

      const rows = mergeVa({ geo, hud, ppsf, acs, zillow, fallback });
      return {
        geo,
        rows,
        live: { zillow: zillowLive, census: acsLive },
        vintages,
        acsRelease: firstAcsRelease(acs),
        hudVintage: hud.vintage || "FY2026",
        fetchedAt: new Date().toISOString(),
        errors
      };
    },

    async loadMumbai(onProgress) {
      const say = onProgress || function () {};
      const errors = [];
      say("Loading Mumbai wards and ASR…");
      const [geo, mxRows, mxCity] = await Promise.all([
        d3.json("assets/data/housing/mumbai-wards.geojson"),
        d3.csv("assets/data/housing/mumbai-wards.csv", parseMx),
        d3.json("assets/data/housing/mumbai-city.json")
      ]);

      say("Fetching Open-Meteo weather + AQI (live)…");
      let wxLive = false;
      let wxAt = null;
      try {
        const wx = await loadMumbaiWeather(geo);
        wxAt = wx.fetchedAt;
        wxLive = true;
        mxRows.forEach((row) => {
          const w = wx.byId[row.id];
          if (!w) return;
          row.aqi = w.aqi;
          row.pm25 = w.pm25;
          row.pm10 = w.pm10;
          row.temp = w.temp;
          row.humidity = w.humidity;
          row.wind = w.wind;
          row.rain = w.rain;
          row.precipNow = w.precipNow;
          row.tempSeries = w.tempSeries;
          row.rainSeries = w.rainSeries;
          row.wxAt = w.fetchedAt;
        });
      } catch (err) {
        errors.push("Open-Meteo: " + msg(err));
      }

      return {
        geo,
        rows: mxRows,
        city: mxCity,
        live: { weather: wxLive },
        fetchedAt: wxAt,
        errors
      };
    }
  };

  function parseMx(d) {
    return {
      id: d.id,
      name: d.name,
      places: d.places,
      asr_sqm: +d.asr_sqm,
      asr_psf: +d.asr_psf
    };
  }

  function parseZhvf(text) {
    const rows = d3.csvParse(text);
    const dateCols = rows.columns.filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c));
    const yoyColName = dateCols[dateCols.length - 1];
    const byKey = {};
    rows.forEach((r) => {
      const rec = {
        name: r.RegionName,
        base: r.BaseDate,
        yoy: num(r[yoyColName]),
        horizon: yoyColName,
        state: r.StateName || ""
      };
      const city = metroCity(r.RegionName);
      const st = String(r.StateName || "").trim().toLowerCase();
      if (city && st) byKey[city + "|" + st] = rec;
      if (r.RegionName) byKey[String(r.RegionName).toLowerCase()] = rec;
    });
    return { byKey, latest: yoyColName, monthCols: dateCols };
  }

  function metroCity(name) {
    if (!name) return "";
    return String(name).split(",")[0].split("-")[0].trim().toLowerCase();
  }

  function lookupZhvf(metro, byKey) {
    if (!metro || !byKey) return {};
    const city = metroCity(metro);
    const suffix = String(metro).split(",")[1] || "";
    const states = suffix.toLowerCase().split(/[^a-z]+/).filter((s) => s.length === 2);
    for (let i = 0; i < states.length; i++) {
      const hit = byKey[city + "|" + states[i]];
      if (hit) return hit;
    }
    return byKey[city + "|va"] || byKey[city + "|dc"] || {};
  }

  function parseZillowVA(text, opts) {
    const asPercent = !!(opts && opts.asPercent);
    const keep = (opts && opts.keep) || 24;
    const rows = d3.csvParse(text);
    const monthCols = rows.columns.filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c));
    const latest = monthCols[monthCols.length - 1];
    const prev = yoyCol(monthCols, latest);
    const byFips = {};
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.State !== "VA" && r.StateName !== "VA") continue;
      const fips = String(r.StateCodeFIPS || "").padStart(2, "0")
        + String(r.MunicipalCodeFIPS || "").padStart(3, "0");
      if (fips.length !== 5) continue;
      const latestV = scale(num(r[latest]), asPercent);
      const prevV = prev ? scale(num(r[prev]), asPercent) : null;
      const series = [];
      const start = Math.max(0, monthCols.length - keep);
      for (let m = start; m < monthCols.length; m++) {
        const v = scale(num(r[monthCols[m]]), asPercent);
        if (v != null) series.push({ date: monthCols[m], v });
      }
      let yoy = null;
      if (latestV != null && prevV != null && prevV !== 0 && !asPercent) {
        yoy = 100 * (latestV - prevV) / prevV;
      } else if (latestV != null && prevV != null && asPercent) {
        yoy = latestV - prevV;
      }
      byFips[fips] = {
        name: r.RegionName,
        metro: r.Metro || "",
        latest: latestV,
        prevYear: prevV,
        yoy,
        vintage: latest,
        series
      };
    }
    return { byFips, latest, monthCols };
  }

  function yoyCol(monthCols, latest) {
    const target = String(+latest.slice(0, 4) - 1) + latest.slice(4);
    if (monthCols.indexOf(target) !== -1) return target;
    const i = monthCols.indexOf(latest);
    return i >= 12 ? monthCols[i - 12] : null;
  }

  function parseCensus(json) {
    const release = (json.release && json.release.name) || "ACS";
    const out = {};
    const data = json.data || {};
    Object.keys(data).forEach((geoid) => {
      const tables = data[geoid];
      const fips = geoid.replace("05000US", "");
      const e = (t, k) => {
        const v = tables[t] && tables[t].estimate && tables[t].estimate[k];
        return num(v);
      };
      const tot = e("B25002", "B25002001");
      const vac = e("B25002", "B25002003");
      const occ = e("B25003", "B25003001");
      const own = e("B25003", "B25003002");
      const rtot = e("B25070", "B25070001");
      const r50 = e("B25070", "B25070011");
      const rnc = e("B25070", "B25070012");
      const denom = rtot != null && rnc != null ? rtot - rnc : rtot;
      out[fips] = {
        rent: e("B25064", "B25064001"),
        value: e("B25077", "B25077001"),
        pop: e("B01003", "B01003001"),
        units: e("B25001", "B25001001"),
        vacantPct: tot ? 100 * vac / tot : null,
        ownerPct: occ ? 100 * own / occ : null,
        burden50: denom ? 100 * r50 / denom : null,
        rent2br: e("B25031", "B25031004"),
        release
      };
    });
    return out;
  }

  function mergeVa(parts) {
    const { geo, hud, ppsf, acs, zillow, fallback } = parts;
    const ppsfMap = {};
    (ppsf || []).forEach((r) => { ppsfMap[r.fips] = r; });
    const fbMap = {};
    (fallback || []).forEach((r) => { fbMap[r.fips] = r; });
    const hudMap = (hud && hud.byFips) || {};
    const z = (key, fips) => zillow[key] && zillow[key].byFips && zillow[key].byFips[fips];
    const zhvf = (zillow.zhvf && zillow.zhvf.byKey) || {};

    return geo.features.map((f) => {
      const fips = String(f.id);
      const zh = z("zhvi", fips) || {};
      const zo = z("zori", fips) || {};
      const sa = z("sale", fips) || {};
      const ac = acs[fips] || {};
      const fb = fbMap[fips] || {};
      const pp = ppsfMap[fips];
      const fc = lookupZhvf(zh.metro, zhvf);
      return {
        fips,
        name: (f.properties && f.properties.name) || zh.name || fb.name || fips,
        metro: zh.metro || "",
        zhvi: pick(zh.latest, num(fb.zhvi)),
        zhvi_yoy: zh.yoy,
        zhviSeries: zh.series || [],
        zhviVintage: zh.vintage,
        zori: zo.latest,
        zoriSeries: zo.series || [],
        zoriVintage: zo.vintage,
        years_rent: (zh.latest != null && zo.latest) ? zh.latest / (zo.latest * 12) : null,
        zhvfYoy: fc.yoy,
        zhvfName: fc.name,
        zhvfHorizon: fc.horizon,
        sale: pick(sa.latest, num(fb.median_sale)),
        saleVintage: sa.vintage,
        inv: (z("inv", fips) || {}).latest,
        listings: (z("listings", fips) || {}).latest,
        cuts: (z("cuts", fips) || {}).latest,
        doz: (z("doz", fips) || {}).latest,
        heat: (z("heat", fips) || {}).latest,
        ppsf: pp ? num(pp.ppsf) : num(fb.ppsf),
        ppsfVintage: pp ? pp.vintage : null,
        fmr_2br: hudMap[fips] != null ? hudMap[fips] : num(fb.fmr_2br),
        acs_rent: pick(ac.rent, num(fb.acs_median_rent)),
        acs_value: pick(ac.value, num(fb.acs_median_value)),
        acs_pop: ac.pop,
        units: ac.units,
        vacant_pct: ac.vacantPct,
        owner_pct: ac.ownerPct,
        burden50_pct: ac.burden50,
        acs_2br: ac.rent2br
      };
    }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  function firstAcsRelease(acs) {
    const keys = Object.keys(acs || {});
    return keys.length ? acs[keys[0]].release : null;
  }

  async function loadMumbaiWeather(geo) {
    const cached = readWxCache();
    if (cached) return cached;
    const cents = geo.features.map((f) => {
      const c = d3.geoCentroid(f);
      return { id: String(f.id), lon: c[0], lat: c[1] };
    });
    const lats = cents.map((c) => c.lat.toFixed(4)).join(",");
    const lons = cents.map((c) => c.lon.toFixed(4)).join(",");
    const wxUrl = "https://api.open-meteo.com/v1/forecast"
      + "?latitude=" + lats
      + "&longitude=" + lons
      + "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m"
      + "&hourly=precipitation,temperature_2m"
      + "&daily=precipitation_sum"
      + "&forecast_days=2&timezone=Asia%2FKolkata";
    const aqUrl = "https://air-quality-api.open-meteo.com/v1/air-quality"
      + "?latitude=" + lats
      + "&longitude=" + lons
      + "&current=us_aqi,pm2_5,pm10"
      + "&timezone=Asia%2FKolkata";
    const [wxJson, aqJson] = await Promise.all([
      fetch(wxUrl).then(okJson),
      fetch(aqUrl).then(okJson)
    ]);
    const wxArr = asArr(wxJson);
    const aqArr = asArr(aqJson);
    const fetchedAt = new Date().toISOString();
    const byId = {};
    cents.forEach((c, i) => {
      const w = wxArr[i] || {};
      const a = aqArr[i] || {};
      const cur = w.current || {};
      const aq = a.current || {};
      const daily = w.daily || {};
      const hourly = w.hourly || {};
      byId[c.id] = {
        aqi: num(aq.us_aqi),
        pm25: num(aq.pm2_5),
        pm10: num(aq.pm10),
        temp: num(cur.temperature_2m),
        humidity: num(cur.relative_humidity_2m),
        wind: num(cur.wind_speed_10m),
        precipNow: num(cur.precipitation),
        rain: daily.precipitation_sum ? num(daily.precipitation_sum[0]) : null,
        tempSeries: seriesOf(hourly.time, hourly.temperature_2m),
        rainSeries: seriesOf(hourly.time, hourly.precipitation),
        fetchedAt
      };
    });
    const payload = { byId, fetchedAt };
    try { sessionStorage.setItem(WX_STORE, JSON.stringify({ at: Date.now(), payload })); } catch (e) {}
    return payload;
  }

  function readWxCache() {
    try {
      const raw = sessionStorage.getItem(WX_STORE);
      if (!raw) return null;
      const wrap = JSON.parse(raw);
      if (!wrap || Date.now() - wrap.at > WX_TTL) return null;
      return wrap.payload;
    } catch (e) {
      return null;
    }
  }

  function seriesOf(times, vals) {
    if (!times || !vals) return [];
    const out = [];
    for (let i = 0; i < times.length; i++) {
      const v = num(vals[i]);
      if (v != null) out.push({ date: times[i], v });
    }
    return out;
  }

  function asArr(json) { return Array.isArray(json) ? json : [json]; }

  async function cachedText(url, ttl) {
    const now = Date.now();
    const m = readMeta();
    let cache = null;
    try { cache = typeof caches !== "undefined" ? await caches.open(CACHE_NAME) : null; } catch (e) {}
    if (cache && m[url] && now - m[url] < ttl) {
      const hit = await cache.match(url);
      if (hit) return hit.text();
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(url.split("?")[0].split("/").pop() + " HTTP " + res.status);
    const text = await res.text();
    if (cache) {
      try {
        await cache.put(url, new Response(text, { headers: { "content-type": "text/plain" } }));
      } catch (e) {}
    }
    m[url] = now;
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
    return text;
  }

  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch (e) { return {}; }
  }

  async function okJson(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  function scale(v, asPercent) {
    if (v == null) return null;
    return asPercent ? v * 100 : v;
  }
  function num(v) {
    if (v == null || v === "") return null;
    const n = +v;
    return Number.isFinite(n) ? n : null;
  }
  function pick(a, b) { return a != null ? a : b; }
  function msg(err) { return err && err.message ? err.message : String(err); }

  global.HousingLive = HousingLive;
})(window);
