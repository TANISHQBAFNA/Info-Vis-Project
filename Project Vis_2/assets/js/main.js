currentWidth = parseInt(d3.select('#circular-chart').style('width'), 10)
currentheight = parseInt(d3.select('.circular-chart').style('height'), 10)
// set the dimensions and margins of the graph


var margin = {top: 10, right: 0, bottom: 0, left: 0},
  width = currentWidth ,
  height = currentheight ,
  innerRadius = 40,
  outerRadius = Math.min(width, height) / 2;   // the outerRadius goes from the middle of the SVG area to the border

// append the svg object to the body of the page
var svg = d3.select("body").select(".circular-chart").select(".row").select("#circular-chart")
  .append("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", height + margin.top + margin.bottom)
  .append("g")
  .attr("transform", "translate(" + width / 2 + "," + ( height/2+100 )+ ")")// Add 100 on Y translation, cause upper bars are longer

d3.csv("assets/data/SVICounty.csv", function(data) {

  // X scale
  var color = d3.scale.ordinal()
    .range(["#EDC951","#CC333F","#00A0B0"]);

  var x = d3.scaleBand()
    .range([0, 2 * Math.PI])    // X axis goes from 0 to 2pi = all around the circle. If I stop at 1Pi, it will be around a half circle
    .align(0)                  // This does nothing ?
    .domain( data.map(function(d) { return d.COUNTY; }) ); // The domain of the X axis is the list of states.

  // Y scale
  var y = d3.scaleRadial()
    .range([innerRadius, outerRadius])   // Domain will be define later.
    .domain([0, 1]); // Domain of Y is from 0 to the max seen in the data

  // Add bars
  svg.append("g")
    .selectAll("path")
    .data(data)
    .enter()
    .append("path")
    .attr("fill", function (d){
      if(d.THEMES>0.75){
        return "#CC333F";
      }
      if(d.THEMES<=0.75 && d.THEMES>0.5 ){
        return "#EDC951";
      }
      if(d.THEMES<=0.5 && d.THEMES>0.25){
        return "#00A0B0";
      }
      if(d.THEMES<=0.25){
        return "#00b052";
      }
    })
    .attr("d", d3.arc()     // imagine your doing a part of a donut plot
      .innerRadius(innerRadius)
      .outerRadius(function(d) { return y(d['THEMES']); })
      .startAngle(function(d) { return x(d.COUNTY); })
      .endAngle(function(d) { return x(d.COUNTY) + x.bandwidth(); })
      .padAngle(0.01)
      .padRadius(innerRadius))
    .on("mouseover", function() {
      //Bring back the hovered over blob
      d3.select(this)
        .transition().duration(200)
        .style("fill-opacity", 0.6);
    })
    .on('mouseout', function(){
      //Bring back all blobs
      d3.select(this)
        .transition().duration(200)
        .style("fill-opacity", 1);
    })
    .on("click", function (d){
      d3.select(".circular-chart").select(".row").select("#circular-info").text(d.COUNTY);
      radar(d.COUNTY);
    })


});
