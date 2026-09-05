/**
 * Time views that are not choropleths:
 *  - connected scatter: 10y walk through rent × home-value space
 *  - indexed fan: observed path + 5y cone (Zillow metro Y1, then CAGR)
 *  - Mumbai: ASR ladder + RR floor vs Census 2011 households (no weather)
 */
(function (global) {
  "use strict";

  const INK = "#2c2824";
  const MUTED = "#7a7168";
  const HOME = "#9c5a4e";
  const RENT = "#7d9a86";
  const FONT = '"Source Sans 3", "Segoe UI", sans-serif';
  const parseDate = d3.timeParse("%Y-%m-%d");

  function sizeOf(id, minH) {
    const el = document.getElementById(id);
    if (!el) return { el: null, width: 0, height: 0 };
    const r = el.getBoundingClientRect();
    return { el, width: Math.max(240, r.width), height: Math.max(minH || 280, r.height) };
  }

  function yearly(series) {
    const by = {};
    (series || []).forEach((p) => {
      if (!Number.isFinite(p.v)) return;
      by[p.date.slice(0, 4)] = p;
    });
    return Object.keys(by).sort().map((y) => ({
      year: +y,
      date: by[y].date,
      v: by[y].v,
      t: parseDate(by[y].date) || new Date(by[y].date)
    }));
  }

  function alignedWalk(zh, zo) {
    const a = yearly(zh);
    const b = yearly(zo);
    const rent = {};
    b.forEach((p) => { rent[p.year] = p; });
    return a.map((p) => {
      const r = rent[p.year];
      if (!r) return null;
      return { year: p.year, date: p.date, t: p.t, home: p.v, rent: r.v, years: p.v / (r.v * 12) };
    }).filter(Boolean);
  }

  function addYears(dateStr, n) {
    const y = +dateStr.slice(0, 4) + n;
    return y + dateStr.slice(4);
  }

  function project(series, opts) {
    const pts = (series || []).filter((d) => Number.isFinite(d.v));
    if (pts.length < 18) return null;
    const last = pts[pts.length - 1];
    const target = addYears(last.date, -10);
    let ago = pts[0];
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].date >= target) { ago = pts[i]; break; }
    }
    const years = Math.max(1, (parseDate(last.date) - parseDate(ago.date)) / (365.25 * 86400000));
    if (!(ago.v > 0) || !(last.v > 0)) return null;
    const cagr = Math.pow(last.v / ago.v, 1 / years) - 1;
    const annual = [];
    const byYear = yearly(pts);
    for (let i = 1; i < byYear.length; i++) {
      if (byYear[i - 1].v > 0) annual.push(byYear[i].v / byYear[i - 1].v - 1);
    }
    const sig = d3.deviation(annual);
    const vol = Number.isFinite(sig) ? sig : Math.abs(cagr);
    const official = opts && Number.isFinite(opts.officialYoy) ? opts.officialYoy / 100 : null;
    const horizon = (opts && opts.years) || 5;
    const hist = pts.map((p) => ({ date: p.date, t: parseDate(p.date), mid: p.v, lo: p.v, hi: p.v }));
    const fan = [];
    let mid = last.v;
    for (let y = 1; y <= horizon; y++) {
      const g = (y === 1 && official != null) ? official : cagr;
      mid = mid * (1 + g);
      const w = Math.abs(mid) * vol * Math.sqrt(y);
      const date = addYears(last.date, y);
      fan.push({
        date,
        t: parseDate(date) || new Date(date),
        mid,
        lo: Math.max(0, mid - w),
        hi: mid + w,
        official: y === 1 && official != null
      });
    }
    return {
      cagr,
      vol,
      officialYoy: official != null ? official * 100 : null,
      ago,
      last,
      years: years,
      hist,
      fan,
      y5: fan[fan.length - 1]
    };
  }

  function empty(el, msg) {
    el.innerHTML = "";
    d3.select(el).append("p").attr("class", "path-empty").text(msg);
  }

  function drawWalk(opts) {
    const { el, width, height } = sizeOf("path-walk", 300);
    if (!el) return;
    const row = opts.row;
    const walk = alignedWalk(row && row.zhviSeries, row && row.zoriSeries);
    if (walk.length < 3) {
      empty(el, "This county has too little overlapping ZHVI + ZORI history for a 10-year rent×price walk.");
      return;
    }
    el.innerHTML = "";
    const pad = { t: 18, r: 16, b: 36, l: 52 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const nowDots = (opts.rows || []).map((r) => {
      if (!Number.isFinite(r.zhvi) || !Number.isFinite(r.zori)) return null;
      return { name: r.name, rent: r.zori, home: r.zhvi, selected: r.fips === row.fips };
    }).filter(Boolean);

    const x = d3.scaleLinear()
      .domain(padExtent(d3.extent(walk.concat(nowDots), (d) => d.rent)))
      .range([0, innerW]);
    const y = d3.scaleLinear()
      .domain(padExtent(d3.extent(walk.concat(nowDots), (d) => d.home)))
      .range([innerH, 0]);

    const svg = d3.select(el).append("svg")
      .attr("viewBox", "0 0 " + width + " " + height)
      .attr("preserveAspectRatio", "xMidYMid meet");
    const g = svg.append("g").attr("transform", "translate(" + pad.l + "," + pad.t + ")");

    const xDom = x.domain();
    [15, 25, 35].forEach((yr) => {
      const p0 = [xDom[0], yr * 12 * xDom[0]];
      const p1 = [xDom[1], yr * 12 * xDom[1]];
      g.append("line")
        .attr("x1", x(p0[0])).attr("y1", y(p0[1]))
        .attr("x2", x(p1[0])).attr("y2", y(p1[1]))
        .attr("stroke", "#e0d6c8").attr("stroke-dasharray", "3 4").attr("stroke-width", 1);
      g.append("text")
        .attr("x", x(p1[0]) - 4).attr("y", y(p1[1]) + 10)
        .attr("text-anchor", "end").attr("fill", MUTED).attr("font-size", 10).attr("font-family", FONT)
        .text(yr + "y of rent");
    });

    g.append("g").attr("transform", "translate(0," + innerH + ")")
      .call(d3.axisBottom(x).ticks(5).tickFormat((v) => "$" + d3.format(".2s")(v)))
      .call(styleAxis);
    g.append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat((v) => "$" + d3.format(".2s")(v)))
      .call(styleAxis);

    g.append("text").attr("x", innerW / 2).attr("y", innerH + 32)
      .attr("text-anchor", "middle").attr("fill", MUTED).attr("font-size", 11).attr("font-family", FONT)
      .text("Typical rent / month (ZORI)");
    g.append("text").attr("transform", "rotate(-90)").attr("x", -innerH / 2).attr("y", -40)
      .attr("text-anchor", "middle").attr("fill", MUTED).attr("font-size", 11).attr("font-family", FONT)
      .text("Typical home (ZHVI)");

    g.selectAll("circle.peer")
      .data(nowDots.filter((d) => !d.selected))
      .join("circle")
      .attr("class", "peer")
      .attr("cx", (d) => x(d.rent)).attr("cy", (d) => y(d.home))
      .attr("r", 2.4).attr("fill", "#cfc3b3").attr("opacity", 0.7);

    const line = d3.line().x((d) => x(d.rent)).y((d) => y(d.home)).curve(d3.curveCatmullRom.alpha(0.5));
    g.append("path").attr("d", line(walk)).attr("fill", "none").attr("stroke", HOME).attr("stroke-width", 2.2);

    const col = d3.scaleLinear().domain([walk[0].year, walk[walk.length - 1].year]).range(["#7d9a86", HOME]);
    g.selectAll("circle.step")
      .data(walk)
      .join("circle")
      .attr("cx", (d) => x(d.rent)).attr("cy", (d) => y(d.home))
      .attr("r", (d, i) => i === walk.length - 1 ? 5.5 : 3)
      .attr("fill", (d) => col(d.year))
      .attr("stroke", "#fffdf8").attr("stroke-width", 1);

    const first = walk[0];
    const last = walk[walk.length - 1];
    g.append("text").attr("x", x(first.rent) + 6).attr("y", y(first.home) - 6)
      .attr("fill", MUTED).attr("font-size", 10).attr("font-family", FONT).text(first.year);
    g.append("text").attr("x", x(last.rent) + 8).attr("y", y(last.home) + 4)
      .attr("fill", INK).attr("font-size", 11).attr("font-family", FONT).attr("font-weight", 600)
      .text("now · " + last.year);

    const homeP = project(row.zhviSeries, { officialYoy: row.zhvfYoy, years: 5 });
    const rentP = project(row.zoriSeries, { years: 5 });
    if (homeP && rentP && homeP.y5 && rentP.y5) {
      const fut = [
        { rent: last.rent, home: last.home },
        { rent: rentP.fan[0].mid, home: homeP.fan[0].mid },
        { rent: rentP.y5.mid, home: homeP.y5.mid }
      ];
      g.append("path").attr("d", line(fut))
        .attr("fill", "none").attr("stroke", HOME).attr("stroke-width", 1.6)
        .attr("stroke-dasharray", "5 4").attr("opacity", 0.85);
      g.append("circle").attr("cx", x(fut[2].rent)).attr("cy", y(fut[2].home))
        .attr("r", 4).attr("fill", "none").attr("stroke", HOME).attr("stroke-width", 1.4);
      g.append("text").attr("x", x(fut[2].rent) + 6).attr("y", y(fut[2].home) + 4)
        .attr("fill", HOME).attr("font-size", 10).attr("font-family", FONT)
        .text("+5y trend");
    }

    g.selectAll("circle.peer, circle.step").style("cursor", "default")
      .on("mousemove", (event, d) => {
        if (!opts.tip) return;
        if (d.home && d.rent && d.year) {
          opts.tip(event, "<strong>" + d.year + "</strong><br>Home $" + d3.format(",.0f")(d.home)
            + "<br>Rent $" + d3.format(",.0f")(d.rent) + "/mo"
            + "<br>" + d3.format(".1f")(d.years) + " years of rent to buy");
        } else if (d.name) {
          opts.tip(event, "<strong>" + d.name + "</strong><br>now");
        }
      })
      .on("mouseleave", () => { if (opts.tip) opts.tip(null); });
  }

  function drawFan(opts) {
    const { el, width, height } = sizeOf("path-fan", 300);
    if (!el) return;
    const row = opts.row;
    const homeP = project(row && row.zhviSeries, { officialYoy: row && row.zhvfYoy, years: 5 });
    const rentP = project(row && row.zoriSeries, { years: 5 });
    if (!homeP) {
      empty(el, "Need at least ~18 months of ZHVI to draw a 10-year path and cone.");
      return;
    }
    el.innerHTML = "";
    const pad = { t: 18, r: 16, b: 36, l: 40 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const idx = (p, base) => 100 * p / base;
    const hBase = homeP.ago.v;
    const rBase = rentP ? rentP.ago.v : null;
    const homeHist = homeP.hist.map((p) => ({ t: p.t, v: idx(p.mid, hBase), kind: "hist" }));
    const homeFan = homeP.fan.map((p) => ({
      t: p.t, mid: idx(p.mid, hBase), lo: idx(p.lo, hBase), hi: idx(p.hi, hBase), official: p.official
    }));
    const rentHist = rentP ? rentP.hist.map((p) => ({ t: p.t, v: idx(p.mid, rBase) })) : [];
    const rentFan = rentP ? rentP.fan.map((p) => ({
      t: p.t, mid: idx(p.mid, rBase), lo: idx(p.lo, rBase), hi: idx(p.hi, rBase)
    })) : [];

    const allT = homeHist.concat(homeFan).concat(rentHist).concat(rentFan).map((d) => d.t).filter(Boolean);
    const allV = homeHist.map((d) => d.v)
      .concat(homeFan.map((d) => d.hi))
      .concat(rentHist.map((d) => d.v))
      .concat(rentFan.map((d) => d.hi));
    const x = d3.scaleTime().domain(d3.extent(allT)).range([0, innerW]);
    const y = d3.scaleLinear().domain(padExtent(d3.extent(allV.filter(Number.isFinite)))).range([innerH, 0]);

    const svg = d3.select(el).append("svg")
      .attr("viewBox", "0 0 " + width + " " + height)
      .attr("preserveAspectRatio", "xMidYMid meet");
    const g = svg.append("g").attr("transform", "translate(" + pad.l + "," + pad.t + ")");

    const now = homeP.last.t || parseDate(homeP.last.date);
    g.append("line").attr("x1", x(now)).attr("x2", x(now)).attr("y1", 0).attr("y2", innerH)
      .attr("stroke", "#e0d6c8").attr("stroke-width", 1);
    g.append("text").attr("x", x(now) + 4).attr("y", 10)
      .attr("fill", MUTED).attr("font-size", 10).attr("font-family", FONT).text("now");

    const area = d3.area().x((d) => x(d.t)).y0((d) => y(d.lo)).y1((d) => y(d.hi)).curve(d3.curveMonotoneX);
    const ln = d3.line().x((d) => x(d.t)).y((d) => y(d.v != null ? d.v : d.mid)).curve(d3.curveMonotoneX);

    if (rentFan.length) {
      g.append("path").datum([{ t: now, lo: 100 * rentP.last.v / rBase, hi: 100 * rentP.last.v / rBase }].concat(rentFan))
        .attr("d", area).attr("fill", RENT).attr("opacity", 0.12);
    }
    g.append("path").datum([{ t: now, lo: 100 * homeP.last.v / hBase, hi: 100 * homeP.last.v / hBase }].concat(homeFan))
      .attr("d", area).attr("fill", HOME).attr("opacity", 0.16);

    g.append("path").datum(homeHist).attr("d", ln).attr("fill", "none").attr("stroke", HOME).attr("stroke-width", 2);
    if (rentHist.length) {
      g.append("path").datum(rentHist).attr("d", ln).attr("fill", "none").attr("stroke", RENT).attr("stroke-width", 2);
    }
    g.append("path").datum(homeFan.map((d) => ({ t: d.t, v: d.mid })))
      .attr("d", ln).attr("fill", "none").attr("stroke", HOME).attr("stroke-width", 1.6).attr("stroke-dasharray", "5 4");
    if (rentFan.length) {
      g.append("path").datum(rentFan.map((d) => ({ t: d.t, v: d.mid })))
        .attr("d", ln).attr("fill", "none").attr("stroke", RENT).attr("stroke-width", 1.6).attr("stroke-dasharray", "5 4");
    }

    const y1 = homeFan.find((d) => d.official);
    if (y1) {
      g.append("circle").attr("cx", x(y1.t)).attr("cy", y(y1.mid)).attr("r", 4).attr("fill", HOME);
      g.append("text").attr("x", x(y1.t) + 6).attr("y", y(y1.mid) - 6)
        .attr("fill", HOME).attr("font-size", 10).attr("font-family", FONT)
        .text("Zillow metro Y1");
    }

    g.append("g").attr("transform", "translate(0," + innerH + ")")
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%Y")))
      .call(styleAxis);
    g.append("g").call(d3.axisLeft(y).ticks(5).tickFormat((v) => d3.format(".0f")(v)))
      .call(styleAxis);
    g.append("text").attr("x", 0).attr("y", -6)
      .attr("fill", MUTED).attr("font-size", 10).attr("font-family", FONT)
      .text("Index · 10y ago = 100");

    const legend = [
      { c: HOME, t: "Home (ZHVI)" },
      { c: RENT, t: "Rent (ZORI)" }
    ];
    legend.forEach((item, i) => {
      const lx = innerW - 120;
      g.append("line").attr("x1", lx).attr("x2", lx + 16).attr("y1", 8 + i * 14).attr("y2", 8 + i * 14)
        .attr("stroke", item.c).attr("stroke-width", 2);
      g.append("text").attr("x", lx + 20).attr("y", 12 + i * 14)
        .attr("fill", MUTED).attr("font-size", 10).attr("font-family", FONT).text(item.t);
    });
  }

  function drawMxLadder(opts) {
    const { el, width, height } = sizeOf("path-walk", 300);
    if (!el) return;
    const rows = (opts.rows || []).filter((r) => Number.isFinite(r.asr_psf))
      .slice().sort((a, b) => b.asr_psf - a.asr_psf);
    if (!rows.length) { empty(el, "No ASR points."); return; }
    el.innerHTML = "";
    const pad = { t: 8, r: 64, b: 28, l: 92 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const x = d3.scaleLinear().domain([0, d3.max(rows, (d) => d.asr_psf)]).range([0, innerW]);
    const y = d3.scaleBand().domain(rows.map((d) => d.id)).range([0, innerH]).padding(0.22);
    const svg = d3.select(el).append("svg")
      .attr("viewBox", "0 0 " + width + " " + height)
      .attr("preserveAspectRatio", "xMidYMid meet");
    const g = svg.append("g").attr("transform", "translate(" + pad.l + "," + pad.t + ")");
    g.append("g").attr("transform", "translate(0," + innerH + ")")
      .call(d3.axisBottom(x).ticks(4).tickFormat((v) => "₹" + d3.format(".2s")(v)))
      .call(styleAxis);
    g.selectAll("rect")
      .data(rows)
      .join("rect")
      .attr("x", 0)
      .attr("y", (d) => y(d.id))
      .attr("width", (d) => x(d.asr_psf))
      .attr("height", y.bandwidth())
      .attr("fill", (d) => d.id === opts.selectedId ? HOME : RENT)
      .attr("opacity", (d) => d.id === opts.selectedId ? 1 : 0.72)
      .style("cursor", "pointer")
      .on("click", (event, d) => { if (opts.onSelect) opts.onSelect(d.id); })
      .on("mousemove", (event, d) => {
        if (!opts.tip) return;
        opts.tip(event, "<strong>" + d.name + "</strong><br>ASR ₹" + d3.format(",")(d.asr_psf) + "/ft²"
          + "<br>rank " + d.asr_rank + " of 24");
      })
      .on("mouseleave", () => { if (opts.tip) opts.tip(null); });
    g.selectAll("text.lab")
      .data(rows)
      .join("text")
      .attr("class", "lab")
      .attr("x", -6)
      .attr("y", (d) => y(d.id) + y.bandwidth() / 2)
      .attr("dy", "0.32em")
      .attr("text-anchor", "end")
      .attr("fill", INK)
      .attr("font-size", 9)
      .attr("font-family", FONT)
      .text((d) => d.id);
    g.selectAll("text.val")
      .data(rows)
      .join("text")
      .attr("class", "val")
      .attr("x", (d) => x(d.asr_psf) + 4)
      .attr("y", (d) => y(d.id) + y.bandwidth() / 2)
      .attr("dy", "0.32em")
      .attr("fill", MUTED)
      .attr("font-size", 9)
      .attr("font-family", FONT)
      .text((d) => d.id === opts.selectedId ? ("₹" + d3.format(",")(d.asr_psf)) : "");
  }

  function drawMxStock(opts) {
    const { el, width, height } = sizeOf("path-fan", 300);
    if (!el) return;
    const rows = (opts.rows || []).filter((r) => Number.isFinite(r.asr_psf) && Number.isFinite(r.households));
    if (!rows.length) { empty(el, "Census households missing."); return; }
    el.innerHTML = "";
    const pad = { t: 18, r: 16, b: 36, l: 48 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const x = d3.scaleLinear().domain(padExtent(d3.extent(rows, (d) => d.asr_psf))).range([0, innerW]);
    const y = d3.scaleLinear().domain(padExtent(d3.extent(rows, (d) => d.households))).range([innerH, 0]);
    const svg = d3.select(el).append("svg")
      .attr("viewBox", "0 0 " + width + " " + height)
      .attr("preserveAspectRatio", "xMidYMid meet");
    const g = svg.append("g").attr("transform", "translate(" + pad.l + "," + pad.t + ")");
    g.append("g").attr("transform", "translate(0," + innerH + ")")
      .call(d3.axisBottom(x).ticks(4).tickFormat((v) => "₹" + d3.format(".2s")(v)))
      .call(styleAxis);
    g.append("g").call(d3.axisLeft(y).ticks(4).tickFormat((v) => d3.format(".2s")(v)))
      .call(styleAxis);
    g.append("text").attr("x", innerW / 2).attr("y", innerH + 32)
      .attr("text-anchor", "middle").attr("fill", MUTED).attr("font-size", 11).attr("font-family", FONT)
      .text("ASR ₹ / sq ft (stamp-duty floor)");
    g.append("text").attr("transform", "rotate(-90)").attr("x", -innerH / 2).attr("y", -34)
      .attr("text-anchor", "middle").attr("fill", MUTED).attr("font-size", 11).attr("font-family", FONT)
      .text("Census 2011 households");
    g.selectAll("circle")
      .data(rows)
      .join("circle")
      .attr("cx", (d) => x(d.asr_psf))
      .attr("cy", (d) => y(d.households))
      .attr("r", (d) => d.id === opts.selectedId ? 7 : 4.5)
      .attr("fill", (d) => d.region === "Island City" ? HOME : RENT)
      .attr("opacity", (d) => d.id === opts.selectedId ? 1 : 0.8)
      .attr("stroke", (d) => d.id === opts.selectedId ? INK : "#fffdf8")
      .attr("stroke-width", (d) => d.id === opts.selectedId ? 1.4 : 0.8)
      .style("cursor", "pointer")
      .on("click", (event, d) => { if (opts.onSelect) opts.onSelect(d.id); })
      .on("mousemove", (event, d) => {
        if (!opts.tip) return;
        opts.tip(event, "<strong>" + d.name + "</strong><br>" + d.region
          + "<br>ASR ₹" + d3.format(",")(d.asr_psf) + "/ft²"
          + "<br>" + d3.format(",")(d.households) + " households (2011)");
      })
      .on("mouseleave", () => { if (opts.tip) opts.tip(null); });
  }

  function padExtent(ext) {
    const a = ext[0];
    const b = ext[1];
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
      const v = Number.isFinite(a) ? a : 1;
      return [v * 0.9, v * 1.1 || 1];
    }
    const p = (b - a) * 0.08;
    return [a - p, b + p];
  }

  function styleAxis(sel) {
    sel.selectAll("text").attr("font-family", FONT).attr("fill", MUTED).attr("font-size", 10);
    sel.selectAll("line, path").attr("stroke", "#e0d6c8");
    sel.select(".domain").attr("stroke", "#e0d6c8");
  }

  global.HousingPath = { drawWalk, drawFan, drawMxLadder, drawMxStock, project, yearly, alignedWalk };
})(window);
