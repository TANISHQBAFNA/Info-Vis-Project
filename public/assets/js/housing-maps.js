/**
 * Choropleth for Virginia counties and BMC wards.
 * Reuses the SVG on metric/selection change so fills tween instead of wiping.
 */
(function (global) {
  "use strict";

  const INK = "#2c2824";
  const COLORS = ["#7d9a86", "#cbb688", "#c48962", "#9c5a4e"];

  function sizeOf(id, minH) {
    const el = document.getElementById(id);
    if (!el) return { el: null, width: 0, height: 0 };
    const r = el.getBoundingClientRect();
    return { el, width: Math.max(280, r.width), height: Math.max(minH || 360, r.height) };
  }

  function fmt(v, kind) {
    if (!Number.isFinite(+v)) return "—";
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
    const stroke = last >= first ? "#9c5a4e" : "#7d9a86";
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.6"/></svg>`;
  }

  function colorScale(values, kind) {
    const domain = values.length ? d3.extent(values) : [0, 1];
    if (kind === "yoy") {
      const maxAbs = Math.max(Math.abs(domain[0] || 0), Math.abs(domain[1] || 0), 1);
      return d3.scaleLinear().domain([-maxAbs, 0, maxAbs])
        .range([COLORS[0], "#f4ece2", COLORS[3]]).clamp(true);
    }
    if (kind === "aqi") {
      return d3.scaleLinear().domain([0, 50, 100, 150, 200])
        .range(["#7d9a86", "#cbb688", "#c48962", "#9c5a4e", "#6b3a34"]).clamp(true);
    }
    return d3.scaleLinear().domain([domain[0], (domain[0] + domain[1]) / 2, domain[1]])
      .range([COLORS[0], COLORS[2], COLORS[3]]).clamp(true);
  }

  function reduceMotion() {
    return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function duration(ms) {
    return reduceMotion() ? 0 : (ms == null ? 720 : ms);
  }

  function fillOf(d, byId, metric, color) {
    const row = byId.get(String(d.id));
    const v = row ? +row[metric] : NaN;
    return Number.isFinite(v) ? color(v) : "#e0d6c8";
  }

  function strokeOf(d, selectedId, compareId) {
    const id = String(d.id);
    if (id === String(selectedId)) return INK;
    if (compareId && id === String(compareId)) return "#8f5b4a";
    return "#fffdf8";
  }

  function strokeW(d, selectedId, compareId) {
    const id = String(d.id);
    if (id === String(selectedId)) return 1.9;
    if (compareId && id === String(compareId)) return 1.6;
    return 0.6;
  }

  function spotlight(g, hoverId, selectedId, compareId) {
    if (!g) return;
    g.selectAll("path.unit").attr("opacity", (d) => {
      const id = String(d.id);
      if (!hoverId) return 1;
      if (id === String(hoverId) || id === String(selectedId) || (compareId && id === String(compareId))) return 1;
      return 0.2;
    });
  }

  function cameraTo(g, path, geo, opts, width, height) {
    const dur = duration(opts.camera === "wide" ? 900 : 800);
    const feat = geo.features.find((f) => String(f.id) === String(opts.selectedId));
    if (!feat || opts.camera === "wide") {
      g.transition().duration(dur).attr("transform", "translate(0,0)scale(1)");
      return;
    }
    const c = path.centroid(feat);
    if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) {
      g.transition().duration(dur).attr("transform", "translate(0,0)scale(1)");
      return;
    }
    const k = 1.16;
    const tx = width / 2 - k * c[0];
    const ty = (height - 28) / 2 - k * c[1];
    g.transition().duration(dur).attr("transform", "translate(" + tx + "," + ty + ")scale(" + k + ")");
  }

  function legend(opts, domain) {
    const el = document.getElementById("map-legend");
    if (!el) return;
    const lo = Number.isFinite(domain[0]) ? fmt(domain[0], opts.kind) : "—";
    const hi = Number.isFinite(domain[1]) ? fmt(domain[1], opts.kind) : "—";
    const rampClass = opts.kind === "yoy" ? "ramp ramp-yoy" : "ramp";
    el.innerHTML =
      `<span class="${rampClass}"><i></i></span><span>${lo}</span><span>${hi}</span>` +
      `<span>Hover to spotlight · click to lock</span>`;
  }

  function bindUnit(sel, opts, byId, selectedId, compareId, g) {
    sel
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        if (opts.onSelect) opts.onSelect(String(d.id));
      })
      .on("mousemove", (event, d) => {
        spotlight(g, d.id, selectedId, compareId);
        const row = byId.get(String(d.id));
        if (!row || !opts.tip) return;
        opts.tip(event, `<strong>${row.label || row.name}</strong><br>${opts.metricLabel}: ${fmt(row[opts.metric], opts.kind)}`);
      })
      .on("mouseleave", () => {
        spotlight(g, null, selectedId, compareId);
        if (opts.tip) opts.tip(null);
      });
  }

  function draw(opts) {
    const { el, width, height } = sizeOf("choropleth", 420);
    if (!el) return;
    const geo = opts.geo;
    const rows = opts.rows || [];
    const key = opts.idKey;
    const metric = opts.metric;
    const selectedId = opts.selectedId;
    const compareId = opts.compareId;
    const byId = new Map(rows.map((r) => [String(r[key]), r]));
    const values = rows.map((r) => +r[metric]).filter(Number.isFinite);
    const domain = values.length ? d3.extent(values) : [0, 1];
    const color = colorScale(values, opts.kind);
    const dur = duration(opts.wipe ? 0 : 720);
    const st = el._map;
    const sizeOk = st && Math.abs(st.width - width) < 10 && Math.abs(st.height - height) < 10;
    const reuse = st && st.place === opts.place && st.svg && el.querySelector("svg") && sizeOk && !opts.force;

    legend(opts, domain);

    if (reuse) {
      const g = st.g;
      const units = g.selectAll("path.unit").data(geo.features, (d) => d.id);
      units.join(
        (enter) => enter.append("path").attr("class", "unit").attr("d", st.path),
        (update) => update,
        (exit) => exit.remove()
      );
      const all = g.selectAll("path.unit");
      all.transition().duration(dur)
        .attr("fill", (d) => fillOf(d, byId, metric, color))
        .attr("stroke", (d) => strokeOf(d, selectedId, compareId))
        .attr("stroke-width", (d) => strokeW(d, selectedId, compareId));
      bindUnit(all, opts, byId, selectedId, compareId, g);
      spotlight(g, null, selectedId, compareId);
      if (opts.camera !== st.camera || String(selectedId) !== String(st.selectedId)) {
        cameraTo(g, st.path, geo, opts, width, height);
      }
      st.metric = metric;
      st.selectedId = selectedId;
      st.compareId = compareId;
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
    svg.append("rect").attr("width", width).attr("height", height).attr("fill", "#f4ece2");

    const projection = d3.geoMercator();
    const path = d3.geoPath(projection);
    projection.fitExtent([[12, 12], [width - 12, height - 12]], geo);

    const clip = svg.append("g").attr("clip-path", "url(#" + clipId + ")");
    const g = clip.append("g").attr("class", "units");

    const units = g.selectAll("path.unit")
      .data(geo.features, (d) => d.id)
      .join("path")
      .attr("class", "unit")
      .attr("d", path)
      .attr("fill", (d) => fillOf(d, byId, metric, color))
      .attr("stroke", (d) => strokeOf(d, selectedId, compareId))
      .attr("stroke-width", (d) => strokeW(d, selectedId, compareId));

    bindUnit(units, opts, byId, selectedId, compareId, g);

    if (!reduceMotion() && opts.wipe) {
      g.attr("opacity", 0).transition().duration(640).attr("opacity", 1);
    }

    el._map = {
      place: opts.place,
      svg,
      g,
      path,
      width,
      height,
      metric,
      selectedId,
      compareId,
      camera: opts.camera,
      byId
    };
    cameraTo(g, path, geo, opts, width, height);
  }

  global.HousingMaps = { draw, fmt, spark, COLORS };
})(window);
