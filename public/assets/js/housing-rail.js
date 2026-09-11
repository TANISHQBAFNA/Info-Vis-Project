/**
 * Per-chapter findings + compact charts in the scroll rail.
 * Virginia uses live ZHVI/ZORI (10y + 5y cone). Mumbai has no ward walk —
 * insets are ASR cross-section, census stock, and area/people.
 */
(function (global) {
  "use strict";

  const FONT = '"Source Sans 3","Segoe UI",sans-serif';
  const INK = "#f6efe6";
  const MUTED = "#8c8278";
  const GOLD = "#d4c2a0";
  const HOME = "#d0895c";
  const RENT = "#7ea08c";
  const GRID = "#3a342e";

  const HousingRail = {
    dash: null,
    lastId: null,

    bind(dash) {
      this.dash = dash;
      document.querySelectorAll(".cine-scene").forEach((el) => {
        if (!el.querySelector(".cine-panel")) {
          const panel = document.createElement("div");
          panel.className = "cine-panel";
          el.appendChild(panel);
        }
      });
      this.fillAll();
    },

    fillAll() {
      if (!this.dash) return;
      document.querySelectorAll(".cine-scene").forEach((el) => this.fill(el, { chart: false }));
    },

    draw(sceneId) {
      if (!this.dash) return;
      const el = document.getElementById(sceneId);
      if (!el) return;
      this.fill(el, { chart: true });
      this.lastId = sceneId;
    },

    fill(el, opts) {
      const panel = el.querySelector(".cine-panel");
      if (!panel) return;
      const spec = specFor(el.id, this.dash);
      panel.innerHTML =
        factsHtml(spec.facts) +
        (spec.kicker ? `<p class="cine-inset-kicker">${esc(spec.kicker)}</p>` : "") +
        `<div class="cine-inset"></div>` +
        (spec.take ? `<p class="cine-take">${esc(spec.take)}</p>` : "");
      const inset = panel.querySelector(".cine-inset");
      if (inset && spec.chart && !(opts && opts.chart === false)) spec.chart(inset);
    }
  };

  function specFor(id, dash) {
    const va = (dash.va && dash.va.rows) || [];
    const mx = (dash.mx && dash.mx.rows) || [];
    const city = (dash.mx && dash.mx.city) || {};
    const fmt = (global.HousingMaps && HousingMaps.fmt) || String;
    const byVa = (fips) => va.find((r) => String(r.fips) === fips);
    const byMx = (wid) => mx.find((r) => String(r.id) === wid);
    const priced = va.filter((r) => isNum(r.zhvi));
    const asr = mx.filter((r) => isNum(r.asr_psf));
    const max = d3.greatest(priced, (r) => r.zhvi);
    const min = d3.least(priced, (r) => r.zhvi);
    const med = d3.median(priced, (r) => r.zhvi);
    const asrMax = d3.greatest(asr, (r) => r.asr_psf);
    const asrMin = d3.least(asr, (r) => r.asr_psf);
    const asrMed = d3.median(asr, (r) => r.asr_psf);
    const fc = byVa("51610");
    const bu = byVa("51027");
    const fx = byVa("51059");
    const east = byMx("M/E");
    const hill = byMx("D");
    const navi = byMx("NM");
    const m3 = byMx("M3");
    const bmcPop = d3.sum(mx.filter((r) => r.layer === "bmc"), (r) => r.pop || 0);
    const bmcHh = d3.sum(mx.filter((r) => r.layer === "bmc"), (r) => r.households || 0);

    const spread = (max && min && min.zhvi) ? max.zhvi / min.zhvi : null;
    const asrSpread = (asrMax && asrMin && asrMin.asr_psf) ? asrMax.asr_psf / asrMin.asr_psf : null;
    const fcP = fc && global.HousingPath ? HousingPath.project(fc.zhviSeries, { officialYoy: fc.zhvfYoy, years: 5 }) : null;
    const buP = bu && global.HousingPath ? HousingPath.project(bu.zhviSeries, { years: 5 }) : null;
    const fxP = fx && global.HousingPath ? HousingPath.project(fx.zhviSeries, { officialYoy: fx.zhvfYoy, years: 5 }) : null;
    const fxWalk = fx && global.HousingPath ? HousingPath.alignedWalk(fx.zhviSeries, fx.zoriSeries) : [];
    const yearsNow = fx && isNum(fx.years_rent) ? fx.years_rent : (fxWalk.length ? fxWalk[fxWalk.length - 1].years : null);
    const yearsAgo = fxWalk.length ? fxWalk[0].years : null;

    if (id === "scene-state") {
      return {
        facts: [
          { k: "Places", v: String(priced.length), s: "counties + cities" },
          { k: "Highest ZHVI", v: fmt(max && max.zhvi, "usd"), s: max ? short(max.name) : "" },
          { k: "Median ZHVI", v: fmt(med, "usd"), s: "live Zillow" },
          { k: "Lowest ZHVI", v: fmt(min && min.zhvi, "usd"), s: min ? short(min.name) : "" }
        ],
        kicker: "Typical home, every county, this month",
        take: isNum(spread)
          ? "Finding: a “Virginia home” spans " + d3.format(".1f")(spread) + "× from richest to poorest. Color is that distance."
          : "Finding: the spread is the story — not a statewide average.",
        chart: (el) => drawStrip(el, priced.map((r) => r.zhvi), { lo: min && min.zhvi, hi: max && max.zhvi, unit: "usd" })
      };
    }

    if (id === "scene-peak") {
      const cagr = fcP ? 100 * fcP.cagr : null;
      return {
        facts: [
          { k: "Typical home", v: fmt(fc && fc.zhvi, "usd"), s: "ZHVI live" },
          { k: "10y CAGR", v: fmt(cagr, "yoy"), s: fcP && fcP.ago ? "since " + yearOf(fcP.ago.date) : "ZHVI" },
          { k: "Years of rent", v: fmt(fc && fc.years_rent, "years"), s: "ZHVI ÷ (ZORI×12)" },
          { k: "Population", v: fmt(fc && fc.acs_pop, "count"), s: "ACS" }
        ],
        kicker: "Falls Church · 10-year typical home",
        take: isNum(cagr)
          ? "Finding: the smallest shape on the map compounded about " + d3.format(".1f")(cagr) + "% a year for a decade."
          : "Finding: Falls Church is an independent city, not a county.",
        chart: (el) => drawSeries(el, [{ name: "ZHVI", pts: yearlyPts(fc), color: HOME }], { kind: "usd" })
      };
    }

    if (id === "scene-floor") {
      const cagr = buP ? 100 * buP.cagr : null;
      const ratio = (fc && bu && bu.zhvi) ? fc.zhvi / bu.zhvi : null;
      return {
        facts: [
          { k: "Typical home", v: fmt(bu && bu.zhvi, "usd"), s: "ZHVI live" },
          { k: "10y CAGR", v: fmt(cagr, "yoy"), s: buP && buP.ago ? "since " + yearOf(buP.ago.date) : "ZHVI" },
          { k: "vs Falls Church", v: isNum(ratio) ? d3.format(".1f")(ratio) + "×" : "—", s: "this month" },
          { k: "Years of rent", v: fmt(bu && bu.years_rent, "years"), s: "if ZORI exists" }
        ],
        kicker: "Buchanan · 10-year typical home",
        take: isNum(ratio)
          ? "Finding: same state, same Zillow index. Falls Church is " + d3.format(".1f")(ratio) + "× Buchanan tonight."
          : "Finding: Buchanan County is the bottom of Virginia.",
        chart: (el) => drawSeries(el, [{ name: "ZHVI", pts: yearlyPts(bu), color: RENT }], { kind: "usd" })
      };
    }

    if (id === "scene-spread") {
      const agoRatio = (fcP && buP && buP.ago && buP.ago.v) ? fcP.ago.v / buP.ago.v : null;
      const nowRatio = (fc && bu && bu.zhvi) ? fc.zhvi / bu.zhvi : null;
      return {
        facts: [
          { k: "Falls Church now", v: fmt(fc && fc.zhvi, "usd"), s: short(fc && fc.name) },
          { k: "Buchanan now", v: fmt(bu && bu.zhvi, "usd"), s: short(bu && bu.name) },
          { k: "Gap 10y ago", v: isNum(agoRatio) ? d3.format(".1f")(agoRatio) + "×" : "—", s: "same two places" },
          { k: "Gap now", v: isNum(nowRatio) ? d3.format(".1f")(nowRatio) + "×" : "—", s: "live ZHVI" }
        ],
        kicker: "Indexed to 100 at the start of the decade",
        take: (isNum(agoRatio) && isNum(nowRatio))
          ? "Finding: the gap " + (nowRatio > agoRatio ? "widened" : "narrowed") + " — "
            + d3.format(".1f")(agoRatio) + "× then, " + d3.format(".1f")(nowRatio) + "× now."
          : "Finding: two marks, one range a “Virginia home” has to mean.",
        chart: (el) => drawSeries(el, [
          { name: "Falls Church", pts: indexPts(fc), color: HOME },
          { name: "Buchanan", pts: indexPts(bu), color: RENT }
        ], { kind: "index" })
      };
    }

    if (id === "scene-fairfax") {
      const vsMed = (fx && med) ? fx.zhvi / med : null;
      const cagr = fxP ? 100 * fxP.cagr : null;
      return {
        facts: [
          { k: "Typical home", v: fmt(fx && fx.zhvi, "usd"), s: "Fairfax ZHVI" },
          { k: "vs state median", v: isNum(vsMed) ? d3.format(".1f")(vsMed) + "×" : "—", s: "this month" },
          { k: "10y CAGR", v: fmt(cagr, "yoy"), s: "typical home" },
          { k: "ZORI rent", v: fmt(fx && fx.zori, "rent"), s: "observed" }
        ],
        kicker: "Fairfax · home vs rent, 10 years",
        take: isNum(vsMed)
          ? "Finding: Fairfax is not the peak. It is " + d3.format(".1f")(vsMed) + "× the statewide typical home — where most of the expensive story actually sits."
          : "Finding: Fairfax is the county the rest of the film holds on.",
        chart: (el) => drawTwin(el, fx)
      };
    }

    if (id === "scene-years") {
      const delta = (isNum(yearsNow) && isNum(yearsAgo)) ? yearsNow - yearsAgo : null;
      return {
        facts: [
          { k: "Years now", v: fmt(yearsNow, "years"), s: "ZHVI ÷ (ZORI×12)" },
          { k: "Years ~10y ago", v: fmt(yearsAgo, "years"), s: fxWalk.length ? String(fxWalk[0].year) : "" },
          { k: "Change", v: isNum(delta) ? (delta > 0 ? "+" : "") + d3.format(".1f")(delta) + " yr" : "—", s: "time, not dollars" },
          { k: "HUD 2BR FMR", v: fmt(fx && fx.fmr_2br, "rent"), s: "bedroom rent, not $/ft²" }
        ],
        kicker: "Fairfax · years of rent to buy, year by year",
        take: isNum(delta)
          ? "Finding: the same county got " + d3.format(".1f")(Math.abs(delta)) + " years "
            + (delta > 0 ? "harder" : "easier") + " to buy with rent. The map is a clock."
          : "Finding: a home can cost many years of rent.",
        chart: (el) => drawYears(el, fxWalk)
      };
    }

    if (id === "scene-cone") {
      const y1 = fx && fx.zhvfYoy;
      const y5 = fxP && fxP.y5 && fxP.y5.mid;
      return {
        facts: [
          { k: "Metro Y1", v: fmt(y1, "yoy"), s: fx && fx.zhvfName ? fx.zhvfName : "ZHVF" },
          { k: "10y CAGR", v: fxP ? fmt(100 * fxP.cagr, "yoy") : "—", s: "then continued" },
          { k: "+5y trend home", v: fmt(y5, "usd"), s: "not a priced model" },
          { k: "Fairfax now", v: fmt(fx && fx.zhvi, "usd"), s: "ZHVI" }
        ],
        kicker: "10-year index (start = 100) + short forecast",
        take: "Finding: year 1 is Zillow’s call for Washington, DC — not Washington, Indiana. Years 2–5 are the last decade, extended. A trend. Not 2031.",
        chart: (el) => drawFanMini(el, fx)
      };
    }

    if (id === "scene-cut") {
      return {
        facts: [
          { k: "BMC wards", v: String(asr.length), s: "IGR ready reckoner" },
          { k: "Median floor", v: fmt(asrMed, "inr"), s: city.asr_vintage || "ASR" },
          { k: "Peak / floor", v: isNum(asrSpread) ? d3.format(".1f")(asrSpread) + "×" : "—", s: "Malabar ÷ cheapest" },
          { k: "Ward walk", v: "None", s: "no 10-year series" }
        ],
        kicker: "Stamp-duty floor · 24 wards, tallest first",
        take: "Finding: Mumbai does not publish the Virginia walk. What exists is a floor, frozen FY 2026-27 at 0% revision. Two more cities sit east, without even that.",
        chart: (el) => drawLadderMini(el, asr)
      };
    }

    if (id === "scene-east") {
      return {
        facts: [
          { k: "ASR floor", v: fmt(east && east.asr_psf, "inr"), s: east && east.name },
          { k: "Rank of 24", v: fmt(east && east.asr_rank, "rank"), s: "1 = Malabar" },
          { k: "Households", v: fmt(east && east.households, "count"), s: "Census 2011" },
          { k: "Years of city rent", v: fmt(east && east.years_city_rent, "years"), s: "1,000 ft² RR ÷ city 2BHK" }
        ],
        kicker: "M East vs 24-ward median floor",
        take: east && isNum(east.vs_median)
          ? "Finding: a cheap stamp-duty floor (" + d3.format(".0f")(east.vs_median) + "% of the 24-ward median) on a ward that held a lot of 2011 households."
          : "Finding: start where the floor is low and the count is high.",
        chart: (el) => drawBars(el, [
          { name: "M East", v: east && east.asr_psf, color: RENT },
          { name: "24-ward median", v: asrMed, color: GOLD },
          { name: "Malabar Hill", v: hill && hill.asr_psf, color: HOME }
        ], "inr")
      };
    }

    if (id === "scene-hill") {
      return {
        facts: [
          { k: "ASR floor", v: fmt(hill && hill.asr_psf, "inr"), s: "Ward D" },
          { k: "vs median", v: fmt(hill && hill.vs_median, "pct"), s: "24-ward median = 100%" },
          { k: "1,000 ft² RR", v: fmt(hill && hill.floor_1000, "inr_amt"), s: "carpet 2BHK" },
          { k: "Island", v: "Yes", s: "not the suburbs" }
        ],
        kicker: "Malabar Hill as a share of every BMC floor",
        take: isNum(asrSpread)
          ? "Finding: same ready-reckoner method. Ward D is " + d3.format(".1f")(asrSpread) + "× the cheapest BMC stamp-duty floor."
          : "Finding: the top of 24.",
        chart: (el) => drawLadderMini(el, asr, "D")
      };
    }

    if (id === "scene-flat") {
      const ratio = (hill && east && east.floor_1000) ? hill.floor_1000 / east.floor_1000 : null;
      const rent = city.rent_2bhk_inr;
      return {
        facts: [
          { k: "Malabar 1,000 ft²", v: fmt(hill && hill.floor_1000, "inr_amt"), s: "RR floor, not a listing" },
          { k: "M East 1,000 ft²", v: fmt(east && east.floor_1000, "inr_amt"), s: "same carpet" },
          { k: "Ratio", v: isNum(ratio) ? d3.format(".1f")(ratio) + "×" : "—", s: "one flat vs another" },
          { k: "City 2BHK rent", v: rent ? "₹" + d3.format(",")(rent) : "—", s: "Magicbricks, not mapped" }
        ],
        kicker: "A thousand square feet · two wards",
        take: isNum(ratio)
          ? "Finding: the BMC version of Falls Church / Buchanan. Same 1,000 carpet ft², " + d3.format(".1f")(ratio) + "× the stamp-duty floor."
          : "Finding: a home, not a hectare.",
        chart: (el) => drawBars(el, [
          { name: "M East 1,000 ft²", v: east && east.floor_1000, color: RENT },
          { name: "Malabar 1,000 ft²", v: hill && hill.floor_1000, color: HOME }
        ], "inr_amt")
      };
    }

    if (id === "scene-harbour") {
      return {
        facts: [
          { k: "BMC", v: "A rate", s: "24-ward IGR ASR" },
          { k: "Navi Mumbai", v: fmt(navi && navi.pop, "count"), s: "Census 2011 people" },
          { k: "Mumbai 3.0", v: fmt(m3 && m3.area_km2, "km2"), s: "notified, no ASR" },
          { k: "Data regimes", v: "3", s: "floor · census · plan" }
        ],
        kicker: "One harbour, three things the map can actually say",
        take: "Finding: BMC has a stamp-duty floor. NMMC already has people. KSC has land and a notification. Treating them as one Mumbai price is a category error.",
        chart: (el) => drawBars(el, [
          { name: "BMC pop 2011", v: bmcPop, color: HOME },
          { name: "NMMC pop 2011", v: navi && navi.pop, color: RENT }
        ], "count")
      };
    }

    if (id === "scene-navi") {
      const vsBmc = (navi && navi.pop && bmcPop) ? navi.pop / bmcPop : null;
      return {
        facts: [
          { k: "Population", v: fmt(navi && navi.pop, "count"), s: "Census 2011, NMMC" },
          { k: "Households", v: fmt(navi && navi.households, "count"), s: "same vintage" },
          { k: "vs BMC pop", v: isNum(vsBmc) ? d3.format(".0%")(vsBmc) : "—", s: "2011 counts" },
          { k: "Mapped ASR", v: "No", s: "node IGR not compiled" }
        ],
        kicker: "People already here · 2011 stock vs BMC",
        take: isNum(vsBmc)
          ? "Finding: NMMC was already " + d3.format(".0%")(vsBmc) + " of BMC’s 2011 population — a planned city, not empty land. The missing number is the mapped floor."
          : "Finding: this city was planned. It already has people.",
        chart: (el) => drawBars(el, [
          { name: "BMC households", v: bmcHh, color: HOME },
          { name: "NMMC households", v: navi && navi.households, color: RENT }
        ], "count")
      };
    }

    if (id === "scene-m3") {
      return {
        facts: [
          { k: "Notified area", v: fmt(m3 && m3.area_km2, "km2"), s: "KSC New Town" },
          { k: "Villages", v: fmt(m3 && m3.villages, "count"), s: "Panvel, Uran, Pen" },
          { k: "NTDA", v: "15 Oct 2024", s: "MMRDA" },
          { k: "Ready reckoner", v: "None", s: "schematic envelope" }
        ],
        kicker: "Land without a floor · area vs NMMC",
        take: "Finding: 323 km² and 124 villages is a planning object, not a price. Dashed because a cadastral NTDA sheet is not on this map. Near Atal Setu, NMIA, JNPT.",
        chart: (el) => drawBars(el, [
          { name: "NMMC km²", v: navi && navi.area_km2, color: RENT },
          { name: "KSC km²", v: m3 && m3.area_km2, color: GOLD }
        ], "km2")
      };
    }

    const vaSpread = spread;
    return {
      facts: [
        { k: "Virginia range", v: isNum(vaSpread) ? d3.format(".1f")(vaSpread) + "×" : "—", s: "ZHVI max / min" },
        { k: "BMC range", v: isNum(asrSpread) ? d3.format(".1f")(asrSpread) + "×" : "—", s: "ASR max / min" },
        { k: "Fairfax years", v: fmt(yearsNow, "years"), s: "home price ÷ annual rent" },
        { k: "NMMC people", v: fmt(navi && navi.pop, "count"), s: "already a city" }
      ],
      kicker: "Two metros. Two kinds of data.",
      take: "Finding: Virginia can show how the gap moved over 10 years. Mumbai can show today’s floor, a census count, and a plan. The bars compare ranges — not the same kind of inequality.",
      chart: (el) => drawBars(el, [
        { name: "VA ZHVI spread", v: vaSpread, color: HOME },
        { name: "BMC ASR spread", v: asrSpread, color: GOLD }
      ], "ratio")
    };
  }

  function okPt(d) {
    return d && d.t && !isNaN(+d.t) && isNum(d.v != null ? d.v : d.mid);
  }

  function okYr(p) {
    return p && p.t && !isNaN(+p.t) && isNum(p.v);
  }

  function isNum(v) {
    return v != null && v !== "" && Number.isFinite(+v);
  }

  function short(s) {
    return String(s || "").replace(/ County$/i, "").replace(/ city$/i, "");
  }

  function yearOf(date) {
    return date ? String(date).slice(0, 4) : "";
  }

  function yearlyPts(row) {
    if (!row || !global.HousingPath) return [];
    return HousingPath.yearly(row.zhviSeries)
      .filter((p) => p.t && !isNaN(+p.t) && isNum(p.v))
      .map((p) => ({ t: p.t, v: p.v, year: p.year }));
  }

  function indexPts(row) {
    const pts = yearlyPts(row);
    if (!pts.length || !pts[0].v) return [];
    const base = pts[0].v;
    return pts.map((p) => ({ t: p.t, v: 100 * p.v / base, year: p.year }));
  }

  function factsHtml(items) {
    if (!items || !items.length) return "";
    return `<div class="cine-facts">${items.map((it) =>
      `<div class="cine-fact"><span>${esc(it.k)}</span><strong>${it.v}</strong><em>${esc(it.s || "")}</em></div>`
    ).join("")}</div>`;
  }

  function size(el, h) {
    const r = el.getBoundingClientRect();
    return {
      width: Math.max(240, r.width || 320),
      height: Math.max(h || 152, r.height || 152)
    };
  }

  function svgRoot(el, width, height) {
    el.innerHTML = "";
    return d3.select(el).append("svg")
      .attr("viewBox", "0 0 " + width + " " + height)
      .attr("preserveAspectRatio", "xMidYMid meet");
  }

  function drawSeries(el, series, opts) {
    opts = opts || {};
    const { width, height } = size(el, 158);
    const pad = { t: 14, r: 12, b: 28, l: 44 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const pts = series.reduce((a, s) => a.concat((s.pts || []).filter(okPt)), []);
    if (pts.length < 2) {
      el.innerHTML = `<p class="path-empty">Not enough history for this inset.</p>`;
      return;
    }
    const x = d3.scaleTime().domain(d3.extent(pts, (d) => d.t)).range([0, innerW]);
    const y = d3.scaleLinear().domain(padExt(d3.extent(pts, (d) => d.v))).range([innerH, 0]);
    const svg = svgRoot(el, width, height);
    const g = svg.append("g").attr("transform", "translate(" + pad.l + "," + pad.t + ")");
    g.append("g").attr("transform", "translate(0," + innerH + ")")
      .call(d3.axisBottom(x).ticks(4).tickFormat(d3.timeFormat("%Y"))).call(axisStyle);
    const yFmt = opts.kind === "index"
      ? (v) => d3.format(".0f")(v)
      : (v) => d3.format(".2s")(v);
    g.append("g").call(d3.axisLeft(y).ticks(4).tickFormat(yFmt)).call(axisStyle);
    const ln = d3.line().defined(okPt).x((d) => x(d.t)).y((d) => y(d.v)).curve(d3.curveMonotoneX);
    series.forEach((s) => {
      const sp = (s.pts || []).filter(okPt);
      if (sp.length < 2) return;
      g.append("path").attr("d", ln(sp)).attr("fill", "none").attr("stroke", s.color || HOME).attr("stroke-width", 2);
      const last = sp[sp.length - 1];
      g.append("circle").attr("cx", x(last.t)).attr("cy", y(last.v)).attr("r", 3.2).attr("fill", s.color || HOME);
      if (series.length > 1) {
        g.append("text").attr("x", x(last.t) - 4).attr("y", y(last.v) - 8)
          .attr("text-anchor", "end").attr("fill", s.color || HOME).attr("font-size", 10).attr("font-family", FONT)
          .text(s.name);
      }
    });
  }

  function drawTwin(el, row) {
    if (!row) return drawSeries(el, [], {});
    const home = HousingPath.yearly(row.zhviSeries).filter(okYr);
    const rent = HousingPath.yearly(row.zoriSeries).filter(okYr);
    if (home.length < 2) return drawSeries(el, [{ name: "ZHVI", pts: yearlyPts(row), color: HOME }], { kind: "usd" });
    const { width, height } = size(el, 168);
    const pad = { t: 16, r: 44, b: 28, l: 44 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const x = d3.scaleTime().domain(d3.extent(home.concat(rent), (d) => d.t)).range([0, innerW]);
    const yH = d3.scaleLinear().domain(padExt(d3.extent(home, (d) => d.v))).range([innerH, 0]);
    const yR = d3.scaleLinear().domain(padExt(d3.extent(rent, (d) => d.v))).range([innerH, 0]);
    const svg = svgRoot(el, width, height);
    const g = svg.append("g").attr("transform", "translate(" + pad.l + "," + pad.t + ")");
    g.append("g").attr("transform", "translate(0," + innerH + ")")
      .call(d3.axisBottom(x).ticks(4).tickFormat(d3.timeFormat("%Y"))).call(axisStyle);
    g.append("g").call(d3.axisLeft(yH).ticks(3).tickFormat((v) => "$" + d3.format(".2s")(v))).call(axisStyle);
    g.append("g").attr("transform", "translate(" + innerW + ",0)")
      .call(d3.axisRight(yR).ticks(3).tickFormat((v) => "$" + d3.format(".2s")(v))).call(axisStyle);
    const ln = d3.line().x((d) => x(d.t)).y((d) => yH(d.v)).curve(d3.curveMonotoneX);
    const lnR = d3.line().x((d) => x(d.t)).y((d) => yR(d.v)).curve(d3.curveMonotoneX);
    g.append("path").attr("d", ln(home)).attr("fill", "none").attr("stroke", HOME).attr("stroke-width", 2);
    if (rent.length > 1) {
      g.append("path").attr("d", lnR(rent)).attr("fill", "none").attr("stroke", RENT).attr("stroke-width", 2);
    }
    g.append("text").attr("x", 0).attr("y", -4).attr("fill", HOME).attr("font-size", 10).attr("font-family", FONT).text("Home");
    g.append("text").attr("x", innerW).attr("y", -4).attr("text-anchor", "end").attr("fill", RENT).attr("font-size", 10).attr("font-family", FONT).text("Rent");
  }

  function drawYears(el, walk) {
    if (!walk || walk.length < 3) {
      el.innerHTML = `<p class="path-empty">Need overlapping ZHVI + ZORI for a years-of-rent walk.</p>`;
      return;
    }
    drawSeries(el, [{
      name: "Years",
      pts: walk.map((d) => ({ t: d.t, v: d.years, year: d.year })),
      color: GOLD
    }], { kind: "index" });
  }

  function drawFanMini(el, row) {
    if (!row || !global.HousingPath) return;
    const homeP = HousingPath.project(row.zhviSeries, { officialYoy: row.zhvfYoy, years: 5 });
    if (!homeP) {
      el.innerHTML = `<p class="path-empty">Need ~18 months of ZHVI for a cone.</p>`;
      return;
    }
    const { width, height } = size(el, 168);
    const pad = { t: 16, r: 12, b: 28, l: 36 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const base = homeP.ago.v;
    const hist = homeP.hist.filter(okPt).map((p) => ({ t: p.t, v: 100 * p.mid / base }));
    const fan = homeP.fan.filter((p) => p.t && !isNaN(+p.t)).map((p) => ({ t: p.t, mid: 100 * p.mid / base, lo: 100 * p.lo / base, hi: 100 * p.hi / base }));
    const now = homeP.last.t || (homeP.last.date && new Date(homeP.last.date));
    if (hist.length < 2 || !now || isNaN(+now)) {
      el.innerHTML = `<p class="path-empty">Need ~18 months of ZHVI for a cone.</p>`;
      return;
    }
    const x = d3.scaleTime().domain(d3.extent(hist.concat(fan).map((d) => d.t))).range([0, innerW]);
    const y = d3.scaleLinear().domain(padExt(d3.extent(hist.map((d) => d.v).concat(fan.map((d) => d.hi))))).range([innerH, 0]);
    const svg = svgRoot(el, width, height);
    const g = svg.append("g").attr("transform", "translate(" + pad.l + "," + pad.t + ")");
    const area = d3.area().x((d) => x(d.t)).y0((d) => y(d.lo)).y1((d) => y(d.hi)).curve(d3.curveMonotoneX);
    const ln = d3.line().x((d) => x(d.t)).y((d) => y(d.v != null ? d.v : d.mid)).curve(d3.curveMonotoneX);
    g.append("g").attr("transform", "translate(0," + innerH + ")")
      .call(d3.axisBottom(x).ticks(4).tickFormat(d3.timeFormat("%Y"))).call(axisStyle);
    g.append("g").call(d3.axisLeft(y).ticks(4).tickFormat((v) => d3.format(".0f")(v))).call(axisStyle);
    g.append("path").datum([{ t: now, lo: 100 * homeP.last.v / base, hi: 100 * homeP.last.v / base }].concat(fan))
      .attr("d", area).attr("fill", HOME).attr("opacity", 0.2);
    g.append("path").datum(hist).attr("d", ln).attr("fill", "none").attr("stroke", HOME).attr("stroke-width", 2);
    g.append("path").datum(fan.map((d) => ({ t: d.t, v: d.mid })))
      .attr("d", ln).attr("fill", "none").attr("stroke", HOME).attr("stroke-width", 1.5).attr("stroke-dasharray", "5 4");
    g.append("line").attr("x1", x(now)).attr("x2", x(now)).attr("y1", 0).attr("y2", innerH)
      .attr("stroke", GRID).attr("stroke-width", 1);
    g.append("text").attr("x", x(now) + 4).attr("y", 10).attr("fill", MUTED).attr("font-size", 10).attr("font-family", FONT).text("now");
  }

  function drawLadderMini(el, rows, hotId) {
    const ranked = (rows || []).filter((r) => isNum(r.asr_psf)).slice().sort((a, b) => b.asr_psf - a.asr_psf);
    if (!ranked.length) return;
    const { width, height } = size(el, 168);
    const pad = { t: 8, r: 8, b: 8, l: 8 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const x = d3.scaleLinear().domain([0, d3.max(ranked, (d) => d.asr_psf)]).range([0, innerW]);
    const y = d3.scaleBand().domain(ranked.map((d) => d.id)).range([0, innerH]).padding(0.15);
    const svg = svgRoot(el, width, height);
    const g = svg.append("g").attr("transform", "translate(" + pad.l + "," + pad.t + ")");
    g.selectAll("rect").data(ranked).join("rect")
      .attr("x", 0).attr("y", (d) => y(d.id))
      .attr("width", (d) => x(d.asr_psf)).attr("height", y.bandwidth())
      .attr("fill", (d) => (hotId && d.id === hotId) ? HOME : (d.id === "D" ? HOME : RENT))
      .attr("opacity", (d) => (hotId && d.id !== hotId) ? 0.35 : 0.9);
  }

  function drawStrip(el, values, opts) {
    const vals = (values || []).filter(isNum).map(Number).sort((a, b) => a - b);
    if (vals.length < 4) return;
    const { width, height } = size(el, 120);
    const pad = { t: 20, r: 16, b: 28, l: 16 };
    const innerW = width - pad.l - pad.r;
    const x = d3.scaleLinear().domain(d3.extent(vals)).range([0, innerW]);
    const svg = svgRoot(el, width, height);
    const g = svg.append("g").attr("transform", "translate(" + pad.l + "," + pad.t + ")");
    g.selectAll("line.dot").data(vals).join("line")
      .attr("class", "dot")
      .attr("x1", (d) => x(d)).attr("x2", (d) => x(d))
      .attr("y1", 8).attr("y2", 48)
      .attr("stroke", HOME).attr("stroke-width", 1.2).attr("opacity", 0.35);
    if (opts && isNum(opts.lo)) {
      g.append("text").attr("x", x(opts.lo)).attr("y", 68).attr("fill", MUTED).attr("font-size", 10).attr("font-family", FONT)
        .attr("text-anchor", "start").text(HousingMaps.fmt(opts.lo, opts.unit));
    }
    if (opts && isNum(opts.hi)) {
      g.append("text").attr("x", x(opts.hi)).attr("y", 68).attr("fill", MUTED).attr("font-size", 10).attr("font-family", FONT)
        .attr("text-anchor", "end").text(HousingMaps.fmt(opts.hi, opts.unit));
    }
  }

  function drawBars(el, items, kind) {
    const rows = (items || []).filter((d) => isNum(d.v));
    if (!rows.length) return;
    const { width, height } = size(el, Math.max(120, 28 + rows.length * 28));
    const pad = { t: 8, r: 56, b: 8, l: 108 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const x = d3.scaleLinear().domain([0, d3.max(rows, (d) => +d.v)]).range([0, innerW]);
    const y = d3.scaleBand().domain(rows.map((d) => d.name)).range([0, innerH]).padding(0.22);
    const svg = svgRoot(el, width, height);
    const g = svg.append("g").attr("transform", "translate(" + pad.l + "," + pad.t + ")");
    g.selectAll("rect").data(rows).join("rect")
      .attr("x", 0).attr("y", (d) => y(d.name))
      .attr("width", (d) => x(+d.v)).attr("height", y.bandwidth())
      .attr("fill", (d) => d.color || HOME).attr("opacity", 0.9);
    g.selectAll("text.lab").data(rows).join("text")
      .attr("class", "lab")
      .attr("x", -8).attr("y", (d) => y(d.name) + y.bandwidth() / 2)
      .attr("dy", "0.35em").attr("text-anchor", "end")
      .attr("fill", MUTED).attr("font-size", 11).attr("font-family", FONT)
      .text((d) => d.name);
    const fmt = (v) => {
      if (kind === "ratio") return d3.format(".1f")(v) + "×";
      if (global.HousingMaps) return HousingMaps.fmt(v, kind);
      return d3.format(",.0f")(v);
    };
    g.selectAll("text.val").data(rows).join("text")
      .attr("class", "val")
      .attr("x", (d) => x(+d.v) + 6).attr("y", (d) => y(d.name) + y.bandwidth() / 2)
      .attr("dy", "0.35em").attr("fill", INK).attr("font-size", 11).attr("font-family", FONT)
      .text((d) => fmt(d.v));
  }

  function padExt(ext) {
    const a = ext[0];
    const b = ext[1];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return [0, 1];
    const p = (b - a) * 0.08 || Math.abs(b) * 0.08 || 1;
    return [a - p, b + p];
  }

  function axisStyle(sel) {
    sel.selectAll("text").attr("font-family", FONT).attr("fill", MUTED).attr("font-size", 10);
    sel.selectAll("line, path").attr("stroke", GRID);
    sel.select(".domain").attr("stroke", GRID);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  global.HousingRail = HousingRail;
})(window);
