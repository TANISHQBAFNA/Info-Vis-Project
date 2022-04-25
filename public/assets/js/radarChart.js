function RadarChart(id, data, options) {
  var cfg = {
    w: 400,				//Width of the circle
    h: 400,				//Height of the circle
    margin: {top: 0, right: 20, bottom: 20, left: 20}, //The margins of the SVG
    levels: 3,				//How many levels or inner circles should there be drawn
    maxValue: 1,
    minValue: 0,//What is the value that the biggest circle will represent
    labelFactor: 1.25, 	//How much farther than the radius of the outer circle should the labels be placed
    wrapWidth: 50, 		//The number of pixels after which a label needs to be given a new line
    opacityArea: 0.35, 	//The opacity of the area of the blob
    dotRadius: 6, 			//The size of the colored circles of each blog
    opacityCircles: 0.1, 	//The opacity of the circles of each blob
    strokeWidth: 2, 		//The width of the stroke around each blob
    roundStrokes: false,	//If true the area and stroke will follow a round path (cardinal-closed)
  };

  //Put all of the options into a variable called cfg
  if('undefined' !== typeof options){
    for(var i in options){
      if('undefined' !== typeof options[i]){ cfg[i] = options[i]; }
    }//for i
  }//if

  //If the supplied maxValue is smaller than the actual one, replace by the max in the data
  var maxValue = Math.max(cfg.maxValue, d3.max(data, function(i){return d3.max(i.map(function(o){return o.value;}))}));

  var allAxis = (data[0].map(function(i, j){return i.axis})),	//Names of each axis
    total = allAxis.length,					//The number of different axes
    radius = Math.min(cfg.w/2, cfg.h/2), 	//Radius of the outermost circle	    //Percentage formatting
    angleSlice = Math.PI * 2 / total;		//The width in radians of each "slice"

  //Scale for the radius
  var rScale = d3.scale.linear()
    .range([0, radius])
    .domain([0, 1]);


  //Remove whatever chart with the same id/class was present before
  d3.select("body").select('.circular-chart').select('.row').select('#radar-chart').select("svg").remove();

  //Initiate the radar chart SVG
  var svg = d3.select("body").select('.circular-chart').select('.row').select('#radar-chart').append("svg")
    .attr("width",  cfg.w + cfg.margin.left + cfg.margin.right)
    .attr("height", cfg.h + cfg.margin.top + cfg.margin.bottom)
    .attr("class", "radar"+id);
  //Append a g element
  var g = svg.append("g")
    .attr("transform", "translate(" + (cfg.w/2 + cfg.margin.left) + "," + (cfg.h/2 + cfg.margin.top) + ")");


  //Filter for the outside glow
  var filter = g.append('defs').append('filter').attr('id','glow'),
    feMerge = filter.append('feMerge'),
    feMergeNode_1 = feMerge.append('feMergeNode').attr('in','coloredBlur'),
    feMergeNode_2 = feMerge.append('feMergeNode').attr('in','SourceGraphic');


  //Wrapper for the grid & axes
  var axisGrid = g.append("g").attr("class", "axisWrapper");

  //Draw the background circles
  axisGrid.selectAll(".levels")
    .data(d3.range(1,(cfg.levels+1)).reverse())
    .enter()
    .append("circle")
    .attr("class", "gridCircle")
    .attr("r", function(d, i){return radius/cfg.levels*d;})
    .style("fill", "#CDCDCD")
    .style("stroke", "#CDCDCD")
    .style("fill-opacity", cfg.opacityCircles)
    .style("filter" , "url(#glow)");


  //Create the straight lines radiating outward from the center
  var axis = axisGrid.selectAll(".axis")
    .data(allAxis)
    .enter()
    .append("g")
    .attr("class", "axis");
  //Append the lines
  axis.append("line")
    .attr("x1", 0)
    .attr("y1", 0)
    .attr("x2", function(d, i){ return rScale(maxValue*1.1) * Math.cos(angleSlice*i - Math.PI/2); })
    .attr("y2", function(d, i){ return rScale(maxValue*1.1) * Math.sin(angleSlice*i - Math.PI/2); })
    .attr("class", "line")
    .style("stroke", "white")
    .style("stroke-width", "2px");

  //Append the labels at each axis
  axis.append("text")
    .attr("class", "legend")
    .style("font-size", function (d){
      if (d === 'SVI')
      {
        return '20px';
      }
      else{
        return '14px';
      }
    } )
    .attr("text-anchor", "middle")
    .attr("dy", "0.45em")
    .attr("x", function(d, i){ return rScale(maxValue * cfg.labelFactor) * Math.cos(angleSlice*i - Math.PI/2); })
    .attr("y", function(d, i){ return rScale(maxValue * cfg.labelFactor) * Math.sin(angleSlice*i - Math.PI/2); })
    .text(function(d){return d});


  //The radial line function
  var radarLine = d3.svg.line.radial()
    .interpolate("linear-closed")
    .radius(function(d) { return rScale(d.value); })
    .angle(function(d,i) {	return i*angleSlice; });

  if(cfg.roundStrokes) {
    radarLine.interpolate("cardinal-closed");
  }

  //Create a wrapper for the blobs
  var blobWrapper = g.selectAll(".radarWrapper")
    .data(data)
    .enter().append("g")
    .attr("class", "radarWrapper");

  //Append the backgrounds
  blobWrapper
    .append("path")
    .attr("class", "radarArea")
    .attr("d", function(d) { return radarLine(d); })
    .style("fill", function(d) {
      if (d[0].value > 0.75) {
        return '#F94144';
      }
      if(d[0].value<=0.75 && d[0].value >0.5 ){
        return "#F8961E";
      }
      if(d[0].value<=0.5 && d[0].value>0.25){
        return "#F9C74F";
      }
      if(d[0].value<=0.25){
        return "#43AA8B";
      }
      // return cfg.color(d);
    })
    .style("fill-opacity", 0.4)
    .on('mouseover', function (d,i){
      //Dim all blobs
      d3.selectAll(".radarArea")
        .transition().duration(200)
        .style("fill-opacity", 0.5);
      //Bring back the hovered over blob
      d3.select(this)
        .transition().duration(200)
        .style("fill-opacity", 0.5);
    })
    .on('mouseout', function(){
      //Bring back all blobs
      d3.selectAll(".radarArea")
        .transition().duration(200)
        .style("fill-opacity", cfg.opacityArea);
    });

  //Create the outlines
  blobWrapper.append("path")
    .attr("class", "radarStroke")
    .attr("d", function(d,i) { return radarLine(d); })
    .style("stroke-width", cfg.strokeWidth + "px")
    .style("stroke", function(d) {
      if (d[0].value > 0.75) {
      return '#F94144';
    }
      if(d[0].value<=0.75 && d[0].value >0.5 ){
        return "#F8961E";
      }
      if(d[0].value<=0.5 && d[0].value>0.25){
        return "#F9C74F";
      }
      if(d[0].value<=0.25){
        return "#43AA8B";
      } })
    .style("fill", "none")
    .style("filter" , "url(#glow)");

  //Append the circles
  blobWrapper.selectAll(".radarCircle")
    .data(function(d,i) { return d; })
    .enter().append("circle")
    .attr("class", "radarCircle")
    .attr("r", function (d){
      if (d.axis === 'SVI') {
        return '10px';
      }
        else{
          return cfg.dotRadius;
        }
    })
    .attr("cx", function(d,i){ return rScale(d.value) * Math.cos(angleSlice*i - Math.PI/2); })
    .attr("cy", function(d,i){ return rScale(d.value) * Math.sin(angleSlice*i - Math.PI/2); })
    .style("fill", function(d,i,j) {
      if (d.axis === 'SVI') {
        return '#08cce0';
      }
      else{
        return '#4D908E';
      }
     })
    .style("fill-opacity", 1);


  //Wrapper for the invisible circles on top
  var blobCircleWrapper = g.selectAll(".radarCircleWrapper")
    .data(data)
    .enter().append("g")
    .attr("class", "radarCircleWrapper");

  //Append a set of invisible circles on top for the mouseover pop-up
  blobCircleWrapper.selectAll(".radarInvisibleCircle")
    .data(function(d,i) { return d; })
    .enter().append("circle")
    .attr("class", "radarInvisibleCircle")
    .attr("r", cfg.dotRadius*1.5)
    .attr("cx", function(d,i){ return rScale(d.value) * Math.cos(angleSlice*i - Math.PI/2); })
    .attr("cy", function(d,i){ return rScale(d.value) * Math.sin(angleSlice*i - Math.PI/2); })
    .style("fill", "none")
    .style("pointer-events", "all")
    .on("mouseover", function(d,i) {
      newX =  parseFloat(d3.select(this).attr('cx')) ;
      newY =  parseFloat(d3.select(this).attr('cy')) ;

      tooltip
        .attr('x', newX)
        .attr('y', newY)
        .text(d.value)
        .transition().duration(200)
        .style('opacity', 1);
    })
    .on("mouseout", function(){
      tooltip.transition().duration(200)
        .style("opacity", 1);
    });

  //Set up the small tooltip for when you hover over a circle
  var tooltip = g.append("text")
    .attr("class", "tooltip")
    .style("opacity", 0);

}
