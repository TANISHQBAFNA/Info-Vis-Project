(function () {
  const Viz = window.MCViz = window.MCViz || {};
  let layers;
  let x;
  let xAxisG;
  let areaGen;
  const fullDomain = [new Date("2020-03-17"), new Date("2022-05-05")];
  const palette = {
    Danville: "#ead3c4",
    Galax: "#d4a488",
    Henry: "#c48962",
    Petersburg: "#a86b56",
    Sussex: "#7a3f3a"
  };
  const axisInk = "#7a7168";
  const axisLine = "#eee8df";
  const axisDomain = "#cfc3b3";

  Viz.drawStacked = function () {
    const { el, width, height } = MCUtils.mountSize("stacked-chart");
    if (!el) return;
    el.innerHTML = "";
    const data = MissionControl.data.daily;
    const keys = MissionControl.data.dailyKeys;
    if (!data.length) return;

    const margin = { top: 18, right: 16, bottom: 32, left: 44 };
    const innerW = Math.max(80, width - margin.left - margin.right);
    const innerH = Math.max(80, height - margin.top - margin.bottom);

    const svg = d3.select(el)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("overflow", "visible");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const stacked = d3.stack().keys(keys)(data);
    const yMax = d3.max(stacked[stacked.length - 1], (d) => d[1]) || 1;

    x = d3.scaleTime().domain(fullDomain).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, yMax * 1.05]).range([innerH, 0]);

    xAxisG = g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(-innerH))
      .call((axis) => axis.selectAll("line").attr("stroke", axisLine))
      .call((axis) => axis.select(".domain").attr("stroke", axisDomain))
      .call((axis) => axis.selectAll("text").attr("fill", axisInk).attr("font-family", "Source Sans 3").attr("font-size", 11));

    g.append("g")
      .call(d3.axisLeft(y).ticks(4).tickSize(-innerW))
      .call((axis) => axis.selectAll("line").attr("stroke", axisLine))
      .call((axis) => axis.select(".domain").attr("stroke", axisDomain))
      .call((axis) => axis.selectAll("text").attr("fill", axisInk).attr("font-family", "Source Sans 3").attr("font-size", 11));

    g.append("text")
      .attr("x", innerW)
      .attr("y", innerH + 28)
      .attr("text-anchor", "end")
      .attr("fill", axisInk)
      .attr("font-size", 11)
      .attr("font-family", "Source Sans 3")
      .text("Date");

    const clipId = "case-clip";
    g.append("defs").append("clipPath")
      .attr("id", clipId)
      .append("rect")
      .attr("width", innerW)
      .attr("height", innerH);

    areaGen = d3.area()
      .x((d) => x(d.data.date))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]));

    const totals = data.map((d) => ({
      date: d.date,
      total: keys.reduce((sum, k) => sum + d[k], 0)
    }));
    const totalLine = d3.line()
      .x((d) => x(d.date))
      .y((d) => y(d.total));

    const areaChart = g.append("g").attr("clip-path", `url(#${clipId})`);
    layers = areaChart.selectAll("path.case-layer")
      .data(stacked)
      .join("path")
      .attr("class", (d) => "case-layer " + d.key)
      .attr("d", areaGen)
      .style("pointer-events", "none");

    const totalPath = areaChart.append("path")
      .datum(totals)
      .attr("class", "total-line")
      .attr("fill", "none")
      .attr("stroke", "#5c3d36")
      .attr("stroke-width", 1.75)
      .attr("d", totalLine);

    const bisect = d3.bisector((row) => row.date).center;

    function rowAt(px) {
      const xm = x.invert(px);
      return data[bisect(data, xm)];
    }

    function keyAt(px, py) {
      const row = rowAt(px);
      if (!row) return null;
      const yVal = y.invert(py);
      let cumulative = 0;
      for (let i = 0; i < keys.length; i += 1) {
        const next = cumulative + row[keys[i]];
        if (yVal >= cumulative && yVal <= next) return keys[i];
        cumulative = next;
      }
      return keys[keys.length - 1];
    }

    function redrawAxes() {
      xAxisG.transition().duration(700).call(d3.axisBottom(x).ticks(6).tickSize(-innerH))
        .call((axis) => axis.selectAll("line").attr("stroke", axisLine))
        .call((axis) => axis.select(".domain").attr("stroke", axisDomain))
        .call((axis) => axis.selectAll("text").attr("fill", axisInk));
      layers.transition().duration(700).attr("d", areaGen);
      totalPath.transition().duration(700).attr("d", totalLine);
    }

    const brush = d3.brushX()
      .extent([[0, 0], [innerW, innerH]])
      .on("end", (event) => {
        if (!event.sourceEvent) return;
        if (!event.selection) {
          const [px, py] = d3.pointer(event.sourceEvent, g.node());
          const key = keyAt(px, py);
          if (key) MissionControl.selectCaseKey(key);
          return;
        }
        const [a, b] = event.selection.map(x.invert);
        x.domain([a, b]);
        areaChart.select(".brush").call(brush.move, null);
        redrawAxes();
      });

    const brushG = areaChart.append("g").attr("class", "brush").call(brush);
    brushG.on("dblclick", () => {
      x.domain(fullDomain);
      redrawAxes();
    });
    brushG.on("mousemove", (event) => {
      const [px, py] = d3.pointer(event, g.node());
      const row = rowAt(px);
      const key = keyAt(px, py);
      if (!row || !key) return;
      const total = keys.reduce((sum, k) => sum + row[k], 0);
      const lines = keys.map((k) => `${k}: ${row[k].toLocaleString()}`).join("<br>");
      MissionControl.tooltip.show(
        event,
        `<strong>${d3.timeFormat("%d %b %Y")(row.date)}</strong><br>Total: ${total.toLocaleString()}<br>${lines}`
      );
    });
    brushG.on("mouseleave", () => MissionControl.tooltip.hide());

    const legend = svg.append("g").attr("transform", `translate(${margin.left + 8},8)`);
    keys.forEach((key, i) => {
      const item = legend.append("g")
        .attr("transform", `translate(${i * 92},0)`)
        .style("cursor", "pointer")
        .on("click", () => MissionControl.selectCaseKey(key))
        .on("mouseover", () => layers.style("opacity", (d) => (d.key === key ? 1 : 0.15)))
        .on("mouseout", () => Viz.updateStacked());
      item.append("rect").attr("width", 8).attr("height", 8).attr("fill", palette[key]);
      item.append("text")
        .attr("x", 12)
        .attr("y", 8)
        .attr("fill", "#3a3530")
        .attr("font-size", 11)
        .attr("font-family", "Source Sans 3")
        .text(key);
    });
    const totalLegend = legend.append("g").attr("transform", `translate(${keys.length * 92},0)`);
    totalLegend.append("rect").attr("width", 16).attr("height", 2).attr("y", 4).attr("fill", "#5c3d36");
    totalLegend.append("text")
      .attr("x", 22)
      .attr("y", 8)
      .attr("fill", "#3a3530")
      .attr("font-size", 11)
      .attr("font-family", "Source Sans 3")
      .text("Total");

    Viz.updateStacked();
  };

  Viz.updateStacked = function () {
    if (!layers) return;
    const key = MissionControl.state.caseKey;
    layers
      .attr("fill", (d) => palette[d.key] || "#c48962")
      .attr("fill-opacity", (d) => {
        if (!key) return 0.85;
        return d.key === key ? 0.95 : 0.18;
      })
      .attr("stroke", (d) => (d.key === key ? "#ffffff" : "none"))
      .attr("stroke-width", (d) => (d.key === key ? 1 : 0))
      .style("opacity", 1);
  };
})();
