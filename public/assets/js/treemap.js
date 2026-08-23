(function () {
  const Viz = window.MCViz = window.MCViz || {};
  let arcs;

  const themeColor = {
    "Social Vulnerability Index (SVI)": "#3dffb0",
    Socioeconomic: "#00e8ff",
    "Household Composition & Disability": "#ffb020",
    "Minority Status & language": "#c084fc",
    "Housing Type & Transportation": "#ff7a32"
  };

  function colorOf(d) {
    if (themeColor[d.data.name]) return themeColor[d.data.name];
    let node = d;
    while (node.parent) {
      if (themeColor[node.data.name]) return themeColor[node.data.name];
      node = node.parent;
    }
    return "#7a93a8";
  }

  Viz.drawTaxonomy = function () {
    const { el, width, height } = MCUtils.mountSize("taxonomy-chart");
    el.innerHTML = "";
    const data = MissionControl.data.taxonomy;
    if (!data) return;

    const radius = Math.min(width, height) / 2 - 8;
    const svg = d3.select(el)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

    const root = d3.hierarchy(data).sum((d) => (d.children ? 0 : 1));
    d3.partition().size([2 * Math.PI, radius])(root);

    const arc = d3.arc()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle(0.01)
      .padRadius(radius / 3)
      .innerRadius((d) => d.y0)
      .outerRadius((d) => Math.max(d.y0, d.y1 - 2));

    arcs = g.selectAll("path")
      .data(root.descendants())
      .join("path")
      .attr("d", arc)
      .style("cursor", "pointer")
      .on("click", (event, d) => MissionControl.selectTheme(d.data.name))
      .on("mouseover", (event, d) => {
        d3.select(event.currentTarget).attr("fill-opacity", 1);
        MissionControl.tooltip.show(event, d.data.name);
      })
      .on("mousemove", (event, d) => MissionControl.tooltip.show(event, d.data.name))
      .on("mouseout", (event) => {
        d3.select(event.currentTarget).attr("fill-opacity", null);
        MissionControl.tooltip.hide();
        Viz.updateTaxonomy();
      });

    g.selectAll("text.slice")
      .data(root.descendants().filter((d) => d.depth === 1 && (d.x1 - d.x0) > 0.4))
      .join("text")
      .attr("class", "slice")
      .attr("transform", (d) => {
        const angle = ((d.x0 + d.x1) / 2) * 180 / Math.PI;
        const r = (d.y0 + d.y1) / 2;
        return `rotate(${angle - 90}) translate(${r},0) rotate(${angle > 180 ? 180 : 0})`;
      })
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("fill", "#05080f")
      .attr("font-size", 9)
      .attr("font-family", "IBM Plex Mono")
      .attr("pointer-events", "none")
      .text((d) => shortTheme(d.data.name));

    g.append("circle")
      .attr("r", root.y1 ? root.children[0].y0 - 2 : 28)
      .attr("fill", "#05080f")
      .attr("stroke", "#3dffb0")
      .style("cursor", "pointer")
      .on("click", () => MissionControl.selectTheme("Social Vulnerability Index (SVI)"));

    g.append("text")
      .attr("text-anchor", "middle")
      .attr("y", 4)
      .attr("fill", "#3dffb0")
      .attr("font-size", 10)
      .attr("font-family", "Orbitron")
      .attr("pointer-events", "none")
      .text("SVI");

    Viz.updateTaxonomy();
  };

  Viz.updateTaxonomy = function () {
    if (!arcs) return;
    const selected = MissionControl.state.theme;
    arcs
      .attr("fill", (d) => colorOf(d))
      .attr("fill-opacity", (d) => {
        if (!selected) return d.depth === 0 ? 0.9 : 0.82;
        return d.data.name === selected || hasAncestor(d, selected) || hasDescendantName(d, selected) ? 1 : 0.18;
      })
      .attr("stroke", (d) => (d.data.name === selected ? "#d6e7f5" : "rgba(5,8,15,0.4)"))
      .attr("stroke-width", (d) => (d.data.name === selected ? 2 : 0.5));
  };

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
    if (name.startsWith("Household")) return "HOUSEHOLD";
    if (name.startsWith("Minority")) return "MINORITY";
    if (name.startsWith("Housing")) return "HOUSING";
    if (name.startsWith("Socio")) return "SOCIO";
    return name;
  }
})();
