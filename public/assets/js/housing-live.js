/**
 * Runtime housing feeds. Browser fetch only — no API keys.
 *
 * Live (CORS *): Zillow Research county CSVs, Census Reporter ACS.
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
      say("Loading Mumbai ready-reckoner and census housing stock…");
      const [geo, mxRows, mxCity, census] = await Promise.all([
        d3.json("assets/data/housing/mumbai-wards.geojson"),
        d3.csv("assets/data/housing/mumbai-wards.csv", parseMx),
        d3.json("assets/data/housing/mumbai-city.json"),
        d3.json("assets/data/housing/mumbai-census.json")
      ]);
      enrichMx(mxRows, mxCity, census);
      return {
        geo,
        rows: mxRows,
        city: mxCity,
        census,
        live: {},
        errors: []
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

  const MX_CARPET_1BHK = 650;
  const MX_CARPET_2BHK = 1000;
  const MX_STAMP = 0.06;
  const MX_ISLAND = { A: 1, B: 1, C: 1, D: 1, E: 1, "F/S": 1, "F/N": 1, "G/S": 1, "G/N": 1 };

  function enrichMx(rows, city, census) {
    const byId = (census && census.byId) || {};
    const rentYr = city && city.rent_2bhk_inr ? city.rent_2bhk_inr * 12 : null;
    const psfs = rows.map((r) => r.asr_psf).filter(Number.isFinite);
    const med = d3.median(psfs);
    const peak = d3.max(psfs);
    const ranked = rows.slice().sort((a, b) => b.asr_psf - a.asr_psf);
    ranked.forEach((r, i) => { r.asr_rank = i + 1; });
    rows.forEach((r) => {
      const c = byId[r.id] || {};
      r.pop = c.pop;
      r.households = c.households;
      r.region = MX_ISLAND[r.id] ? "Island City" : "Suburbs";
      r.floor_650 = Number.isFinite(r.asr_psf) ? r.asr_psf * MX_CARPET_1BHK : null;
      r.floor_1000 = Number.isFinite(r.asr_psf) ? r.asr_psf * MX_CARPET_2BHK : null;
      r.stamp_650 = r.floor_650 != null ? r.floor_650 * MX_STAMP : null;
      r.vs_median = med ? 100 * r.asr_psf / med : null;
      r.vs_peak = peak ? 100 * r.asr_psf / peak : null;
      r.years_city_rent = (r.floor_1000 && rentYr) ? r.floor_1000 / rentYr : null;
      r.hh_per_cr = (r.households && r.floor_650) ? r.households : null;
    });
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
