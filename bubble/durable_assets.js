var gui = new dat.GUI();

var dat_gui_ranges = {
  scale                 : [0.01, 3],
  w                     : [0, 1200],
  h                     : [0, 1200],
  t_margin              : [0, 100],
  r_margin              : [0, 100],
  b_margin              : [0, 100],
  l_margin              : [0, 100],
  tick_length           : [0, 20],
  h_shift               : [0, 20],
  y_axis_fontsize       : [0, 20],
  x_axis_font_rotation  : [0, 360],
  max_bubble_rad        : [1,100],
  bubble_alpha          : [0,1],
}

//put all hard coded values in this object
var params = {
  scale: 2,
  w: 400,
  h: 400,
  t_margin: 50,
  r_margin: 50,
  b_margin: 50,
  l_margin: 50,

  bar_width: 50,
  tick_length: 7,

  x_axis_color: "gray",
  x_axis_fontcolor: "gray",
  x_axis_fontsize: 10,
  x_axis_font_rotation: 320,

  y_axis_color: "gray",
  y_axis_fontcolor: "gray",
  y_axis_fontsize: 10,
  max_bubble_rad: 22,
  bubble_alpha: 0.85,
  bubble_color: "black",
  h_shift: 0,
  //just to store for redraw
  viz_data: [],
};

function left_boundary() { return params.l_margin; }
function right_boundary() { return params.w * params.scale - params.r_margin; }
function top_boundary() { return params.t_margin; }
function bottom_boundary() { return params.h * params.scale - params.b_margin; }
function h_shift(s_type) {return s_type.indexOf("Undergraduate") === -1 ? params.h_shift : params.h_shift * -1 }

function pf(num) {
  if(typeof(num) === 'number') {
    return num;
  } else {
    return parseFloat(num.replace(",", ""));
  }
}

function init_viz_element(svg, elem_with_class, data) {
  var elem_parts = elem_with_class.split(".");
  var elem = elem_parts[0];
  var elem_class = elem_parts[1];

  var viz_element = svg.selectAll(elem_with_class).data(data);
  viz_element.enter().append(elem).attr("class", elem_class);
  viz_element.exit().remove();

  return viz_element;
}

function draw(data) {
  // TODO: should probably fix the data before calling the draw method
  //store things for next draw iteration
  params.viz_data = data;
  //"#486135", "#2C6E3E", "#89AC6E", "#B5C8A0"
  var color_list = ["#224970", "#6BA2DB", "#A0C3E8", "#E3EBF5",  "#B99F69", "#D9955E", "#E3AD65", "#EFD299"]
  var headers = d3.keys(data[0]); 		//alert(headers); 
  //var categories = headers.slice(1); 		alert(categories.toSource());

  var max_x_val = 2300; // replace with actual value from data
  //var max_y_val = 1; // replace with actual value from data
  var max_y_val = 20; // replace with actual value from data
  var max_r_val = 2000;// replace with actual value from data

  // alert(data.toSource());
  //
  // var formatted_data = []; //format should be [{s_type: X, e_type: Y, amount: Z}..]
  // data.forEach(function(data_row, i){
  // 	d3.entries(data_row).slice(1).forEach(function(category_entry){
  // 		formatted_data.push({m_earnings: pf(med_ear_male), f_earnings: pf(med_ear_female) , jobs: pf(total_jobs), color:color_list[i]});
  // 	});
  // });
  //
  // alert(formatted_data.toSource());
  //preparing SVG Area
  var svg = d3.selectAll("svg");
  svg.
    attr("height", function(d,i) {return params.h * params.scale}).
    attr("width", function(d) {return params.w * params.scale}).
    attr("fill", 'green');

  var x = d3.scale.linear().domain([0, max_x_val]).range([left_boundary(), right_boundary() ]);
  var y = d3.scale.linear().domain([0, max_y_val]).range([bottom_boundary(), top_boundary() ]);
  var r = d3.scale.linear().domain([0, Math.sqrt(max_r_val)]).range([0, params.max_bubble_rad]);
  //var color = d3.scale.linear().domain([0,50,100]).range(["#C4592D","#919496", "#0F5577"]);
  //var color = d3.scale.linear().domain([0,50,100]).range(["#EA7F2F","#919496", "#41BADC"]);
  var color = d3.scale.linear().domain([0,50,100]).range(["#EA7F2F","#EEE", "#41BADC"]);

  // Show as table
  var columns = ['durable_asset_id', 'candidate_name', 'party', 'acquisition_amount', 'disposition_amount', 'amount_difference', 'percentage_lost', 'depreciation_per_day'];
  var table = d3.select("#table-container").append("table"),
  thead = table.append("thead"),
  tbody = table.append("tbody");

  thead.append("tr")
  .selectAll("th")
  .data(columns)
  .enter()
  .append("th")
  .text(function(column) { return column; });

  var tr = tbody.selectAll("tr")
  .data(data)
  .enter().append("tr");
  var td = tr.selectAll("td")
  .data(function(row) {
    return columns.map(function(column) {
      return {column: column, value: row[column]};
    })
  })
  .enter().append("td")
  .text(function(d) { return d.value; });

  //------ data Bubbles -------------------------------------------------------------------
  //console.log('data is ' + data);
  //debugger;
  var data_bubbles = init_viz_element(svg, "circle.expenditure", data)
  .attr("r", function(d) { return r(Math.sqrt(pf(d.acquisition_amount))); })
  .attr("cx", function(d) { return x(pf(d.days_held)); })
  .attr("cy", function(d) { return y(pf(d.depreciation_per_day)); })
  .attr("fill", function(d) { return color(10); })
  .attr("occ", function(d) { return "type"; })

  //.attr("stroke", function(d) { return "#BBB"; })
  //.attr("fill-opacity", params.bubble_alpha);
  //------ data Bubbles end -------------------------------------------------------------------

  //------ x Axis -------------------------------------------------------------------
  var xaxis = init_viz_element(svg, "line.xaxis", ["dummy_data"])
  .attr("y1", bottom_boundary())
  .attr("y2", bottom_boundary())
  .attr("x1", function(d) {return left_boundary()})
  .attr("x2", function(d) {return right_boundary()})
  .attr("stroke", params.x_axis_color);

  var xticks = init_viz_element(svg, "line.xtick", x.ticks(10))
  .attr("y1", bottom_boundary())
  .attr("y2", bottom_boundary() + params.tick_length )
  .attr("x1", function(d) {return x(d)})
  .attr("x2", function(d) {return x(d)})
  .attr("stroke", params.x_axis_color);

  var xtick_labels = init_viz_element(svg, "text.xtick_label", x.ticks(10))
  .attr("x", function(d) { return x(d)})
  .attr("y", bottom_boundary())
  .attr("fill", params.x_axis_fontcolor)
  .attr("font-size", params.x_axis_fontsize+"px")
  .attr("transform", function(d) {return "rotate("+params.x_axis_font_rotation +" "+ (x(d)+params.tick_length*4).toString() + "," + bottom_boundary() + ")"; })
  .attr("text-anchor", "end")
  .text(function(d) {return d; });

  //------ x Axis End -------------------------------------------------------------------


  //------ y Axis -------------------------------------------------------------------
  var yaxis = init_viz_element(svg, "line.yaxis", ["dummy_data"])
  .attr("x1", left_boundary())
  .attr("x2", left_boundary())
  .attr("y1", function(d) {return top_boundary()})
  .attr("y2", function(d) {return bottom_boundary()})
  .attr("stroke", params.y_axis_color);

  var yticks = init_viz_element(svg, "line.ytick", y.ticks(10))
  .attr("y1", function(d) {return y(d)})
  .attr("y2", function(d) {return y(d)})		
  .attr("x1", left_boundary() - params.tick_length)
  .attr("x2", left_boundary() )
  .attr("stroke", params.y_axis_color);

  var ytick_labels = init_viz_element(svg, "text.ytick_label", y.ticks(10))
  .attr("y", function(d) { return y(d) + (params.y_axis_fontsize / 3.5)})
  .attr("x", left_boundary() - params.tick_length * 1.5)
  .attr("fill", params.y_axis_fontcolor)
  .attr("font-size", params.y_axis_fontsize+"px")
  .attr("text-anchor", "end")
  .text(function(d) {return d; });

  //------ y Axis End -------------------------------------------------------------------

}



//read data once and start do initial draw
//d3.csv("mf_earnings_data.csv", draw);
d3.json("durable_assets.json", function(data) {
  // Fix data records
  // Add fields: date_acquired, date_disposed (from the two dates)
  // Keep fields: Candidate Name, Vender Name, method (as disposition_method)

  // Do calculations on data
  // days_held: number of days between date_acquired and date_disposed
  // percentage_lost: (acquisition_amount-disposition_amount)/acquisition_amount


  // Combine rows with matching 'durable_asset_id' (throw out records without matching buy and sell)
  var buy_records = data.filter(function(d) { return d.amount !== undefined });
  // Note: disposition spelled as diposition
  var sell_records = data.filter(function(d) { return d.diposition_amount !== undefined });
  window.buy_records = buy_records;
  window.sell_records = sell_records;
  var full_records_with_empty = buy_records.map(function(buy_record) {
    var sell_record = sell_records.filter(function(d) { return d.durable_asset_id === buy_record.durable_asset_id })[0];
    if(sell_record === undefined) {
      return undefined;
    }
    // TODO: move into function
    // TODO: do advanced calculation based on fixed data
    var millisInDay = 86400000;
    var start_millis = Date.parse(buy_record.date);
    var end_millis = Date.parse(sell_record.date);
    var days_held = (end_millis - start_millis) / millisInDay;
    var depreciation_per_day = (buy_record.amount - sell_record.diposition_amount) / days_held;
    return {
      durable_asset_id: buy_record.durable_asset_id,
      candidate_name: buy_record.candidate_name,
      party: buy_record.party,
      acquisition_amount: buy_record.amount,
      disposition_amount: sell_record.diposition_amount,
      amount_difference: buy_record.amount - sell_record.diposition_amount,
      percentage_lost: (buy_record.amount - sell_record.diposition_amount)/buy_record.amount,
      depreciation_per_day: depreciation_per_day,
      days_held: days_held
    };
  });
  var full_records = full_records_with_empty.filter(function(d) { return d !== undefined });
  window.full_records = full_records;

  draw(full_records);
});

//all dat.gui changes should trigger a redraw
// generate the dat.gui control for any numerical ranges
d3.entries(dat_gui_ranges).forEach(function(elem) {
  var attr = elem.key;
  var range = elem.value;
  gui.add(params, attr, range[0], range[1]).onChange(function() { draw(params.viz_data); });
} );

//add color or custom controls here
