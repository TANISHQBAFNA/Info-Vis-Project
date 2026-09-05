/**
 * Choropleth for Virginia counties and BMC wards.
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

  function draw(opts) {
    const { el, width, height } = sizeOf("choropleth", 420);
    if (!el) return;
    el.innerHTML = "";
    const geo = opts.geo;
    const rows = opts.rows || [];
    const key = opts.idKey;
    const metric = opts.metric;
    const selectedId = opts.selectedId;
    const byId = new Map(rows.map((r) => [String(r[key]), r]));

    const values = rows.map((r) => +r[metric]).filter(Number.isFinite);
    const domain = values.length ? d3.extent(values) : [0, 1];
    const color = colorScale(values, opts.kind);

    const svg = d3.select(el).append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
    svg.append("rect").attr("width", width).attr("height", height).attr("fill", "#f4ece2");

    const projection = d3.geoMercator();
    const path = d3.geoPath(projection);
    projection.fitExtent([[12, 12], [width - 12, height - 36]], geo);

    svg.append("g").selectAll("path.unit")
      .data(geo.features)
      .join("path")
      .attr("class", "unit")
      .attr("d", path)
      .attr("fill", (d) => {
        const row = byId.get(String(d.id));
        const v = row ? +row[metric] : NaN;
        return Number.isFinite(v) ? color(v) : "#e0d6c8";
      })
      .attr("stroke", (d) => String(d.id) === String(selectedId) ? INK : "#fffdf8")
      .attr("stroke-width", (d) => String(d.id) === String(selectedId) ? 1.8 : 0.6)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        if (opts.onSelect) opts.onSelect(String(d.id));
      })
      .on("mousemove", (event, d) => {
        const row = byId.get(String(d.id));
        if (!row || !opts.tip) return;
        opts.tip(event, `<strong>${row.label || row.name}</strong><br>${opts.metricLabel}: ${fmt(row[metric], opts.kind)}`);
      })
      .on("mouseleave", () => { if (opts.tip) opts.tip(null); });

    const legend = document.getElementById("map-legend");
    if (legend) {
      const lo = Number.isFinite(domain[0]) ? fmt(domain[0], opts.kind) : "—";
      const hi = Number.isFinite(domain[1]) ? fmt(domain[1], opts.kind) : "—";
      const rampClass = opts.kind === "yoy" ? "ramp ramp-yoy" : "ramp";
      legend.innerHTML =
        `<span class="${rampClass}"><i></i></span><span>${lo}</span><span>${hi}</span>` +
        `<span>Click a shape</span>`;
    }
  }

  global.HousingMaps = { draw, fmt, spark, COLORS };
})(window);
