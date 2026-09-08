/**
 * Choropleth for Virginia counties and BMC wards.
 * Camera is bounds-based (tight / medium / pair / wide) and can scrub with scroll.
 */
(function (global) {
  "use strict";

  const INK = "#2c2824";
  const COLORS = ["#7ea08c", "#d4c2a0", "#d0895c", "#b45c4e"];

  function sizeOf(id, minH) {
    const el = document.getElementById(id);
    if (!el) return { el: null, width: 0, height: 0 };
    const r = el.getBoundingClientRect();
    return { el, width: Math.max(280, r.width), height: Math.max(minH || 360, r.height) };
  }

  function isNum(v) {
    return v != null && v !== "" && Number.isFinite(+v);
  }

  function fmt(v, kind) {
    if (!isNum(v)) return "—";
    const n = +v;
    if (kind === "usd") return "$" + d3.format(",.0f")(n);
    if (kind === "ppsf") return "$" + d3.format(",.0f")(n) + "/ft²";
    if (kind === "rent") return "$" + d3.format(",.0f")(n) + "/mo";
    if (kind === "inr") return "₹" + d3.format(",.0f")(n) + "/ft²";
    if (kind === "inr_sqm") return "₹" + d3.format(",.0f")(n) + "/m²";
    if (kind === "inr_amt") {
      if (n >= 1e7) return "₹" + d3.format(".2f")(n / 1e7) + " Cr";
      if (n >= 1e5) return "₹" + d3.format(".1f")(n / 1e5) + " L";
      return "₹" + d3.format(",.0f")(n);
    }
    if (kind === "rank") return "#" + d3.format(".0f")(n);
    if (kind === "pct") return d3.format(".1f")(n) + "%";
    if (kind === "yoy") return (n > 0 ? "+" : "") + d3.format(".1f")(n) + "%";
    if (kind === "days") return d3.format(",.0f")(n) + " days";
    if (kind === "count") return d3.format(",.0f")(n);
    if (kind === "heat") return d3.format(".0f")(n);
    if (kind === "aqi") return d3.format(".0f")(n);
    if (kind === "pm") return d3.format(".0f")(n) + " µg/m³";
    if (kind === "temp") return d3.format(".1f")(n) + "°C";
    if (kind === "rain") return d3.format(".1f")(n) + " mm";
    if (kind === "km2") return d3.format(",.0f")(n) + " km²";
    if (kind === "years") return d3.format(".1f")(n) + " yr";
    return d3.format(",.0f")(n);
  }

  function spark(series, w, h) {
    const pts = (series || []).filter((d) => Number.isFinite(d.v));
    if (pts.length < 2) return "";
    w = w || 168;
    h = h || 36;
    const x = d3.scaleLinear().domain([0, pts.length - 1]).range([1.5, w - 1.5]);
    const y = d3.scaleLinear().domain(d3.extent(pts, (d) => d.v)).range([h - 2.5, 2.5]);
    const d = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(p.v).toFixed(1)).join(" ");
    const last = pts[pts.length - 1].v;
    const first = pts[0].v;
    const stroke = last >= first ? "#b45c4e" : "#7ea08c";
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.6"/></svg>`;
  }

  function colorScale(values, kind) {
    const domain = values.length ? d3.extent(values) : [0, 1];
    if (kind === "yoy") {
      const maxAbs = Math.max(Math.abs(domain[0] || 0), Math.abs(domain[1] || 0), 1);
      return d3.scaleLinear().domain([-maxAbs, 0, maxAbs])
        .range([COLORS[0], "#f6efe6", COLORS[3]]).clamp(true);
    }
    return d3.scaleLinear().domain([domain[0], (domain[0] + domain[1]) / 2, domain[1]])
      .range([COLORS[0], COLORS[2], COLORS[3]]).clamp(true);
  }

  function isDark() {
    return document.body.classList.contains("cine-page");
  }

  function paper() {
    return isDark() ? "#15120f" : "#f4ece2";
  }

  function hair() {
    return isDark() ? "#221e1a" : "#fffdf8";
  }

  function reduceMotion() {
    return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function duration(ms) {
    return reduceMotion() ? 0 : (ms == null ? 1600 : ms);
  }

  function layerOf(d) {
    return (d.properties && d.properties.layer) || (String(d.id) === "NM" ? "navi" : String(d.id) === "M3" ? "m3" : "bmc");
  }

  function fillOf(d, byId, metric, color) {
    const lyr = layerOf(d);
    if (lyr === "navi") return "#4f7a68";
    if (lyr === "m3") return "#6b5640";
    const row = byId.get(String(d.id));
    const v = row && row[metric];
    return isNum(v) ? color(+v) : "#2a2622";
  }

  function hotId(d, opts) {
    const id = String(d.id);
    const extra = opts.callouts || [];
    return id === String(opts.selectedId) ||
      (opts.pairId && id === String(opts.pairId)) ||
      (opts.compareId && id === String(opts.compareId)) ||
      extra.indexOf(id) >= 0;
  }

  function strokeOf(d, opts) {
    if (hotId(d, opts) && String(d.id) === String(opts.selectedId)) return isDark() ? "#f6efe6" : INK;
    if (hotId(d, opts)) return "#d4c2a0";
    return hair();
  }

  function strokeW(d, opts) {
    if (String(d.id) === String(opts.selectedId)) return 2.1;
    if (hotId(d, opts)) return 1.7;
    return 0.55;
  }

  function dimOp(d, opts, hoverId) {
    const hot = hotId(d, opts);
    const hover = hoverId && String(d.id) === String(hoverId);
    if (hover) return 1;
    if (opts.dim === "story") return hot ? 1 : 0.2;
    if (hoverId) return hot ? 1 : 0.2;
    return 1;
  }

  function shortName(s) {
    return String(s || "")
      .replace(/ County$/i, "")
      .replace(/ City$/i, "")
      .replace(/^[A-Z0-9/]+ · /, "");
  }

  function calloutValue(row, opts) {
    if (row.layer === "navi") return fmt(row.pop, "count");
    if (row.layer === "m3") return fmt(row.area_km2, "km2");
    return fmt(row[opts.metric], opts.kind);
  }

  function orderedFeatures(geo) {
    const rank = { m3: 0, navi: 1, bmc: 2 };
    return (geo.features || []).slice().sort((a, b) => (rank[layerOf(a)] || 0) - (rank[layerOf(b)] || 0));
  }

  function applyView(g, view) {
    g.attr("transform", "translate(" + view.tx + "," + view.ty + ")scale(" + view.k + ")");
  }

  function viewToZoom(view, width, height) {
    const k = view.k || 1;
    return [(width / 2 - view.tx) / k, (height / 2 - view.ty) / k, width / k];
  }

  function zoomToView(z, width, height) {
    const k = width / z[2];
    return { k: k, tx: width / 2 - k * z[0], ty: height / 2 - k * z[1] };
  }

  function viewFrom(path, geo, opts, width, height) {
    const identity = { k: 1, tx: 0, ty: 0 };
    const cam = opts.camera || "wide";
    if (cam === "metro" || cam === "wide") return identity;
    let feats;
    if (cam === "bmc") {
      feats = geo.features.filter((f) => layerOf(f) === "bmc");
    } else {
      const ids = [];
      if (opts.selectedId) ids.push(String(opts.selectedId));
      if (cam === "pair" && opts.pairId) ids.push(String(opts.pairId));
      feats = ids.map((id) => geo.features.find((f) => String(f.id) === id)).filter(Boolean);
    }
    if (!feats.length) return identity;
    let b = path.bounds(feats[0]);
    feats.slice(1).forEach((f) => {
      const bb = path.bounds(f);
      b = [
        [Math.min(b[0][0], bb[0][0]), Math.min(b[0][1], bb[0][1])],
        [Math.max(b[1][0], bb[1][0]), Math.max(b[1][1], bb[1][1])]
      ];
    });
    const bw = Math.max(6, b[1][0] - b[0][0]);
    const bh = Math.max(6, b[1][1] - b[0][1]);
    const pad = cam === "tight" ? 2.05 : cam === "medium" ? 3.4 : cam === "bmc" ? 1.22 : 1.28;
    const maxK = cam === "tight" ? 16 : cam === "medium" ? 7 : cam === "bmc" ? 3.2 : 4;
    let k = Math.min((width - 28) / (bw * pad), (height - 28) / (bh * pad));
    k = Math.max(1.02, Math.min(k, maxK));
    const cx = (b[0][0] + b[1][0]) / 2;
    const cy = (b[0][1] + b[1][1]) / 2;
    return { k: k, tx: width / 2 - k * cx, ty: height / 2 - k * cy };
  }

  function sameView(a, b) {
    if (!a || !b) return false;
    return Math.abs(a.k - b.k) < 0.02 && Math.abs(a.tx - b.tx) < 1 && Math.abs(a.ty - b.ty) < 1;
  }

  function placeCallouts(st) {
    if (!st || !st.callouts) return;
    const view = st.view || { k: 1, tx: 0, ty: 0 };
    st.callouts.selectAll("g.callout").attr("transform", (d) => {
      const x = d.c[0] * view.k + view.tx;
      const y = d.c[1] * view.k + view.ty - 20;
      return "translate(" + x + "," + y + ")";
    });
  }

  function drawCallouts(st, opts, byId, geo) {
    if (!st.callouts) return;
    const ids = [opts.selectedId, opts.pairId, opts.compareId].concat(opts.callouts || [])
      .filter((id, i, a) => id && a.indexOf(id) === i);
    const data = ids.map((id) => {
      const f = geo.features.find((x) => String(x.id) === String(id));
      const row = byId.get(String(id));
      if (!f || !row) return null;
      const c = st.path.centroid(f);
      if (!c || !Number.isFinite(c[0])) return null;
      return { id: String(id), c: c, name: shortName(row.label || row.name), value: calloutValue(row, opts) };
    }).filter(Boolean);

    const sel = st.callouts.selectAll("g.callout").data(data, (d) => d.id);
    const enter = sel.enter().append("g").attr("class", "callout");
    enter.append("rect").attr("class", "callout-bg")
      .attr("fill", isDark() ? "rgba(12,11,10,0.9)" : "rgba(255,253,248,0.92)")
      .attr("stroke", isDark() ? "#d4c2a0" : "#cfc3b3").attr("stroke-width", 1).attr("rx", 8);
    enter.append("text").attr("class", "callout-name")
      .attr("fill", isDark() ? "#d4c2a0" : "#7a7168").attr("font-size", 10)
      .attr("font-family", '"Source Sans 3","Segoe UI",sans-serif')
      .attr("x", 0).attr("y", 0);
    enter.append("text").attr("class", "callout-val")
      .attr("fill", isDark() ? "#f6efe6" : INK).attr("font-size", 15).attr("font-weight", 600)
      .attr("font-family", 'Fraunces,"Times New Roman",serif')
      .attr("x", 0).attr("y", 16);
    const all = enter.merge(sel);
    all.select(".callout-name").text((d) => d.name);
    all.select(".callout-val").text((d) => d.value);
    all.each(function () {
      const n = this.querySelector(".callout-name");
      const v = this.querySelector(".callout-val");
      const w = Math.max(n.getComputedTextLength(), v.getComputedTextLength()) + 18;
      d3.select(this).select(".callout-bg")
        .attr("x", -9).attr("y", -13).attr("width", w).attr("height", 36);
    });
    sel.exit().remove();
    placeCallouts(st);
  }

  function setInterp(st, to, width, height) {
    const from = st.view || { k: 1, tx: 0, ty: 0 };
    st.from = from;
    st.to = to;
    st.camInterp = d3.interpolateZoom(viewToZoom(from, width, height), viewToZoom(to, width, height));
  }

  function cameraScrub(t) {
    const el = document.getElementById("choropleth");
    const st = el && el._map;
    if (!st || !st.camInterp) return;
    const u = Math.max(0, Math.min(1, t));
    const view = zoomToView(st.camInterp(u), st.width, st.height);
    st.g.interrupt();
    applyView(st.g, view);
    st.view = view;
    placeCallouts(st);
  }

  function cameraFly(st, to, width, height, ms) {
    const dur = duration(ms);
    if (reduceMotion() || dur === 0 || sameView(st.view, to)) {
      applyView(st.g, to);
      st.view = to;
      setInterp(st, to, width, height);
      placeCallouts(st);
      return;
    }
    setInterp(st, to, width, height);
    const interp = st.camInterp;
    st.g.interrupt().transition().duration(dur).ease(d3.easeSinInOut)
      .tween("cam", () => (u) => {
        const view = zoomToView(interp(u), width, height);
        applyView(st.g, view);
        st.view = view;
        placeCallouts(st);
      });
  }

  function legend(opts, domain) {
    const el = document.getElementById("map-legend");
    if (!el) return;
    const lo = Number.isFinite(domain[0]) ? fmt(domain[0], opts.kind) : "—";
    const hi = Number.isFinite(domain[1]) ? fmt(domain[1], opts.kind) : "—";
    const rampClass = opts.kind === "yoy" ? "ramp ramp-yoy" : "ramp";
    el.innerHTML =
      `<span class="${rampClass}"><i></i></span><span>${lo}</span><span>${hi}</span>` +
      `<span>Scroll zooms · click a shape</span>`;
  }

  function bindUnit(sel, opts, byId, g) {
    sel
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        if (opts.onSelect) opts.onSelect(String(d.id));
      })
      .on("mousemove", (event, d) => {
        g.selectAll("path.unit").attr("opacity", (p) => dimOp(p, opts, d.id));
        const row = byId.get(String(d.id));
        if (!row || !opts.tip) return;
        const v = row[opts.metric];
        const line = isNum(v)
          ? opts.metricLabel + ": " + fmt(v, opts.kind)
          : (row.note || row.region || "");
        opts.tip(event, `<strong>${row.label || row.name}</strong><br>${line}`);
      })
      .on("mouseleave", () => {
        g.selectAll("path.unit").attr("opacity", (p) => dimOp(p, opts, null));
        if (opts.tip) opts.tip(null);
      });
  }

  function paint(st, opts, byId, geo, color, dur) {
    const feats = orderedFeatures(geo);
    const units = st.g.selectAll("path.unit").data(feats, (d) => d.id);
    units.join(
      (enter) => enter.append("path").attr("class", "unit").attr("d", st.path),
      (update) => update,
      (exit) => exit.remove()
    );
    const all = st.g.selectAll("path.unit");
    all.transition().duration(dur).ease(d3.easeSinInOut)
      .attr("fill", (d) => fillOf(d, byId, opts.metric, color))
      .attr("fill-opacity", (d) => layerOf(d) === "m3" ? 0.42 : 1)
      .attr("stroke", (d) => strokeOf(d, opts))
      .attr("stroke-width", (d) => strokeW(d, opts))
      .attr("stroke-dasharray", (d) => layerOf(d) === "m3" ? "6 5" : null)
      .attr("opacity", (d) => dimOp(d, opts, null));
    bindUnit(all, opts, byId, st.g);
    drawCallouts(st, opts, byId, geo);
  }

  function aim(st, opts, geo, width, height) {
    const to = viewFrom(st.path, geo, opts, width, height);
    const key = [opts.camera, opts.selectedId, opts.pairId || "", (opts.callouts || []).join(",")].join("|");
    if (st.targetKey !== key) {
      setInterp(st, to, width, height);
      st.targetKey = key;
    }
    if (opts.fly) cameraFly(st, to, width, height, 1850);
    else cameraScrub(opts.camT != null ? opts.camT : 1);
  }

  function draw(opts) {
    const { el, width, height } = sizeOf("choropleth", 420);
    if (!el) return;
    const geo = opts.geo;
    const rows = opts.rows || [];
    const key = opts.idKey;
    const byId = new Map(rows.map((r) => [String(r[key]), r]));
    const values = rows.map((r) => r[opts.metric]).filter(isNum).map(Number);
    const domain = values.length ? d3.extent(values) : [0, 1];
    const color = colorScale(values, opts.kind);
    const dur = duration(opts.wipe ? 0 : 860);
    const st = el._map;
    const sizeOk = st && Math.abs(st.width - width) < 10 && Math.abs(st.height - height) < 10;
    const reuse = st && st.place === opts.place && st.svg && el.querySelector("svg") && sizeOk && !opts.force;

    legend(opts, domain);

    if (reuse) {
      if (st.clip) st.clip.interrupt().attr("opacity", 1);
      paint(st, opts, byId, geo, color, dur);
      aim(st, opts, geo, width, height);
      st.metric = opts.metric;
      st.selectedId = opts.selectedId;
      st.compareId = opts.compareId;
      st.pairId = opts.pairId;
      st.camera = opts.camera;
      st.byId = byId;
      return;
    }

    el.innerHTML = "";
    const svg = d3.select(el).append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
    const clipId = "map-clip-" + Math.round(width) + "-" + Math.round(height);
    svg.append("defs").append("clipPath").attr("id", clipId)
      .append("rect").attr("width", width).attr("height", height);
    svg.append("rect").attr("width", width).attr("height", height).attr("fill", paper());

    const projection = d3.geoMercator();
    const path = d3.geoPath(projection);
    projection.fitExtent([[12, 12], [width - 12, height - 12]], geo);

    const clip = svg.append("g").attr("class", "map-clip").attr("clip-path", "url(#" + clipId + ")");
    const g = clip.append("g").attr("class", "units");
    const callouts = svg.append("g").attr("class", "map-callouts");

    const units = g.selectAll("path.unit")
      .data(orderedFeatures(geo), (d) => d.id)
      .join("path")
      .attr("class", "unit")
      .attr("d", path)
      .attr("fill", (d) => fillOf(d, byId, opts.metric, color))
      .attr("fill-opacity", (d) => layerOf(d) === "m3" ? 0.42 : 1)
      .attr("stroke", (d) => strokeOf(d, opts))
      .attr("stroke-width", (d) => strokeW(d, opts))
      .attr("stroke-dasharray", (d) => layerOf(d) === "m3" ? "6 5" : null)
      .attr("opacity", (d) => dimOp(d, opts, null));
    bindUnit(units, opts, byId, g);

    if (!reduceMotion() && opts.wipe) {
      clip.attr("opacity", 0).transition().duration(980).ease(d3.easeSinInOut).attr("opacity", 1);
    }

    el._map = {
      place: opts.place,
      svg: svg,
      clip: clip,
      g: g,
      callouts: callouts,
      path: path,
      width: width,
      height: height,
      metric: opts.metric,
      selectedId: opts.selectedId,
      compareId: opts.compareId,
      pairId: opts.pairId,
      camera: opts.camera,
      byId: byId,
      view: { k: 1, tx: 0, ty: 0 }
    };
    drawCallouts(el._map, opts, byId, geo);
    aim(el._map, opts, geo, width, height);
  }

  global.HousingMaps = { draw, fmt, spark, COLORS, cameraScrub };
})(window);
