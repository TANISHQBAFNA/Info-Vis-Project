currentWidth = parseInt(d3.select('#circular-chart').style('width'), 10)
currentheight = parseInt(d3.select('.circular-chart').style('height'), 10)
// set the dimensions and margins of the graph


var margin = {top: 0, right: 0, bottom: 0, left: 0},
  width = currentWidth + 90,
  height = currentheight + 90,
  innerRadius = 40,
  outerRadius = Math.min(width, height) / 2;   // the outerRadius goes from the middle of the SVG area to the border

// append the svg object to the body of the page
var svg = d3.select("body").select(".circular-chart").select(".row").select("#circular-chart")
  .append("svg")
  .attr("width", width )
  .attr("height", height )
  .append("g")
  .attr("transform", "translate(" + width / 3 + "," + ( height/2+100 )+ ")")// Add 100 on Y translation, cause upper bars are longer

d3.csv("assets/data/SVICounty.csv", function(data) {

  // X scale
  // var color = d3.scale.ordinal()
  //   .range(["#EDC951","#CC333F","#00A0B0"]);

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
    .attr("class","circular")
    .attr("fill", function (d){
      if(d.THEMES>0.75){
        return "#F94144";
      }
      if(d.THEMES<=0.75 && d.THEMES>0.5 ){
        return "#F8961E";
      }
      if(d.THEMES<=0.5 && d.THEMES>0.25){
        return "#F9C74F";
      }
      if(d.THEMES<=0.25){
        return "#43AA8B";
      }
    })
    .attr("d", d3.arc()     // imagine your doing a part of a donut plot
      .innerRadius(innerRadius)
      .outerRadius(function(d) { return y(d['THEMES']); })
      .startAngle(function(d) { return x(d.COUNTY); })
      .endAngle(function(d) { return x(d.COUNTY) + x.bandwidth()  ; })
      .padAngle(0.01)
      .padRadius(innerRadius))

    .on('mouseover', mouseover)
    .on('mousemove', mousemove)
    .on('mouseout', mouseout)
    .on('click', function (d){

 d3.csv("assets/data/County Info.csv", function(info) {
   let ind;
   console.log(info)
   for(let i=0;i<info.length;i++){
     if(d.COUNTY === info[i].County){
       ind=i;
     }
   }
   // low level of vulnerability low to moderate level of vulnerability  a moderate to high level of vulnerability high level of vulnerability.
   d3.select(".circular-chart").select(".row").select('#radar-chart').selectAll('div').select('h5').select('#county-name').text(info[ind].County)
   d3.select(".circular-chart").select(".row").select('#radar-chart').select('a').text("Explore SVI data for "+ info[ind].County + " County")
   d3.select(".circular-chart").select(".row").select('h2').text("County Information")
   d3.select(".circular-chart").select(".row").select('#radar-chart').selectAll('div').select('h5').select('#county-vulnerability').text(function (){
     if(d.THEMES>0.75){
       return "High level of vulnerability";
     }
     if(d.THEMES<=0.75 && d.THEMES>0.5 ){
       return "Moderate to high level of vulnerability";
     }
     if(d.THEMES<=0.5 && d.THEMES>0.25){
       return "Low to moderate level of vulnerability";
     }
     if(d.THEMES<=0.25){
       return "Low level of vulnerability";
     }
     })
   d3.select(".circular-chart").select(".row").select('#radar-chart').selectAll('div').selectAll('h5').select('span')
     .style('color', function (){
       if(d.THEMES>0.75){
         return "#F94144";
       }
       if(d.THEMES<=0.75 && d.THEMES>0.5 ){
         return "#F8961E";
       }
       if(d.THEMES<=0.5 && d.THEMES>0.25){
         return "#F9C74F";
       }
       if(d.THEMES<=0.25){
         return "#43AA8B";
       }
     })
    })
      radar(d.COUNTY);
      reset();
      d3.select(this)
        .attr('fill','#00e6ff')
    });


  var div = d3.select(".circular-chart").select(".row").select("#circular-chart").append('div')
    .attr('class', 'tooltip2')
    .style('display', 'none');
  function mouseover(){
    div.style('display', 'inline');
    d3.select(this)
      .transition().duration(200)
      .style("fill-opacity", 0.5)
  }
  function mousemove(){
    var d = d3.select(this).data()[0]
    div
      .html("County: " + d.COUNTY + '<hr/>' + "SVI: " + d.THEMES)
      .style('left', (d3.event.pageX - 24) + 'px')
      .style('top', (d3.event.pageY - 10) + 'px');
  }
  function mouseout(){
    div.style('display', 'none');
    d3.select(this)
      .transition().duration(200)
      .style("fill-opacity", 1)
  }
function reset(){
  d3.selectAll('.circular')
.attr("fill", function (data){
    if(data.THEMES>0.75){
      return "#F94144";
    }
    if(data.THEMES<=0.75 && data.THEMES>0.5 ){
      return "#F8961E";
    }
    if(data.THEMES<=0.5 && data.THEMES>0.25){
      return "#F9C74F";
    }
    if(data.THEMES<=0.25){
      return "#43AA8B";
    }
  })
}
});
