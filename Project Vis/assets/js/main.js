currentWidth = parseInt(d3.select('#circular-chart').style('width'), 10)
currentheight = parseInt(d3.select('.circular-chart').style('height'), 10)

var margin = {top: 10, right: 30, bottom: 40, left: 100},
  width = currentWidth - margin.left - margin.right,
  height = currentheight - margin.top - margin.bottom;

// append the svg object to the body of the page
var svg = d3.select("body").select(".circular-chart").select(".row").select("#circular-chart")
  .append("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", height + margin.top + margin.bottom)
  .append("g")
  .attr("transform",
    "translate(" + margin.left + "," + margin.top + ")");

// Parse the Data
d3.csv("assets/data/Top 25.csv", function(data) {

// sort data
  data.sort(function(b, a) {
    return a.THEMES - b.THEMES;
  });

// Add X axis
  var x = d3.scaleLinear()
    .domain([0, 1])
    .range([ 0, width]);
  svg.append("g")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("transform", "translate(-10,0)rotate(-45)")
    .style("text-anchor", "end");

// Y axis
  var y = d3.scaleBand()
    .range([ 0, height ])
    .domain(data.map(function(d) { return d.COUNTY; }))
    .padding(1);
  svg.append("g")
    .call(d3.axisLeft(y))

// Lines
  svg.selectAll("myline")
    .data(data)
    .enter()
    .append("line")
    .attr("x1", x(0))
    .attr("x2", x(0))
    .attr("y1", function(d) { return y(d.COUNTY); })
    .attr("y2", function(d) { return y(d.COUNTY); })
    .attr("stroke", "grey")

// Circles -> start at X=0
  svg.selectAll("mycircle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", x(0) )
    .attr("cy", function(d) { return y(d.COUNTY); })
    .attr("r", "7")
    .style("fill", "#69b3a2")
    .attr("stroke", "black")
    .on("click", function (d){
      d3.select(".circular-chart").select(".row").select("#circular-info").text(d.COUNTY);
    })
// Change the X coordinates of line and circle
  svg.selectAll("circle")
    .transition()
    .duration(2000)
    .attr("cx", function(d) { return x(d.THEMES); })

  svg.selectAll("line")
    .transition()
    .duration(2000)
    .attr("x1", function(d) { return x(d.THEMES); })

})
