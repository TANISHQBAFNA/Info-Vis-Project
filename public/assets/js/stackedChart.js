currentWidth = parseInt(d3.select('#stacked-chart ').style('width'), 10)
currentheight = parseInt(d3.select('.stacked-chart ').style('height'), 10)
var parseTime = d3.timeParse("%d-%m-%Y");

function type(d, _, columns) {
    d.date = parseTime(d.date);
    for (var i = 1, n = columns.length, c; i < n; ++i) d[c = columns[i]] = +d[c];
    return d;
}


var margin = {top: 150, right: 230, bottom: 50, left: 50},
    width = currentWidth - margin.left - margin.right,
    height = currentheight - margin.top - margin.bottom;


var svg = d3.select('body').select(".stacked-chart").select(".row").select('#stacked-chart')
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform",
        "translate(" + margin.left + "," + margin.top + ")");

// Read the data
d3.csv("assets/data/SVI-Top5-DailyCovidCases.csv",type, function(data) {

    // List of groups = header of the csv files
    var keys = data.columns.slice(1)

    var color = d3.scaleOrdinal()
        .domain(keys)
        .range(["#fbd8c6","#f5b295","#e88b6f","#d45d4e","#67001f"]);

    var stackedData = d3.stack()
        .keys(keys)
        (data)

    // Add X axis
    var x = d3.scaleTime()
        .domain([new Date("2020-03-17"), new Date("2022-04-02")])
        .range([ 0, width ]);
    var xAxis = svg.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x).ticks(5))

    // Add X axis label:
    svg.append("text")
        .attr("text-anchor", "end")
        .attr("x", width)
        .attr("y", height+40 )
        .text("Date");

    // Add Y axis label:
    svg.append("text")
        .attr("text-anchor", "end")
        .attr("x", 0)
        .attr("y", -20 )
        .text("Total Number of COVID Cases by County")
        .attr("text-anchor", "start")

    // Add Y axis
    var y = d3.scaleLinear()
        .domain([0, 1800])
        .range([ height, 0 ]);
    svg.append("g")
        .call(d3.axisLeft(y).ticks(5))


    // ClipPath
    var clip = svg.append("defs").append("svg:clipPath")
        .attr("id", "clip")
        .append("svg:rect")
        .attr("width", width )
        .attr("height", height )
        .attr("x", 0)
        .attr("y", 0);

    // Add brushing
    var brush = d3.brushX()
        .extent( [ [0,0], [width,height] ] )
        .on("end", updateChart)

    var areaChart = svg.append('g')
        .attr("clip-path", "url(#clip)")

    // Area generator
    var area = d3.area()
        .x(function(d) { return x(d.data.date); })
        .y0(function(d) { return y(d[0]); })
        .y1(function(d) { return y(d[1]); })

    areaChart
        .selectAll("mylayers")
        .data(stackedData)
        .enter()
        .append("path")
        .attr("class", function(d) { return "myArea " + d.key })
        .style("fill", function(d) { return color(d.key); })
        .attr("d", area)

    // Add the brushing
    areaChart
        .append("g")
        .attr("class", "brush")
        .call(brush);

    var idleTimeout
    function idled() { idleTimeout = null; }

    // Updates chart based on boundaries
    function updateChart() {

        extent = d3.event.selection

        // If no selection, back to initial coordinate. Otherwise, update X axis domain
        if(!extent){
            if (!idleTimeout) return idleTimeout = setTimeout(idled, 350); // This allows to wait a little bit
            x.domain(d3.extent(data, function(d) { return d.date; }))
        }else{
            x.domain([ x.invert(extent[0]), x.invert(extent[1]) ])
            areaChart.select(".brush").call(brush.move, null) // This remove the grey brush area as soon as the selection has been done
        }

        // Update axis and area position
        xAxis.transition().duration(1000).call(d3.axisBottom(x).ticks(5))
        areaChart
            .selectAll("path")
            .transition().duration(1000)
            .attr("d", area)
    }
    var highlight = function(d){
        console.log(d)
        // reduce opacity of all groups
        d3.selectAll(".myArea").style("opacity", .1)
        // expect the one that is hovered
        d3.select("."+d).style("opacity", 1)
    }

    // And when it is not hovered anymore
    var noHighlight = function(d){
        d3.selectAll(".myArea").style("opacity", 1)
    }

    //Legend
    var size = 20
    svg.selectAll("myrect")
        .data(keys)
        .enter()
        .append("rect")
        .attr("x", 500)
        .attr("y", function(d,i){ return 10 + i*(size+5)})
        .attr("width", size)
        .attr("height", size)
        .style("fill", function(d){ return color(d)})
        .on("mouseover", highlight)
        .on("mouseleave", noHighlight)

    svg.selectAll("mylabels")
        .data(keys)
        .enter()
        .append("text")
        .attr("x", 500 + size*1.2)
        .attr("y", function(d,i){ return 10 + i*(size+5) + (size/2)})
        .style("fill", "black")
        .text(function(d){ return d})
        .attr("text-anchor", "left")
        .style("alignment-baseline", "middle")
        .on("mouseover", highlight)
        .on("mouseleave", noHighlight)
})
