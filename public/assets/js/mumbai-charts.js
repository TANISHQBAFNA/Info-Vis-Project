(function () {
  const Viz = window.MXViz = window.MXViz || {};
  const U = () => window.MXUtils;
  let circularPaths;
  let rainLayers;

  const rainPalette = {
    Govandi: "#7a3f3a",
    Sion: "#a86b56",
    Kurla: "#c48962",
    Ghatkopar: "#d4a488",
    Dadar: "#ead3c4"
  };

  Viz.drawCircular = function () {
    const { el, width, height } = U().mountSize("circular-chart");
    el.innerHTML = "";
    const pad = 12;
    const size = Math.min(width, height) - pad * 2;
    const svg = d3.select(el)
      .append("svg")
      .attr("viewBox", `${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("overflow", "visible");
    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);
    const data = MumbaiDash.data.wards;
    const outer = Math.max(80, size / 2 - 10);
    const inner = Math.max(46, outer * 0.3);
    const x = d3.scaleBand().range([0, 2 * Math.PI]).align(0).domain(data.map((d) => d.ward));
    const y = d3.scaleRadial().range([inner, outer]).domain([0, 1]);

    [0.25, 0.5, 0.75, 1].forEach((v) => {
      g.append("circle").attr("r", y(v)).attr("fill", "none")
        .attr("stroke", "rgba(143,91,74,0.12)")
        .attr("stroke-dasharray", v === 1 ? "0" : "2 4");
      g.append("text").attr("class", "ring-label").attr("y", -y(v) + 3)
        .attr("text-anchor", "middle").attr("font-size", 9).text(v.toFixed(2));
    });
    g.append("circle").attr("r", inner - 6)
      .attr("fill", "rgba(143, 91, 74, 0.06)")
      .attr("stroke", "rgba(143, 91, 74, 0.22)");

    const arc = d3.arc()
      .innerRadius(inner)
      .outerRadius((d) => y(d.svi))
      .startAngle((d) => x(d.ward))
      .endAngle((d) => x(d.ward) + x.bandwidth())
      .padAngle(0.01)
      .padRadius(inner);

    circularPaths = g.append("g").selectAll("path").data(data).join("path")
      .attr("class", "circular")
      .attr("d", arc)
      .on("mouseover", function (event, d) {
        d3.select(this).attr("fill-opacity", 0.55);
        MumbaiDash.tooltip.show(event, `<strong>${d.ward}</strong><br>Index ${d.svi.toFixed(4)}<br>${U().bandLabel(d.band)}`);
      })
      .on("mousemove", (event, d) => {
        MumbaiDash.tooltip.show(event, `<strong>${d.ward}</strong><br>Index ${d.svi.toFixed(4)}<br>${U().bandLabel(d.band)}`);
      })
      .on("mouseout", function () {
        d3.select(this).attr("fill-opacity", 1);
        MumbaiDash.tooltip.hide();
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        MumbaiDash.selectWard(d.ward);
      });

    const center = g.append("g").attr("class", "hub");
    center.append("text").attr("class", "hub-name").attr("text-anchor", "middle").attr("y", -8)
      .attr("fill", "#2c2824").attr("font-family", "Fraunces, serif").attr("font-size", 12);
    center.append("text").attr("class", "hub-svi").attr("text-anchor", "middle").attr("y", 10)
      .attr("fill", "#8f5b4a").attr("font-family", "Source Sans 3, sans-serif").attr("font-size", 13);
    center.append("text").attr("class", "hub-band").attr("text-anchor", "middle").attr("y", 26)
      .attr("fill", "#7a7168").attr("font-family", "Source Sans 3, sans-serif").attr("font-size", 10);
    Viz.updateCircular();
  };

  Viz.updateCircular = function () {
    if (!circularPaths) return Viz.drawCircular();
    const selected = MumbaiDash.state.ward;
    const filter = MumbaiDash.state.band;
    circularPaths
      .attr("fill", (d) => U().bandColor(d.svi))
      .attr("stroke", (d) => (d.ward === selected ? "#2c2824" : "transparent"))
      .attr("stroke-width", (d) => (d.ward === selected ? 1.6 : 0))
      .attr("opacity", (d) => {
        if (filter === "all" || filter === "focus") return 1;
        return d.band === filter ? 1 : 0.12;
      });
    const row = MumbaiDash.selectedRow();
    const root = d3.select("#circular-chart");
    root.select(".hub-name").text(row ? clipLabel(row.ward) : "Select a ward");
    root.select(".hub-svi").text(row ? row.svi.toFixed(3) : "—");
    root.select(".hub-band").text(row ? U().bandLabel(row.band) : "");
  };

  Viz.drawRadar = function () {
    const { el, width, height } = U().mountSize("radar-chart");
    el.innerHTML = "";
    const row = MumbaiDash.selectedRow();
    if (!row) {
      el.innerHTML = `<div class="chart-empty">Select a ward on the index chart</div>`;
      return;
    }
    const data = [[
      { axis: "Index", value: row.svi, theme: "Mumbai Exposure Index" },
      { axis: "Flood", value: row.theme1, theme: "Flood / drainage" },
      { axis: "Heat", value: row.theme2, theme: "Heat / housing" },
      { axis: "Air", value: row.theme3, theme: "Air / health" },
      { axis: "Services", value: row.theme4, theme: "Services / density" }
    ]];
    const margin = 52;
    const w = Math.max(120, width - margin * 2);
    const h = Math.max(120, height - margin * 2);
    const radius = Math.min(w, h) / 2 * 0.78;
    const levels = 4;
    const angleSlice = (Math.PI * 2) / data[0].length;
    const rScale = d3.scaleLinear().range([0, radius]).domain([0, 1]);
    const selectedTheme = MumbaiDash.state.theme;
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet").style("overflow", "visible");
    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

    d3.range(1, levels + 1).reverse().forEach((lvl) => {
      g.append("circle").attr("r", radius / levels * lvl)
        .attr("fill", "rgba(143,91,74,0.04)").attr("stroke", "rgba(143,91,74,0.16)");
      g.append("text").attr("class", "ring-label").attr("x", 4)
        .attr("y", -(radius / levels * lvl) + 3).attr("font-size", 9)
        .text((lvl / levels).toFixed(2));
    });

    const axis = g.selectAll(".axis").data(data[0]).join("g").attr("class", "axis")
      .style("cursor", "pointer")
      .on("click", (event, d) => MumbaiDash.selectTheme(d.theme))
      .on("mouseover", (event, d) => MumbaiDash.tooltip.show(event, `${d.axis}<br>${d.value.toFixed(4)}`))
      .on("mousemove", (event, d) => MumbaiDash.tooltip.show(event, `${d.axis}<br>${d.value.toFixed(4)}`))
      .on("mouseout", () => MumbaiDash.tooltip.hide());

    axis.append("line").attr("x1", 0).attr("y1", 0)
      .attr("x2", (d, i) => rScale(1.05) * Math.cos(angleSlice * i - Math.PI / 2))
      .attr("y2", (d, i) => rScale(1.05) * Math.sin(angleSlice * i - Math.PI / 2))
      .attr("stroke", (d) => (selectedTheme === d.theme ? "#8f5b4a" : "rgba(44,40,36,0.18)"))
      .attr("stroke-width", (d) => (selectedTheme === d.theme ? 2 : 1));
    axis.append("text").attr("class", "legend-text").attr("text-anchor", "middle").attr("dy", "0.35em")
      .attr("x", (d, i) => rScale(1.28) * Math.cos(angleSlice * i - Math.PI / 2))
      .attr("y", (d, i) => rScale(1.28) * Math.sin(angleSlice * i - Math.PI / 2))
      .attr("fill", (d) => (selectedTheme === d.theme ? "#8f5b4a" : "#7a7168"))
      .attr("font-size", 11)
      .text((d) => d.axis);

    const radarLine = d3.lineRadial().radius((d) => rScale(d.value)).angle((d, i) => i * angleSlice).curve(d3.curveCardinalClosed);
    const color = U().bandColor(row.svi);
    const wrap = g.append("g");
    wrap.append("path").datum(data[0]).attr("d", radarLine)
      .attr("fill", color).attr("fill-opacity", 0.28).attr("stroke", color).attr("stroke-width", 2);
    wrap.selectAll("circle.dot").data(data[0]).join("circle").attr("class", "dot")
      .attr("r", (d) => (d.axis === "Index" || selectedTheme === d.theme ? 6 : 4))
      .attr("cx", (d, i) => rScale(d.value) * Math.cos(angleSlice * i - Math.PI / 2))
      .attr("cy", (d, i) => rScale(d.value) * Math.sin(angleSlice * i - Math.PI / 2))
      .attr("fill", (d) => (d.axis === "Index" ? "#8f5b4a" : color))
      .attr("stroke", "#fffdf8").style("cursor", "pointer")
      .on("click", (event, d) => MumbaiDash.selectTheme(d.theme))
      .on("mouseover", (event, d) => MumbaiDash.tooltip.show(event, `${d.axis}: ${d.value.toFixed(4)}`))
      .on("mouseout", () => MumbaiDash.tooltip.hide());
  };

  Viz.drawRain = function () {
    const { el, width, height } = U().mountSize("stacked-chart");
    el.innerHTML = "";
    const data = MumbaiDash.data.daily;
    const keys = MumbaiDash.data.dailyKeys;
    if (!data.length) {
      el.innerHTML = `<div class="chart-empty">Rain feed unavailable</div>`;
      return;
    }
    const margin = { top: 18, right: 16, bottom: 32, left: 44 };
    const innerW = Math.max(80, width - margin.left - margin.right);
    const innerH = Math.max(80, height - margin.top - margin.bottom);
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet").style("overflow", "visible");
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const stacked = d3.stack().keys(keys)(data);
    const yMax = d3.max(stacked[stacked.length - 1], (d) => d[1]) || 1;
    const x = d3.scaleTime().domain(d3.extent(data, (d) => d.date)).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, yMax * 1.08]).range([innerH, 0]);
    const axisInk = "#7a7168";
    const axisLine = "#eee8df";
    const axisDomain = "#cfc3b3";

    g.append("g").attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(-innerH))
      .call((axis) => axis.selectAll("line").attr("stroke", axisLine))
      .call((axis) => axis.select(".domain").attr("stroke", axisDomain))
      .call((axis) => axis.selectAll("text").attr("fill", axisInk).attr("font-size", 11));
    g.append("g").call(d3.axisLeft(y).ticks(4).tickSize(-innerW).tickFormat((d) => `${d}`))
      .call((axis) => axis.selectAll("line").attr("stroke", axisLine))
      .call((axis) => axis.select(".domain").attr("stroke", axisDomain))
      .call((axis) => axis.selectAll("text").attr("fill", axisInk).attr("font-size", 11));
    g.append("text").attr("x", innerW).attr("y", innerH + 28).attr("text-anchor", "end")
      .attr("fill", axisInk).attr("font-size", 11).text("Date · mm");

    const areaGen = d3.area().x((d) => x(d.data.date)).y0((d) => y(d[0])).y1((d) => y(d[1]));
    rainLayers = g.selectAll("path.case-layer").data(stacked).join("path")
      .attr("class", (d) => "case-layer " + d.key)
      .attr("d", areaGen)
      .style("cursor", "pointer")
      .on("click", (event, d) => MumbaiDash.selectRainKey(d.key))
      .on("mousemove", (event) => {
        const xm = x.invert(d3.pointer(event, g.node())[0]);
        const i = d3.bisector((row) => row.date).center(data, xm);
        const row = data[i];
        if (!row) return;
        const lines = keys.map((k) => `${k}: ${row[k].toFixed(1)} mm`).join("<br>");
        MumbaiDash.tooltip.show(event, `<strong>${d3.timeFormat("%d %b %Y")(row.date)}</strong><br>${lines}`);
      })
      .on("mouseleave", () => MumbaiDash.tooltip.hide());

    const legend = svg.append("g").attr("transform", `translate(${margin.left + 8},8)`);
    keys.forEach((key, i) => {
      const item = legend.append("g").attr("transform", `translate(${i * 88},0)`).style("cursor", "pointer")
        .on("click", () => MumbaiDash.selectRainKey(key));
      item.append("rect").attr("width", 8).attr("height", 8).attr("fill", rainPalette[key]);
      item.append("text").attr("x", 12).attr("y", 8).attr("fill", "#3a3530").attr("font-size", 11).text(key);
    });
    Viz.updateRain();
  };

  Viz.updateRain = function () {
    if (!rainLayers) return;
    const key = MumbaiDash.state.rainKey;
    rainLayers
      .attr("fill", (d) => rainPalette[d.key] || "#c48962")
      .attr("fill-opacity", (d) => (!key ? 0.85 : d.key === key ? 0.95 : 0.18));
  };

  const themeColor = {
    "Mumbai Exposure Index": "#7d9a86",
    "Flood / drainage": "#8f5b4a",
    "Heat / housing": "#c48962",
    "Air / health": "#8d7e92",
    "Services / density": "#a86b56"
  };

  function themeScore(row, name) {
    if (!row) return 1;
    if (name === "Mumbai Exposure Index") return Math.max(0.08, row.svi);
    if (name === "Flood / drainage") return Math.max(0.08, row.theme1);
    if (name === "Heat / housing") return Math.max(0.08, row.theme2);
    if (name === "Air / health") return Math.max(0.08, row.theme3);
    if (name === "Services / density") return Math.max(0.08, row.theme4);
    return 1;
  }

  function parentTheme(d) {
    let node = d;
    while (node) {
      if (themeColor[node.data.name] && node.data.name !== "Mumbai Exposure Index") return node.data.name;
      node = node.parent;
    }
    return d.data.name;
  }

  function colorOf(d) {
    if (themeColor[d.data.name]) return themeColor[d.data.name];
    return themeColor[parentTheme(d)] || "#7a7168";
  }

  function rawScore(row, d) {
    if (!row) return null;
    if (d.depth === 0) return row.svi;
    if (d.depth === 1) return themeScore(row, d.data.name);
    return themeScore(row, parentTheme(d));
  }

  Viz.drawTaxonomy = function () {
    const { el, width, height } = U().mountSize("taxonomy-chart");
    el.innerHTML = "";
    const data = MumbaiDash.data.taxonomy;
    if (!data) return;
    const row = MumbaiDash.selectedRow();
    const radius = Math.min(width, height) / 2 - 18;
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet").style("overflow", "visible");
    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);
    const root = d3.hierarchy(data);
    root.eachAfter((node) => {
      if (!node.children) {
        const themeName = node.parent && node.parent.depth === 1 ? node.parent.data.name : node.data.name;
        const siblings = node.parent ? node.parent.children.length : 1;
        node.value = themeScore(row, themeName) / siblings;
      } else {
        node.value = d3.sum(node.children, (c) => c.value);
      }
    });
    d3.partition().size([2 * Math.PI, radius])(root);
    const arc = d3.arc().startAngle((d) => d.x0).endAngle((d) => d.x1)
      .padAngle(0.012).padRadius(radius / 3)
      .innerRadius((d) => d.y0).outerRadius((d) => Math.max(d.y0, d.y1 - 2));
    const selected = MumbaiDash.state.theme;

    g.selectAll("path").data(root.descendants()).join("path").attr("d", arc)
      .attr("fill", (d) => colorOf(d))
      .attr("fill-opacity", (d) => {
        if (!selected) return d.depth === 0 ? 0.95 : 0.82;
        return d.data.name === selected || hasAncestor(d, selected) || hasDescendantName(d, selected) ? 1 : 0.18;
      })
      .attr("stroke", (d) => (d.data.name === selected ? "#2c2824" : "rgba(44,40,36,0.12)"))
      .attr("stroke-width", (d) => (d.data.name === selected ? 2 : 0.5))
      .style("cursor", "pointer")
      .on("click", (event, d) => MumbaiDash.selectTheme(d.data.name))
      .on("mouseover", (event, d) => {
        const score = rawScore(row, d);
        MumbaiDash.tooltip.show(event, score == null ? d.data.name : `${d.data.name}<br>${row.ward}: ${(+score).toFixed(3)}`);
      })
      .on("mouseout", () => MumbaiDash.tooltip.hide());

    g.selectAll("text.slice")
      .data(root.descendants().filter((d) => d.depth === 1 && (d.x1 - d.x0) > 0.35))
      .join("text").attr("class", "slice")
      .attr("transform", (d) => {
        const angle = ((d.x0 + d.x1) / 2) * 180 / Math.PI;
        const r = (d.y0 + d.y1) / 2;
        return `rotate(${angle - 90}) translate(${r},0) rotate(${angle > 180 ? 180 : 0})`;
      })
      .attr("dy", "0.35em").attr("text-anchor", "middle").attr("fill", "#5c4a3a")
      .attr("font-size", 10).attr("pointer-events", "none")
      .text((d) => shortTheme(d.data.name));

    g.append("circle").attr("r", root.children ? Math.max(24, root.children[0].y0 - 4) : 28)
      .attr("fill", "#fffdf8").attr("stroke", "#7d9a86").style("cursor", "pointer")
      .on("click", () => MumbaiDash.selectTheme("Mumbai Exposure Index"));
    g.append("text").attr("text-anchor", "middle").attr("y", row ? -4 : 4)
      .attr("fill", "#7d9a86").attr("font-size", 11).attr("font-family", "Fraunces")
      .attr("pointer-events", "none").text(row ? row.svi.toFixed(2) : "Index");
    if (row) {
      g.append("text").attr("text-anchor", "middle").attr("y", 12)
        .attr("fill", "#7a7168").attr("font-size", 9).attr("pointer-events", "none").text("Index");
    }
  };

  Viz.updateTaxonomy = function () { Viz.drawTaxonomy(); };

  function hasAncestor(d, name) {
    let node = d;
    while (node) {
      if (node.data.name === name) return true;
      node = node.parent;
    }
    return false;
  }
  function hasDescendantName(d, name) {
    return d.descendants().some((n) => n.data.name === name);
  }
  function shortTheme(name) {
    if (name.startsWith("Flood")) return "Flood";
    if (name.startsWith("Heat")) return "Heat";
    if (name.startsWith("Air")) return "Air";
    if (name.startsWith("Services")) return "Services";
    return name;
  }
  function clipLabel(name) {
    return name.length > 18 ? name.slice(0, 16) + "…" : name;
  }
})();
