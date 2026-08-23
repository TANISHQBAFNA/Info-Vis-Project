/**
 * Mumbai live charts — readable lon/lat bubbles, 24h AQI heatmap,
 * rain ridgelines, 48h traces. Live Open-Meteo only.
 */
(function (global) {
  "use strict";

  const FONT = '"Source Sans 3", "Segoe UI", sans-serif';
  const INK = "#2c2824";
  const MUTED = "#5c564f";
  const MXViz = {};

  function sizeOf(id, minH) {
    const el = document.getElementById(id);
    if (!el) return { el: null, width: 0, height: 0 };
    const r = el.getBoundingClientRect();
    return {
      el,
      width: Math.max(280, r.width),
      height: Math.max(minH || 240, r.height)
    };
  }

  function empty(el, msg) {
    if (!el) return;
    el.innerHTML = `<div class="chart-empty">${msg}</div>`;
  }

  function tip(event, html) {
    if (!global.MumbaiDash) return;
    MumbaiDash.tip(html, event.clientX, event.clientY);
  }

  function inkText(sel, size) {
    return sel.attr("fill", INK)
      .attr("font-size", size)
      .attr("font-family", FONT);
  }

  function mutedText(sel, size) {
    return sel.attr("fill", MUTED)
      .attr("font-size", size)
      .attr("font-family", FONT);
  }

  function haloLabel(sel, size) {
    return sel.attr("font-size", size)
      .attr("font-family", FONT)
      .attr("font-weight", 600)
      .attr("paint-order", "stroke")
      .attr("stroke", "#fffdf8")
      .attr("stroke-width", 3)
      .attr("stroke-linejoin", "round")
      .attr("fill", INK);
  }

  MXViz.drawMap = function (wards, sel) {
    const { el, width, height } = sizeOf("ward-map", 400);
    if (!el) return;
    el.innerHTML = "";
    if (!wards.length) { empty(el, "No ward centroids"); return; }

    const margin = { top: 16, right: 16, bottom: 20, left: 36 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const lon = d3.extent(wards, d => d.lon);
    const lat = d3.extent(wards, d => d.lat);
    const x = d3.scaleLinear().domain([lon[0] - 0.05, lon[1] + 0.03]).range([0, innerW]);
    const y = d3.scaleLinear().domain([lat[0] - 0.02, lat[1] + 0.02]).range([innerH, 0]);
    const maxRain = d3.max(wards, d => d.live.rainToday) || 0;
    const r = d3.scaleSqrt().domain([0, Math.max(2, maxRain)]).range([11, 28]);
    const selectedId = sel && sel.id;
    const color = MumbaiDash.aqiColor;

    const svg = d3.select(el).append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
    svg.append("rect").attr("width", width).attr("height", height).attr("fill", "#f4ece2");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const seaW = Math.max(44, x(lon[0]) + 10);
    g.append("rect")
      .attr("x", -margin.left)
      .attr("y", -margin.top)
      .attr("width", seaW + margin.left)
      .attr("height", height)
      .attr("fill", "#c5d6e2");
    g.append("text")
      .attr("x", -margin.left + 16)
      .attr("y", innerH / 2)
      .attr("fill", "#3d5a6b")
      .attr("font-size", 12)
      .attr("font-weight", 600)
      .attr("font-family", FONT)
      .attr("letter-spacing", "0.12em")
      .attr("transform", `rotate(-90,${-margin.left + 16},${innerH / 2})`)
      .text("Arabian Sea");

    g.append("text")
      .attr("x", innerW - 8)
      .attr("y", 14)
      .attr("text-anchor", "end")
      .attr("fill", MUTED)
      .attr("font-size", 11)
      .attr("font-family", FONT)
      .text("N ↑");

    const nodes = g.selectAll("g.ward").data(wards).join("g").attr("class", "ward")
      .attr("transform", d => `translate(${x(d.lon)},${y(d.lat)})`)
      .style("cursor", "pointer")
      .on("click", (event, d) => MumbaiDash.selectWard(d.id))
      .on("mousemove", (event, d) => {
        tip(event, `<strong>${d.ward}</strong><br>AQI ${fmt(d.live.now.aqi, 0)} · ${MumbaiDash.aqiLabel(d.live.now.aqi)}<br>Rain today ${fmt(d.live.rainToday, 1)} mm`);
      })
      .on("mouseleave", () => MumbaiDash.tip(null));

    nodes.append("circle")
      .attr("r", d => r(d.live.rainToday || 0))
      .attr("fill", d => color(d.live.now.aqi))
      .attr("fill-opacity", 0.92)
      .attr("stroke", d => d.id === selectedId ? INK : "#fffdf8")
      .attr("stroke-width", d => d.id === selectedId ? 3 : 1.5);

    nodes.append("text")
      .attr("y", d => r(d.live.rainToday || 0) + 13)
      .attr("text-anchor", "middle")
      .call(sel => haloLabel(sel, 11))
      .text(d => d.short.replace(" Ward", ""));

    nodes.filter(d => d.id === selectedId)
      .append("text")
      .attr("y", 4)
      .attr("text-anchor", "middle")
      .attr("font-size", 11)
      .attr("font-weight", 700)
      .attr("font-family", FONT)
      .attr("fill", "#fffdf8")
      .attr("paint-order", "stroke")
      .attr("stroke", "rgba(44,40,36,0.35)")
      .attr("stroke-width", 2)
      .text(d => fmt(d.live.now.aqi, 0));

    const legend = document.getElementById("map-legend");
    if (legend) {
      const bands = [
        { v: 25, name: "Good" },
        { v: 75, name: "Moderate" },
        { v: 125, name: "USG" },
        { v: 175, name: "Unhealthy" },
        { v: 250, name: "Very unhealthy" }
      ];
      legend.innerHTML = bands.map(b =>
        `<span><i style="background:${color(b.v)}"></i>${b.name}</span>`
      ).join("") + `<span>Circle size = rain today (max ${fmt(maxRain, 1)} mm)</span>`;
    }
  };

  MXViz.drawHeat = function (wards, sel) {
    const { el, width } = sizeOf("aqi-heat", 560);
    if (!el) return;
    el.innerHTML = "";
    const ranked = wards.slice().sort((a, b) => (b.live.now.aqi || -1) - (a.live.now.aqi || -1));
    const hours = (ranked.find(w => w.live.hours24.length) || {}).live?.hours24 || [];
    if (!hours.length) { empty(el, "AQI hours not in yet — feed down or still loading"); return; }

    const rowH = 22;
    const margin = { top: 28, right: 52, bottom: 28, left: 92 };
    const height = margin.top + margin.bottom + ranked.length * rowH;
    el.style.minHeight = height + "px";
    const innerW = width - margin.left - margin.right;
    const innerH = ranked.length * rowH;
    const keys = hours.map(h => h.t);
    const x = d3.scaleBand().domain(keys).range([0, innerW]).paddingInner(0.12).paddingOuter(0.04);
    const y = d3.scaleBand().domain(ranked.map(w => w.id)).range([0, innerH]).paddingInner(0.18);
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const selectedId = sel && sel.id;
    const byId = new Map(ranked.map(w => [w.id, w]));

    const cells = [];
    ranked.forEach(w => {
      const map = new Map(w.live.hours24.map(h => [h.t, h]));
      keys.forEach(t => {
        const h = map.get(t);
        cells.push({ id: w.id, t, aqi: h ? h.aqi : NaN, date: h && h.date });
      });
    });

    g.selectAll("rect.cell").data(cells).join("rect").attr("class", "cell")
      .attr("x", d => x(d.t))
      .attr("y", d => y(d.id))
      .attr("width", Math.max(2, x.bandwidth()))
      .attr("height", Math.max(10, y.bandwidth()))
      .attr("rx", 2)
      .attr("fill", d => MumbaiDash.aqiColor(d.aqi))
      .attr("stroke", d => d.id === selectedId ? INK : "none")
      .attr("stroke-width", 1.4)
      .style("cursor", "pointer")
      .on("click", (event, d) => MumbaiDash.selectWard(d.id))
      .on("mousemove", (event, d) => {
        const w = byId.get(d.id);
        const when = d.date ? d3.timeFormat("%d %b %H:%M")(d.date) : d.t;
        tip(event, `<strong>${w ? w.ward : d.id}</strong><br>${when}<br>AQI ${fmt(d.aqi, 0)} · ${MumbaiDash.aqiLabel(d.aqi)}`);
      })
      .on("mouseleave", () => MumbaiDash.tip(null));

    g.selectAll("text.row").data(ranked).join("text").attr("class", "row")
      .attr("x", -8)
      .attr("y", d => (y(d.id) || 0) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end")
      .attr("font-weight", d => d.id === selectedId ? 700 : 500)
      .attr("fill", INK)
      .attr("font-size", 12)
      .attr("font-family", FONT)
      .style("cursor", "pointer")
      .text(d => d.short)
      .on("click", (event, d) => MumbaiDash.selectWard(d.id));

    g.selectAll("text.now").data(ranked).join("text").attr("class", "now")
      .attr("x", innerW + 8)
      .attr("y", d => (y(d.id) || 0) + y.bandwidth() / 2 + 4)
      .attr("font-size", 12)
      .attr("font-weight", 700)
      .attr("font-family", FONT)
      .attr("fill", d => MumbaiDash.aqiColor(d.live.now.aqi))
      .text(d => fmt(d.live.now.aqi, 0));

    const tickKeys = keys.filter((_, i) => i % 3 === 0);
    g.append("g").attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickValues(tickKeys).tickFormat(hourLabel).tickSize(0))
      .call(axis => axis.select(".domain").remove())
      .call(axis => mutedText(axis.selectAll("text"), 11));
    g.append("g")
      .call(d3.axisTop(x).tickValues(tickKeys).tickFormat(hourLabel).tickSize(0))
      .call(axis => axis.select(".domain").remove())
      .call(axis => mutedText(axis.selectAll("text"), 11));
  };

  MXViz.drawRidge = function (wards, sel) {
    const { el, width, height } = sizeOf("rain-ridge", 300);
    if (!el) return;
    el.innerHTML = "";
    const wet = wards.slice()
      .map(w => ({ w, mm: d3.sum(w.live.rain14, d => d.rain) }))
      .sort((a, b) => b.mm - a.mm)
      .slice(0, 8)
      .map(d => d.w);
    const days = (wet[0] && wet[0].live.rain14) || [];
    if (!wet.length || !days.length) {
      empty(el, "Daily rain not in yet — feed down or still loading");
      return;
    }

    const margin = { top: 8, right: 56, bottom: 28, left: 92 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const parsed = days.map(d => ({ t: parseDay(d.day), rain: d.rain }));
    const x = d3.scaleTime().domain(d3.extent(parsed, d => d.t)).range([0, innerW]);
    const y = d3.scaleBand().domain(wet.map(w => w.id)).range([0, innerH]).paddingInner(0.22);
    const peak = d3.max(wet, w => d3.max(w.live.rain14, d => d.rain)) || 1;
    const yh = d3.scaleLinear().domain([0, peak]).range([0, y.bandwidth()]);
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const selectedId = sel && sel.id;
    const area = d3.area()
      .x(d => x(d.t))
      .y0(y.bandwidth())
      .y1(d => y.bandwidth() - yh(d.rain))
      .curve(d3.curveMonotoneX);

    wet.forEach(w => {
      const series = w.live.rain14.map(d => ({ t: parseDay(d.day), rain: d.rain }));
      const total = d3.sum(w.live.rain14, d => d.rain);
      const gg = g.append("g").attr("transform", `translate(0,${y(w.id)})`)
        .style("cursor", "pointer")
        .on("click", () => MumbaiDash.selectWard(w.id))
        .on("mousemove", (event) => {
          tip(event, `<strong>${w.ward}</strong><br>14-day rain ${fmt(total, 0)} mm`);
        })
        .on("mouseleave", () => MumbaiDash.tip(null));
      gg.append("line")
        .attr("x1", 0).attr("x2", innerW)
        .attr("y1", y.bandwidth()).attr("y2", y.bandwidth())
        .attr("stroke", "#e0d6c8");
      gg.append("path").datum(series).attr("d", area)
        .attr("fill", w.id === selectedId ? "#8f5b4a" : "#c48962")
        .attr("fill-opacity", w.id === selectedId ? 0.72 : 0.5)
        .attr("stroke", "#6e3f32")
        .attr("stroke-width", w.id === selectedId ? 1.8 : 1.2);
      gg.append("text")
        .attr("x", innerW + 8)
        .attr("y", y.bandwidth() - 4)
        .attr("font-size", 12)
        .attr("font-weight", 600)
        .attr("font-family", FONT)
        .attr("fill", INK)
        .text(fmt(total, 0) + " mm");
    });

    const byId = new Map(wet.map(w => [w.id, w]));
    g.append("g").call(d3.axisLeft(y).tickFormat(id => (byId.get(id) || {}).short || id).tickSize(0))
      .call(axis => axis.select(".domain").remove())
      .call(axis => inkText(axis.selectAll("text"), 12).attr("font-weight", 500));
    g.append("g").attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickSize(0).tickFormat(d3.timeFormat("%d %b")))
      .call(axis => axis.select(".domain").remove())
      .call(axis => mutedText(axis.selectAll("text"), 11));
  };

  MXViz.drawTraces = function (wards, sel) {
    const { el, width, height } = sizeOf("ward-traces", 300);
    if (!el) return;
    el.innerHTML = "";
    const title = document.getElementById("trace-title");
    if (title) title.textContent = sel ? sel.short + ", last 48 hours" : "This ward, last 48 hours";
    const hours = (sel && sel.live.hours48) || [];
    if (!hours.length) { empty(el, "Pick a ward after the live feed lands"); return; }

    const series = [
      { key: "PM2.5", unit: "µg/m³", get: d => d.pm25, color: "#8f5b4a", bars: false },
      { key: "NO₂", unit: "µg/m³", get: d => d.no2, color: "#6d5a80", bars: false },
      { key: "Ozone", unit: "µg/m³", get: d => d.o3, color: "#4f7a5c", bars: false },
      { key: "Rain", unit: "mm", get: d => d.rain, color: "#3d6a88", bars: true }
    ];
    const margin = { top: 2, right: 54, bottom: 22, left: 44 };
    const gap = 10;
    const slot = (height - margin.bottom - gap * 3) / 4;
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    const x = d3.scaleTime().domain(d3.extent(hours, d => d.date)).range([margin.left, width - margin.right]);

    series.forEach((s, i) => {
      const y0 = i * (slot + gap);
      const ymax = d3.max(hours, s.get);
      const y = d3.scaleLinear().domain([0, Number.isFinite(ymax) && ymax > 0 ? ymax : 1]).nice()
        .range([y0 + slot - 6, y0 + 18]);
      const g = svg.append("g");
      g.append("rect")
        .attr("x", margin.left)
        .attr("y", y0 + 14)
        .attr("width", width - margin.left - margin.right)
        .attr("height", slot - 20)
        .attr("fill", "#f7f1e8");
      g.append("text").attr("x", margin.left).attr("y", y0 + 12)
        .attr("fill", s.color).attr("font-size", 12).attr("font-weight", 700)
        .attr("font-family", FONT)
        .text(`${s.key} (${s.unit})`);
      g.append("g")
        .call(d3.axisLeft(y).ticks(2).tickSize(-(width - margin.left - margin.right)).tickFormat(v => v >= 10 ? d3.format(".0f")(v) : d3.format(".1f")(v)))
        .attr("transform", `translate(${margin.left},0)`)
        .call(axis => axis.select(".domain").remove())
        .call(axis => axis.selectAll("line").attr("stroke", "#e6ddd0"))
        .call(axis => mutedText(axis.selectAll("text"), 10));

      const last = hours[hours.length - 1];
      const lastV = last ? s.get(last) : NaN;
      g.append("text")
        .attr("x", width - margin.right + 8)
        .attr("y", y(Number.isFinite(lastV) ? lastV : 0) + 4)
        .attr("fill", s.color)
        .attr("font-size", 12)
        .attr("font-weight", 700)
        .attr("font-family", FONT)
        .text(fmt(lastV, s.bars ? 1 : 0));

      if (s.bars) {
        const bw = Math.max(2, (width - margin.left - margin.right) / Math.max(hours.length, 1) - 0.6);
        g.selectAll("rect.bar").data(hours).join("rect").attr("class", "bar")
          .attr("x", d => x(d.date) - bw / 2)
          .attr("y", d => y(s.get(d) || 0))
          .attr("width", bw)
          .attr("height", d => Math.max(0, y(0) - y(s.get(d) || 0)))
          .attr("fill", s.color)
          .attr("opacity", 0.9);
      } else {
        const area = d3.area()
          .defined(d => Number.isFinite(s.get(d)))
          .x(d => x(d.date))
          .y0(y(0))
          .y1(d => y(s.get(d)))
          .curve(d3.curveMonotoneX);
        const line = d3.line()
          .defined(d => Number.isFinite(s.get(d)))
          .x(d => x(d.date))
          .y(d => y(s.get(d)))
          .curve(d3.curveMonotoneX);
        g.append("path").datum(hours).attr("d", area).attr("fill", s.color).attr("opacity", 0.18);
        g.append("path").datum(hours).attr("d", line).attr("fill", "none")
          .attr("stroke", s.color).attr("stroke-width", 2.2);
      }
    });

    svg.append("g").attr("transform", `translate(0,${height - 6})`)
      .call(d3.axisBottom(x).ticks(4).tickSize(0).tickFormat(d3.timeFormat("%d %b %H:%M")))
      .call(axis => axis.select(".domain").remove())
      .call(axis => mutedText(axis.selectAll("text"), 11));
  };

  function hourLabel(t) {
    const h = +String(t).slice(11, 13);
    if (!Number.isFinite(h)) return "";
    if (h === 0) return "12a";
    if (h === 12) return "12p";
    return h > 12 ? (h - 12) + "p" : h + "a";
  }

  function parseDay(day) {
    return new Date(String(day) + "T00:00:00+05:30");
  }

  function fmt(v, d) {
    return Number.isFinite(+v) ? (+v).toFixed(d) : "—";
  }

  global.MXViz = MXViz;
})(window);
