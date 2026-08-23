(function () {
  const Viz = window.MCViz = window.MCViz || {};

  const themeColor = {
    "Social Vulnerability Index (SVI)": "#7d9a86",
    Socioeconomic: "#8f5b4a",
    "Household Composition & Disability": "#c48962",
    "Minority Status & language": "#8d7e92",
    "Housing Type & Transportation": "#a86b56"
  };

  function themeScore(row, name) {
    if (!row) return 1;
    if (name === "Social Vulnerability Index (SVI)") return Math.max(0.08, row.svi);
    if (name === "Socioeconomic") return Math.max(0.08, row.theme1);
    if (name === "Household Composition & Disability") return Math.max(0.08, row.theme2);
    if (name === "Minority Status & language") return Math.max(0.08, row.theme3);
    if (name === "Housing Type & Transportation") return Math.max(0.08, row.theme4);
    return 1;
  }

  function parentTheme(d) {
    let node = d;
    while (node) {
      if (themeColor[node.data.name] && node.data.name !== "Social Vulnerability Index (SVI)") {
        return node.data.name;
      }
      node = node.parent;
    }
    return d.data.name;
  }

  function colorOf(d) {
    if (themeColor[d.data.name]) return themeColor[d.data.name];
    const theme = parentTheme(d);
    return themeColor[theme] || "#7a7168";
  }

  function rawScore(row, d) {
    if (!row) return null;
    if (d.depth === 0) return row.svi;
    if (d.depth === 1) return themeScore(row, d.data.name);
    return themeScore(row, parentTheme(d));
  }

  Viz.drawTaxonomy = function () {
    const { el, width, height } = MCUtils.mountSize("taxonomy-chart");
    el.innerHTML = "";
    const data = MissionControl.data.taxonomy;
    if (!data) return;
    const row = MissionControl.selectedRow();

    const radius = Math.min(width, height) / 2 - 18;
    const svg = d3.select(el)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("overflow", "visible");
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

    const arc = d3.arc()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle(0.012)
      .padRadius(radius / 3)
      .innerRadius((d) => d.y0)
      .outerRadius((d) => Math.max(d.y0, d.y1 - 2));

    const selected = MissionControl.state.theme;

    g.selectAll("path")
      .data(root.descendants())
      .join("path")
      .attr("d", arc)
      .attr("fill", (d) => colorOf(d))
      .attr("fill-opacity", (d) => {
        if (!selected) return d.depth === 0 ? 0.95 : 0.82;
        return d.data.name === selected || hasAncestor(d, selected) || hasDescendantName(d, selected) ? 1 : 0.18;
      })
      .attr("stroke", (d) => (d.data.name === selected ? "#2c2824" : "rgba(44,40,36,0.12)"))
      .attr("stroke-width", (d) => (d.data.name === selected ? 2 : 0.5))
      .style("cursor", "pointer")
      .on("click", (event, d) => MissionControl.selectTheme(d.data.name))
      .on("mouseover", (event, d) => {
        const score = rawScore(row, d);
        const label = score == null ? d.data.name : `${d.data.name}<br>${row.county}: ${(+score).toFixed(3)}`;
        MissionControl.tooltip.show(event, label);
      })
      .on("mousemove", (event, d) => {
        const score = rawScore(row, d);
        const label = score == null ? d.data.name : `${d.data.name}<br>${row.county}: ${(+score).toFixed(3)}`;
        MissionControl.tooltip.show(event, label);
      })
      .on("mouseout", () => MissionControl.tooltip.hide());

    g.selectAll("text.slice")
      .data(root.descendants().filter((d) => d.depth === 1 && (d.x1 - d.x0) > 0.35))
      .join("text")
      .attr("class", "slice")
      .attr("transform", (d) => {
        const angle = ((d.x0 + d.x1) / 2) * 180 / Math.PI;
        const r = (d.y0 + d.y1) / 2;
        return `rotate(${angle - 90}) translate(${r},0) rotate(${angle > 180 ? 180 : 0})`;
      })
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("fill", "#5c4a3a")
      .attr("font-size", 10)
      .attr("font-family", "Source Sans 3")
      .attr("pointer-events", "none")
      .text((d) => `${shortTheme(d.data.name)} ${row ? d.data && themeScore(row, d.data.name).toFixed(2) : ""}`.trim());

    g.append("circle")
      .attr("r", root.children ? Math.max(24, root.children[0].y0 - 4) : 28)
      .attr("fill", "#fffdf8")
      .attr("stroke", "#7d9a86")
      .style("cursor", "pointer")
      .on("click", () => MissionControl.selectTheme("Social Vulnerability Index (SVI)"));

    g.append("text")
      .attr("text-anchor", "middle")
      .attr("y", row ? -4 : 4)
      .attr("fill", "#7d9a86")
      .attr("font-size", 11)
      .attr("font-family", "Fraunces")
      .attr("pointer-events", "none")
      .text(row ? row.svi.toFixed(2) : "SVI");

    if (row) {
      g.append("text")
        .attr("text-anchor", "middle")
        .attr("y", 12)
        .attr("fill", "#7a7168")
        .attr("font-size", 9)
        .attr("font-family", "Source Sans 3")
        .attr("pointer-events", "none")
        .text("SVI");
    }
  };

  Viz.updateTaxonomy = function () {
    Viz.drawTaxonomy();
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
    if (name.startsWith("Household")) return "Household";
    if (name.startsWith("Minority")) return "Minority";
    if (name.startsWith("Housing")) return "Housing";
    if (name.startsWith("Socio")) return "Socio";
    return name;
  }
})();
