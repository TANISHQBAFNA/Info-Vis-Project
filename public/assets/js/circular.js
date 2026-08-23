(function () {
  const Viz = window.MCViz = window.MCViz || {};
  let paths;

  Viz.drawCircular = function () {
    const { el, width, height } = MCUtils.mountSize("circular-chart");
    el.innerHTML = "";
    const size = Math.min(width, height);
    const svg = d3.select(el)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 6})`);
    const data = MissionControl.data.svi;
    const inner = Math.max(48, size * 0.16);
    const outer = Math.max(inner + 40, size * 0.42);

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
        .attr("stroke", "rgba(0,232,255,0.12)")
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
      .attr("fill", "rgba(0,232,255,0.04)")
      .attr("stroke", "rgba(0,232,255,0.25)");

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
      .attr("fill", "#d6e7f5")
      .attr("font-family", "Orbitron, sans-serif")
      .attr("font-size", 11)
      .attr("letter-spacing", "0.08em");
    center.append("text")
      .attr("class", "hub-svi")
      .attr("text-anchor", "middle")
      .attr("y", 10)
      .attr("fill", "#00e8ff")
      .attr("font-family", "IBM Plex Mono, monospace")
      .attr("font-size", 13);
    center.append("text")
      .attr("class", "hub-band")
      .attr("text-anchor", "middle")
      .attr("y", 26)
      .attr("fill", "#7a93a8")
      .attr("font-family", "IBM Plex Mono, monospace")
      .attr("font-size", 8)
      .attr("letter-spacing", "0.12em");

    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const sweep = g.append("g").attr("class", "sweep-g");
      sweep.append("line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", 0)
        .attr("y2", -outer)
        .attr("stroke", "rgba(0,232,255,0.35)")
        .attr("stroke-width", 2);
      sweep.append("animateTransform")
        .attr("attributeName", "transform")
        .attr("type", "rotate")
        .attr("from", "0 0 0")
        .attr("to", "360 0 0")
        .attr("dur", "9s")
        .attr("repeatCount", "indefinite");
    }

    Viz.updateCircular();
  };

  Viz.updateCircular = function () {
    if (!paths) return Viz.drawCircular();
    const selected = MissionControl.state.county;
    const filter = MissionControl.state.band;
    paths
      .attr("fill", (d) => MCUtils.bandColor(d.svi))
      .attr("stroke", (d) => (d.county === selected ? "#00e8ff" : "transparent"))
      .attr("stroke-width", (d) => (d.county === selected ? 1.6 : 0))
      .attr("opacity", (d) => {
        if (filter === "all" || filter === "sentinel") return 1;
        return d.band === filter ? 1 : 0.12;
      });

    const row = MissionControl.selectedRow();
    const root = d3.select("#circular-chart");
    root.select(".hub-name").text(row ? clipLabel(row.county) : "NO LOCK");
    root.select(".hub-svi").text(row ? row.svi.toFixed(3) : "—");
    root.select(".hub-band").text(row ? MCUtils.bandLabel(row.band).toUpperCase() : "AWAITING TARGET");
  };

  function clipLabel(name) {
    return name.length > 18 ? name.slice(0, 16) + "…" : name;
  }
})();
