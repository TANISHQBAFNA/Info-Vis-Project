/**
 * Mumbai live charts — lon/lat bubbles, 24h AQI heatmap, rain ridgelines, 48h traces.
 * Reads MumbaiDash.wards[].live (Open-Meteo), never the Virginia chart modules.
 */
(function (global) {
  "use strict";

  const MXViz = {};

  function sizeOf(id) {
    const el = document.getElementById(id);
    if (!el) return { el: null, width: 0, height: 0 };
    const r = el.getBoundingClientRect();
    return { el, width: Math.max(200, r.width), height: Math.max(160, r.height) };
  }

  function empty(el, msg) {
    if (!el) return;
    el.innerHTML = `<div class="chart-empty">${msg}</div>`;
  }

  function tip(event, html) {
    if (!global.MumbaiDash) return;
    MumbaiDash.tip(html, event.clientX, event.clientY);
  }

  function styleAxis(axis) {
    axis.selectAll("line").attr("stroke", "#eee8df");
    axis.select(".domain").attr("stroke", "#cfc3b3");
    axis.selectAll("text").attr("fill", "#7a7168").attr("font-size", 10);
  }

  MXViz.drawMap = function (wards, sel) {
    const { el, width, height } = sizeOf("ward-map");
    if (!el) return;
    el.innerHTML = "";
    if (!wards.length) { empty(el, "No ward centroids"); return; }

    const margin = { top: 14, right: 18, bottom: 32, left: 44 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const lon = d3.extent(wards, d => d.lon);
    const lat = d3.extent(wards, d => d.lat);
    const x = d3.scaleLinear().domain([lon[0] - 0.04, lon[1] + 0.01]).range([0, innerW]);
    const y = d3.scaleLinear().domain([lat[0] - 0.01, lat[1] + 0.01]).range([innerH, 0]);
    const maxRain = d3.max(wards, d => d.live.rainToday) || 0;
    const r = d3.scaleSqrt().domain([0, Math.max(1, maxRain)]).range([8, 26]);
    const selectedId = sel && sel.id;
    const color = MumbaiDash.aqiColor;

    const svg = d3.select(el).append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
    svg.append("rect").attr("width", width).attr("height", height).attr("fill", "#f3ebe0");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const seaW = Math.max(36, x(lon[0]) + 8);
    g.append("rect")
      .attr("x", -margin.left)
      .attr("y", -margin.top)
      .attr("width", seaW + margin.left)
      .attr("height", height)
      .attr("fill", "#d5e2ea")
      .attr("opacity", 0.7);
    g.append("text")
      .attr("x", -margin.left + 12)
      .attr("y", innerH / 2)
      .attr("fill", "#6a7c86")
      .attr("font-size", 10)
      .attr("letter-spacing", "0.08em")
      .attr("transform", `rotate(-90,${-margin.left + 12},${innerH / 2})`)
      .text("Arabian Sea");

    g.append("g").attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat(d => d.toFixed(2)))
      .call(styleAxis);
    g.append("g")
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => d.toFixed(2)))
      .call(styleAxis);

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
      .attr("fill-opacity", 0.88)
      .attr("stroke", d => d.id === selectedId ? "#2c2824" : "rgba(255,253,248,0.75)")
      .attr("stroke-width", d => d.id === selectedId ? 2.4 : 1);

    const worst = wards.slice().sort((a, b) => (b.live.now.aqi || 0) - (a.live.now.aqi || 0))[0];
    nodes.filter(d => d.id === selectedId || (worst && d.id === worst.id))
      .append("text")
      .attr("y", d => r(d.live.rainToday || 0) + 12)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("fill", "#3a3530")
      .text(d => d.short);

    const legend = document.getElementById("map-legend");
    if (legend) {
      const stops = [0, 50, 100, 150, 200];
      legend.innerHTML = stops.map((v, i) => {
        if (i === stops.length - 1) return "";
        return `<span><i style="background:${color(v + 1)}"></i>${v}–${stops[i + 1]}</span>`;
      }).join("") + `<span>Size = rain today (max ${fmt(maxRain, 1)} mm)</span>`;
    }
  };

  MXViz.drawHeat = function (wards, sel) {
    const { el, width, height } = sizeOf("aqi-heat");
    if (!el) return;
    el.innerHTML = "";
    const ranked = wards.slice().sort((a, b) => (b.live.now.aqi || -1) - (a.live.now.aqi || -1));
    const hours = (ranked.find(w => w.live.hours24.length) || {}).live?.hours24 || [];
    if (!hours.length) { empty(el, "AQI hours not in yet — feed down or still loading"); return; }

    const margin = { top: 10, right: 12, bottom: 22, left: 78 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const keys = hours.map(h => h.t);
    const x = d3.scaleBand().domain(keys).range([0, innerW]).padding(0.08);
    const y = d3.scaleBand().domain(ranked.map(w => w.id)).range([0, innerH]).padding(0.1);
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

    g.selectAll("rect").data(cells).join("rect")
      .attr("x", d => x(d.t))
      .attr("y", d => y(d.id))
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .attr("rx", 1)
      .attr("fill", d => MumbaiDash.aqiColor(d.aqi))
      .attr("stroke", d => d.id === selectedId ? "#2c2824" : "none")
      .attr("stroke-width", 1)
      .style("cursor", "pointer")
      .on("click", (event, d) => MumbaiDash.selectWard(d.id))
      .on("mousemove", (event, d) => {
        const w = byId.get(d.id);
        const when = d.date ? d3.timeFormat("%d %b %H:%M")(d.date) : d.t;
        tip(event, `<strong>${w ? w.short : d.id}</strong><br>${when}<br>AQI ${fmt(d.aqi, 0)}`);
      })
      .on("mouseleave", () => MumbaiDash.tip(null));

    g.append("g").call(d3.axisLeft(y).tickFormat(id => {
      const w = byId.get(id);
      return w ? w.short : id;
    }).tickSize(0))
      .call(axis => axis.select(".domain").remove())
      .call(axis => axis.selectAll("text").attr("fill", "#7a7168").attr("font-size", 10));

    const tickKeys = keys.filter((_, i) => i % 4 === 0);
    g.append("g").attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickValues(tickKeys).tickFormat(t => {
        const h = hours.find(x => x.t === t);
        return h && h.date ? d3.timeFormat("%H")(h.date) : t.slice(11, 13);
      }).tickSize(0))
      .call(axis => axis.select(".domain").remove())
      .call(axis => axis.selectAll("text").attr("fill", "#7a7168").attr("font-size", 10));
  };

  MXViz.drawRidge = function (wards, sel) {
    const { el, width, height } = sizeOf("rain-ridge");
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

    const margin = { top: 8, right: 14, bottom: 22, left: 78 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const parsed = days.map(d => ({ t: parseDay(d.day), rain: d.rain }));
    const x = d3.scaleTime().domain(d3.extent(parsed, d => d.t)).range([0, innerW]);
    const y = d3.scaleBand().domain(wet.map(w => w.id)).range([0, innerH]).paddingInner(0.18);
    const peak = d3.max(wet, w => d3.max(w.live.rain14, d => d.rain)) || 1;
    const yh = d3.scaleLinear().domain([0, peak]).range([0, y.bandwidth()]);
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const selectedId = sel && sel.id;
    const area = d3.area()
      .x(d => x(d.t))
      .y0(y.bandwidth())
      .y1(d => y.bandwidth() - yh(d.rain))
      .curve(d3.curveBasis);

    wet.forEach(w => {
      const series = w.live.rain14.map(d => ({ t: parseDay(d.day), rain: d.rain }));
      const gg = g.append("g").attr("transform", `translate(0,${y(w.id)})`)
        .style("cursor", "pointer")
        .on("click", () => MumbaiDash.selectWard(w.id))
        .on("mousemove", (event) => {
          tip(event, `<strong>${w.ward}</strong><br>14-day rain ${fmt(d3.sum(w.live.rain14, d => d.rain), 0)} mm`);
        })
        .on("mouseleave", () => MumbaiDash.tip(null));
      gg.append("path").datum(series).attr("d", area)
        .attr("fill", w.id === selectedId ? "#8f5b4a" : "#c48962")
        .attr("fill-opacity", w.id === selectedId ? 0.55 : 0.28)
        .attr("stroke", "#8f5b4a")
        .attr("stroke-opacity", 0.75);
    });

    const byId = new Map(wet.map(w => [w.id, w]));
    g.append("g").call(d3.axisLeft(y).tickFormat(id => (byId.get(id) || {}).short || id).tickSize(0))
      .call(axis => axis.select(".domain").remove())
      .call(axis => axis.selectAll("text").attr("fill", "#7a7168").attr("font-size", 10));
    g.append("g").attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickSize(0).tickFormat(d3.timeFormat("%d %b")))
      .call(axis => axis.select(".domain").remove())
      .call(axis => axis.selectAll("text").attr("fill", "#7a7168").attr("font-size", 10));
  };

  MXViz.drawTraces = function (wards, sel) {
    const { el, width, height } = sizeOf("ward-traces");
    if (!el) return;
    el.innerHTML = "";
    const title = document.getElementById("trace-title");
    if (title) title.textContent = sel ? sel.short + ", last 48 hours" : "This ward, last 48 hours";
    const hours = (sel && sel.live.hours48) || [];
    if (!hours.length) { empty(el, "Pick a ward after the live feed lands"); return; }

    const series = [
      { key: "PM2.5", unit: "µg/m³", get: d => d.pm25, color: "#8f5b4a", bars: false },
      { key: "NO₂", unit: "µg/m³", get: d => d.no2, color: "#8d7e92", bars: false },
      { key: "Ozone", unit: "µg/m³", get: d => d.o3, color: "#7d9a86", bars: false },
      { key: "Rain", unit: "mm", get: d => d.rain, color: "#5a7a92", bars: true }
    ];
    const margin = { top: 4, right: 10, bottom: 18, left: 36 };
    const gap = 6;
    const slot = (height - margin.bottom - gap * 3) / 4;
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    const x = d3.scaleTime().domain(d3.extent(hours, d => d.date)).range([margin.left, width - margin.right]);

    series.forEach((s, i) => {
      const y0 = i * (slot + gap);
      const ymax = d3.max(hours, s.get);
      const y = d3.scaleLinear().domain([0, Number.isFinite(ymax) && ymax > 0 ? ymax : 1]).nice()
        .range([y0 + slot - 8, y0 + 16]);
      const g = svg.append("g");
      g.append("text").attr("x", margin.left).attr("y", y0 + 11)
        .attr("fill", s.color).attr("font-size", 11)
        .text(`${s.key} (${s.unit})`);
      if (s.bars) {
        const bw = Math.max(1.5, (width - margin.left - margin.right) / Math.max(hours.length, 1) - 0.4);
        g.selectAll("rect").data(hours).join("rect")
          .attr("x", d => x(d.date) - bw / 2)
          .attr("y", d => y(s.get(d) || 0))
          .attr("width", bw)
          .attr("height", d => Math.max(0, y(0) - y(s.get(d) || 0)))
          .attr("fill", s.color)
          .attr("opacity", 0.8);
      } else {
        const line = d3.line()
          .defined(d => Number.isFinite(s.get(d)))
          .x(d => x(d.date))
          .y(d => y(s.get(d)))
          .curve(d3.curveMonotoneX);
        g.append("path").datum(hours).attr("d", line).attr("fill", "none")
          .attr("stroke", s.color).attr("stroke-width", 1.7);
      }
    });

    svg.append("g").attr("transform", `translate(0,${height - 4})`)
      .call(d3.axisBottom(x).ticks(4).tickSize(0).tickFormat(d3.timeFormat("%d %b %H:%M")))
      .call(axis => axis.select(".domain").remove())
      .call(axis => axis.selectAll("text").attr("fill", "#7a7168").attr("font-size", 10));
  };

  function parseDay(day) {
    return new Date(String(day) + "T00:00:00+05:30");
  }

  function fmt(v, d) {
    return Number.isFinite(+v) ? (+v).toFixed(d) : "—";
  }

  global.MXViz = MXViz;
})(window);
