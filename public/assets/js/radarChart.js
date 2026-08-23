(function () {
  const Viz = window.MCViz = window.MCViz || {};

  Viz.drawRadar = function () {
    const { el, width, height } = MCUtils.mountSize("radar-chart");
    if (!el) return;
    el.innerHTML = "";
    const row = MissionControl.selectedRow();
    if (!row) {
      el.innerHTML = `<div class="chart-empty">Select a county on the SVI chart</div>`;
      return;
    }

    const data = [[
      { axis: "SVI", value: row.svi, theme: "Social Vulnerability Index (SVI)" },
      { axis: "Socioeconomic", value: row.theme1, theme: "Socioeconomic" },
      { axis: "Household", value: row.theme2, theme: "Household Composition & Disability" },
      { axis: "Minority", value: row.theme3, theme: "Minority Status & language" },
      { axis: "Housing", value: row.theme4, theme: "Housing Type & Transportation" }
    ]];

    const margin = { top: 52, right: 52, bottom: 52, left: 52 };
    const w = Math.max(120, width - margin.left - margin.right);
    const h = Math.max(120, height - margin.top - margin.bottom);
    const radius = Math.min(w, h) / 2 * 0.78;
    const levels = 4;
    const axes = data[0].map((d) => d.axis);
    const angleSlice = (Math.PI * 2) / axes.length;
    const rScale = d3.scaleLinear().range([0, radius]).domain([0, 1]);
    const selectedTheme = MissionControl.state.theme;

    const svg = d3.select(el)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("overflow", "visible");

    const g = svg.append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    const filter = g.append("defs").append("filter").attr("id", "radar-glow");
    const merge = filter.append("feMerge");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    d3.range(1, levels + 1).reverse().forEach((lvl) => {
      g.append("circle")
        .attr("r", radius / levels * lvl)
        .attr("fill", "rgba(143,91,74,0.04)")
        .attr("stroke", "rgba(143,91,74,0.16)");
      g.append("text")
        .attr("class", "ring-label")
        .attr("x", 4)
        .attr("y", -(radius / levels * lvl) + 3)
        .attr("font-size", 9)
        .text((lvl / levels).toFixed(2));
    });

    const axis = g.selectAll(".axis")
      .data(data[0])
      .join("g")
      .attr("class", "axis")
      .style("cursor", "pointer")
      .on("click", (event, d) => MissionControl.selectTheme(d.theme))
      .on("mouseover", (event, d) => {
        MissionControl.tooltip.show(event, `${d.axis}<br>${d.value.toFixed(4)}`);
      })
      .on("mousemove", (event, d) => {
        MissionControl.tooltip.show(event, `${d.axis}<br>${d.value.toFixed(4)}`);
      })
      .on("mouseout", () => MissionControl.tooltip.hide());

    axis.append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", (d, i) => rScale(1.05) * Math.cos(angleSlice * i - Math.PI / 2))
      .attr("y2", (d, i) => rScale(1.05) * Math.sin(angleSlice * i - Math.PI / 2))
      .attr("stroke", (d) => (selectedTheme === d.theme ? "#8f5b4a" : "rgba(44,40,36,0.18)"))
      .attr("stroke-width", (d) => (selectedTheme === d.theme ? 2 : 1));

    axis.append("text")
      .attr("class", "legend-text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("x", (d, i) => rScale(1.28) * Math.cos(angleSlice * i - Math.PI / 2))
      .attr("y", (d, i) => rScale(1.28) * Math.sin(angleSlice * i - Math.PI / 2))
      .attr("fill", (d) => (selectedTheme === d.theme ? "#8f5b4a" : "#7a7168"))
      .attr("font-size", (d) => (d.axis === "SVI" ? 12 : 10))
      .text((d) => d.axis);

    const radarLine = d3.lineRadial()
      .radius((d) => rScale(d.value))
      .angle((d, i) => i * angleSlice)
      .curve(d3.curveCardinalClosed);

    const color = MCUtils.bandColor(row.svi);
    const wrap = g.append("g");
    wrap.append("path")
      .datum(data[0])
      .attr("d", radarLine)
      .attr("fill", color)
      .attr("fill-opacity", 0.28)
      .attr("stroke", color)
      .attr("stroke-width", 2);

    wrap.selectAll("circle.dot")
      .data(data[0])
      .join("circle")
      .attr("class", "dot")
      .attr("r", (d) => (d.axis === "SVI" || selectedTheme === d.theme ? 6 : 4))
      .attr("cx", (d, i) => rScale(d.value) * Math.cos(angleSlice * i - Math.PI / 2))
      .attr("cy", (d, i) => rScale(d.value) * Math.sin(angleSlice * i - Math.PI / 2))
      .attr("fill", (d) => (d.axis === "SVI" ? "#8f5b4a" : color))
      .attr("stroke", "#fffdf8")
      .style("cursor", "pointer")
      .on("click", (event, d) => MissionControl.selectTheme(d.theme))
      .on("mouseover", (event, d) => {
        MissionControl.tooltip.show(event, `${d.axis}: ${d.value.toFixed(4)}`);
      })
      .on("mouseout", () => MissionControl.tooltip.hide());
  };
})();
