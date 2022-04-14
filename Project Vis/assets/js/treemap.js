currentwidth2 = parseInt(d3.select('#tree-map').style('width'), 10)
currentHeight2 = parseInt(d3.select('.tree-map').style('height'), 10)
var url = 'assets/data/SVICategory.json';
d3.json(url, function(data) {
  var width = currentwidth2,
    height = currentHeight2,
    nodeRadius = 10;

  var svg = d3.select('body').select(".tree-map").select(".row").select('#tree-map')
    .append('svg')
    .attrs({
      width: width,
      height: height
    });

  var radius = width;
  var mainGroup = svg.append('g')
    .attr("transform", "translate(" + width/2.7 + "," + height/2.1 + ")");

  var cluster = d3.cluster()
    .size([180, width/4.5]);
  //  assigns the data to a hierarchy using parent-child relationships
  var root = d3.hierarchy(data, function(d) {
    return d.children;
  });

  cluster(root);

  var linksGenerator = d3.linkRadial()
    .angle(function(d) { return d.x / 180 * Math.PI; })
    .radius(function(d) { return d.y + 12; });

  mainGroup.selectAll('path')
    .data(root.links())
    .enter()
    .append('path')
    .attrs({
      d: linksGenerator,
      fill: 'none',
      stroke: '#b4b4b4',
    });

  var nodes = mainGroup.selectAll("g")
    .data(root.descendants())
    .enter()
    .append("g")
    .attr("transform", function(d) {
      return "rotate(" + (d.x - 90) + ")translate(" + (d.y + 12 )+  ")";
    });

  nodes.append("circle")
    .attrs({
      r: function (d){
        if(d.data.name === 'Social Vulnerability Index (SVI)')
        {
          return '22px';
        }
        if(d.data.name === 'Socioeconomic' || d.data.name === 'Household Composition & Disability' || d.data.name === 'Minority Status & language' || d.data.name === 'Housing Type & Transportation')
        {
          return '14px';
        }
        else{
          return nodeRadius;
        }
      },
      fill: function (d){
        if(d.data.name === 'Social Vulnerability Index (SVI)')
        {
          return '#43AA8B';
        }
        if(d.data.name === 'Socioeconomic' || d.data.name === 'Household Composition & Disability' || d.data.name === 'Minority Status & language' || d.data.name === 'Housing Type & Transportation')
        {
          return '#F9C74F';
        }
        else{
          return '#F94144';
        }
      },
    })
    .on('mouseover', mouseover)
    .on('mousemove', mousemove)
    .on('mouseout', mouseout);

  var div =d3.select('body').select(".tree-map").select(".row").select('#tree-map').append('div')
    .attr('class', 'tooltip2')
    .style('display', 'none')

  function mouseover(){
    div.style('display', 'inline');
    d3.select(this)
      .transition().duration(200)
      .style("fill", function (d){
        if(d.data.name === 'Social Vulnerability Index (SVI)')
        {
          return '#235949';
        }
        if(d.data.name === 'Socioeconomic' || d.data.name === 'Household Composition & Disability' || d.data.name === 'Minority Status & language' || d.data.name === 'Housing Type & Transportation')
        {
          return '#dcaf47';
        }
        else{
          return '#8f2829';
        }
      })
  }
  function mousemove(){
    var d = d3.select(this).data()[0]
    div
      .html(d.data.name)
      .style('left', (d3.event.pageX - 24) + 'px')
      .style('top', (d3.event.pageY - 10) + 'px');
  }
  function mouseout(){
    div.style('display', 'none');
    d3.select(this)
      .transition().duration(200)
      .style("fill", function (d){
        if(d.data.name === 'Social Vulnerability Index (SVI)')
        {
          return '#43AA8B';
        }
        if(d.data.name === 'Socioeconomic' || d.data.name === 'Household Composition & Disability' || d.data.name === 'Minority Status & language' || d.data.name === 'Housing Type & Transportation')
        {
          return '#F9C74F';
        }
        else{
          return '#F94144';
        }
      })
  }

  nodes.append("text")
    .attr("dy", function(d){
      if(d.data.colname === 'level1')
      {
        return "0.5em";
      }
      if(d.data.colname === 'level2')
      {
        return "4em";
      }
      else{
        return '0.5em';
      }
    })
    .attr("dx",  function(d) {
      if (d.data.colname === 'level1') {
        return "-16.5em";
      }
      if(d.data.colname === 'level2')
      {
        if(d.data.name === 'Household Composition & Disability' ){
          return "-3.5em";
        }
        if ( d.data.name === 'Housing Type & Transportation'){
          return "-6.5em";
        }
        else {
          return "-2.5em";
        }
      }
      else {
        return '1em';
      }
    })
    .attr("x", function(d) { return d.x < 180 === !d.children ? 6 : -6; })
    .attr("transform", function(d) {
      if(d.data.colname === 'level2')
      {
          return "rotate(25)";
        }
      return "rotate(1)";
    })
    .style('font-size',function (d) {
      if (d.data.colname === 'level1') {
        return "16px";
      }
      else { return '11px';}
    })
    .text(function(d) { return d.data.name; });

});
