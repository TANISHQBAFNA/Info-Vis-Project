/**
 * Choropleth for Virginia counties and BMC wards.
 */
(function (global) {
  "use strict";

  const FONT = '"Source Sans 3", "Segoe UI", sans-serif';
  const INK = "#2c2824";
  const MUTED = "#5c564f";
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
    if (kind === "usd") return n >= 10000 ? "$" + d3.format(",.0f")(n) : "$" + d3.format(",.0f")(n);
    if (kind === "ppsf") return "$" + d3.format(",.0f")(n) + "/ft²";
    if (kind === "rent") return "$" + d3.format(",.0f")(n) + "/mo";
    if (kind === "inr") return "₹" + d3.format(",.0f")(n) + "/ft²";
    return d3.format(",.0f")(n);
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
    const byId = new Map(rows.map(r => [String(r[key]), r]));

    const values = rows.map(r => +r[metric]).filter(Number.isFinite);
    const domain = values.length ? d3.extent(values) : [0, 1];
    const color = d3.scaleLinear().domain([domain[0], (domain[0] + domain[1]) / 2, domain[1]])
      .range([COLORS[0], COLORS[2], COLORS[3]])
      .clamp(true);

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
      .attr("fill", d => {
        const id = String(d.id);
        const row = byId.get(id);
        const v = row ? +row[metric] : NaN;
        return Number.isFinite(v) ? color(v) : "#e0d6c8";
      })
      .attr("stroke", d => String(d.id) === String(selectedId) ? INK : "#fffdf8")
      .attr("stroke-width", d => String(d.id) === String(selectedId) ? 1.8 : 0.6)
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
      legend.innerHTML =
        `<span class="ramp"><i></i></span><span>${lo}</span><span>${hi}</span>` +
        `<span>Click a shape</span>`;
    }
  }

  global.HousingMaps = { draw, fmt, COLORS };
})(window);
