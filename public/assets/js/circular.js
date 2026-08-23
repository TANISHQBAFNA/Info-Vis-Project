(function () {
  const Viz = window.MCViz = window.MCViz || {};
  let paths;

  Viz.drawCircular = function () {
    const { el, width, height } = MCUtils.mountSize("circular-chart");
    el.innerHTML = "";
    const pad = 12;
    const size = Math.min(width, height) - pad * 2;
    const svg = d3.select(el)
      .append("svg")
      .attr("viewBox", `${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("overflow", "visible");

    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);
    const data = MissionControl.data.svi;
    const outer = Math.max(80, size / 2 - 10);
    const inner = Math.max(46, outer * 0.3);

    const x = d3.scaleBand()
      .range([0, 2 * Math.PI])
      .align(0)
      .domain(data.map((d) => d.county));

    const y = d3.scaleRadial()
      .range([inner, outer])
      .domain([0, 1]);

    [0.25, 0.5, 0.75, 1].forEach((v) => {
      g.append("circle")
        .attr("r", y(v))
        .attr("fill", "none")
        .attr("stroke", "rgba(143,91,74,0.12)")
        .attr("stroke-dasharray", v === 1 ? "0" : "2 4");
      g.append("text")
        .attr("class", "ring-label")
        .attr("y", -y(v) + 3)
        .attr("text-anchor", "middle")
        .attr("font-size", 9)
        .text(v.toFixed(2));
    });

    g.append("circle")
      .attr("r", inner - 6)
      .attr("fill", "rgba(143, 91, 74, 0.06)")
      .attr("stroke", "rgba(143, 91, 74, 0.22)");

    const arc = d3.arc()
      .innerRadius(inner)
      .outerRadius((d) => y(d.svi))
      .startAngle((d) => x(d.county))
      .endAngle((d) => x(d.county) + x.bandwidth())
      .padAngle(0.004)
      .padRadius(inner);

    paths = g.append("g")
      .selectAll("path")
      .data(data)
      .join("path")
      .attr("class", "circular")
      .attr("d", arc)
      .on("mouseover", function (event, d) {
        d3.select(this).attr("fill-opacity", 0.55);
        MissionControl.tooltip.show(event, `<strong>${d.county}</strong><br>SVI ${d.svi.toFixed(4)}<br>${MCUtils.bandLabel(d.band)}`);
      })
      .on("mousemove", (event, d) => {
        MissionControl.tooltip.show(event, `<strong>${d.county}</strong><br>SVI ${d.svi.toFixed(4)}<br>${MCUtils.bandLabel(d.band)}`);
      })
      .on("mouseout", function () {
        d3.select(this).attr("fill-opacity", 1);
        MissionControl.tooltip.hide();
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        MissionControl.selectCounty(d.county);
      });

    const center = g.append("g").attr("class", "hub");
    center.append("text")
      .attr("class", "hub-name")
      .attr("text-anchor", "middle")
      .attr("y", -8)
      .attr("fill", "#2c2824")
      .attr("font-family", "Fraunces, serif")
      .attr("font-size", 13)
      .attr("letter-spacing", "-0.02em");
    center.append("text")
      .attr("class", "hub-svi")
      .attr("text-anchor", "middle")
      .attr("y", 10)
      .attr("fill", "#8f5b4a")
      .attr("font-family", "Source Sans 3, sans-serif")
      .attr("font-size", 13);
    center.append("text")
      .attr("class", "hub-band")
      .attr("text-anchor", "middle")
      .attr("y", 26)
      .attr("fill", "#7a7168")
      .attr("font-family", "Source Sans 3, sans-serif")
      .attr("font-size", 10)
      .attr("letter-spacing", "0.04em");

    Viz.updateCircular();
  };

  Viz.updateCircular = function () {
    if (!paths) return Viz.drawCircular();
    const selected = MissionControl.state.county;
    const filter = MissionControl.state.band;
    paths
      .attr("fill", (d) => MCUtils.bandColor(d.svi))
      .attr("stroke", (d) => (d.county === selected ? "#2c2824" : "transparent"))
      .attr("stroke-width", (d) => (d.county === selected ? 1.6 : 0))
      .attr("opacity", (d) => {
        if (filter === "all" || filter === "focus") return 1;
        return d.band === filter ? 1 : 0.12;
      });

    const row = MissionControl.selectedRow();
    const root = d3.select("#circular-chart");
    root.select(".hub-name").text(row ? clipLabel(row.county) : "Select a county");
    root.select(".hub-svi").text(row ? row.svi.toFixed(3) : "—");
    root.select(".hub-band").text(row ? MCUtils.bandLabel(row.band) : "");
  };

  function clipLabel(name) {
    return name.length > 18 ? name.slice(0, 16) + "…" : name;
  }
})();
