class BubbleChart {
  constructor(data) {
    this.create_nodes = this.create_nodes.bind(this);
    this.kill_forces = this.kill_forces.bind(this);
    this.update_data = this.update_data.bind(this);
    this.create_vis = this.create_vis.bind(this);
    this.create_circles = this.create_circles.bind(this);
    this.do_create_circles = this.do_create_circles.bind(this);
    this.display_group_all = this.display_group_all.bind(this);
    this.move_towards_center = this.move_towards_center.bind(this);
    this.show_viz_type = this.show_viz_type.bind(this);
    this.do_split = this.do_split.bind(this);
    this.format_money_millions = this.format_money_millions.bind(this);
    this.move_towards_candidates = this.move_towards_candidates.bind(this);
    this.move_to_location_map = this.move_to_location_map.bind(this);
    this.get_supercategory = this.get_supercategory.bind(this);
    this.get_candidate_short_name = this.get_candidate_short_name.bind(this);
    this.estimate_circle_diameter = this.estimate_circle_diameter.bind(this);
    this.move_towards_year = this.move_towards_year.bind(this);
    this.show_details = this.show_details.bind(this);
    this.hide_details = this.hide_details.bind(this);
    this.render_modal = this.render_modal.bind(this);
    this.update_modal = this.update_modal.bind(this);
    this.update_modal_center = this.update_modal_center.bind(this);
    this.size_legend_init = this.size_legend_init.bind(this);
    this.data = data;
    this.width = 1350;
    this.height = 3500;
    window.width = this.width;
    window.height = this.height;

    this.tooltip = CustomTooltip("expenditure_tooltip", 300);

    // used when setting up force and
    // moving around nodes
    this.damper = 0.1;

    // these will be set in create_nodes and create_vis
    this.vis = null;
    this.nodes = [];
    this.forces = [];
    this.circles = null;

    // use the max total_amount in the data as the max in the scale's domain
    //max_amount = d3.max(@data, (d) -> parseInt(d.amount))
    // We hard-code the max amount so it's consistent across the years
    const max_amount = 1173620 * 2.21;
    this.radius_scale = d3.scale.pow().exponent(0.5).domain([0, max_amount]).range([2, 85]);

    this.create_nodes(this.data);
    this.create_vis();
    this.initialize_candidate_autocomplete();
  }

  // create node objects from original data
  // that will serve as the data behind each
  // bubble in the vis, then add each node
  // to @nodes to be used later
  create_nodes(data) {
    this.nodes = [];
    data.forEach(d => {
      const value = parseFloat(d.amount);
      const node = {
        id: d.id,
        radius: this.radius_scale(value),
        value,
        name: d.candidate_name,
        org: 'org',
        group: 'group',
        party: d.party,
        reg_no: d.reg_no,
        category: d.expenditure_category,
        super_category: this.get_supercategory(d.expenditure_category),
        office: d.office,
        district: d.district,
        election_period: d.election_period,
        election_year: d.election_period.split('-')[1],
        x: Math.random() * 1,
        y: Math.random() * 800
      };
      const radius = this.radius_scale(value);
      if ((radius < 0) || isNaN(radius)) {
        console.log("Problem with radius for node:" + JSON.stringify(node));
      }
      return this.nodes.push(node);
    });

    this.nodes.sort((a, b) => b.value - a.value);
    return window.nodes = this.nodes;
  }

  // Stop forces and remove nodes
  kill_forces() {
    return this.forces.forEach(force => {
      force.stop();
      return force.nodes([]);
    });
  }

  update_data(records) {
    this.kill_forces();
    this.create_nodes(records);
    this.create_circles();

    let func = $('.viz_nav.btn.selected').data('name');
    if (func == null) { func = 'year'; }
    return this.show_viz_type(func);
  }


  // create svg at #vis and then
  // create circle representation for each node
  create_vis() {
    this.vis = d3.select("#vis").append("svg")
      .attr("width", this.width)
      .attr("height", this.height)
      .attr("id", "svg_vis");
    window.viz = this.vis;

    return this.create_circles();
  }

  create_circles() {
    this.circles = this.vis.selectAll("circle")
      .data(this.nodes, d => d.id);
    return this.do_create_circles(this.circles);
  }

  do_create_circles(circles) {
    // used because we need 'this' in the 
    // mouse callbacks
    const that = this;

    // radius will be set to 0 initially.
    // see transition below
    circles.enter().append("circle")
      .attr('class', d => `${this.get_supercategory(d.category)} ${d.reg_no}`)
      .attr("stroke-width", 2)
      .attr("id", d => `bubble_${d.id}`)
      .on("mouseover", function(d,i) {
        that.show_details(d,i,this);
        return that.circles
          .filter( circle => circle.reg_no !== d.reg_no )
          .transition().duration(1000)
          .style('opacity', 0.3);
    }).on("mouseout", function(d,i) {
        that.hide_details(d,i,this);
        return that.circles
          .transition().duration(1000)
          .style('opacity', 1);
        }).on("click", function(d,i) {
        const modal = $('#candidate_modal');
        const element = this;
        if (modal.is(':visible')) {
          return that.update_modal_center(d,i,element);
        } else {
          $(document).off('opened', '[data-reveal]');
          $(document).on('opened', '[data-reveal]', function() {
            console.log('modal callback');
            const callback_modal = $(this);
            // I don't understand why foundation doesn't have per-modal callbacks
            if (callback_modal.attr('id') === modal.attr('id')) {
              return that.render_modal(d,i,element);
            }
          });
          $(element).data('center', true);
          return modal.foundation('reveal', 'open');
        }
        }).attr("r", d => d.radius);

    return circles.exit().remove();
  }


  // Charge function that is called for each node.
  // Charge is proportional to the diameter of the
  // circle (which is stored in the radius attribute
  // of the circle's associated data.
  // This is done to allow for accurate collision 
  // detection with nodes of different sizes.
  // Charge is negative because we want nodes to 
  // repel.
  // Dividing by 8 scales down the charge to be
  // appropriate for the visualization dimensions.
  charge(d) {
    return -(Math.pow(d.radius, 2.0) / 7) + -(d.radius * 0.1) + -(.3);
  }

  // Display all nodes in one circle.
  display_group_all() {
    this.kill_forces();

    const force = d3.layout.force()
      .nodes(this.nodes)
      .size([this.width, this.height]);
    this.forces = [force];
    const radius = this.estimate_circle_diameter(this.nodes)/2;
    this.center = {x: this.width / 2, y: radius + 80};

    force.gravity(0)
      .theta(1.1)
      .charge(this.charge)
      .chargeDistance(Infinity)
      .friction(0.9)
      .on("tick", e => {
        return this.circles.each(this.move_towards_center(e.alpha))
          .attr("cx", d => d.x)
          .attr("cy", d => d.y);
    });
    force.start();

    const total_amount = d3.sum(this.nodes, d => d.value);
    const formatted_total = this.format_money_millions(total_amount);

    const center_label = [
      {text: 'Total Campaign Spending', class: 'header', dx: radius + 30, dy: 80},
      {text: formatted_total, class: 'amount', dx: radius + 30, dy: 100},
    ];

    // Remove old titles
    let titles = this.vis.selectAll('text.titles').remove();

    titles = this.vis.selectAll('text.titles')
      .data(center_label, d => d.text);

    titles.enter().append('text')
      .text( d => d.text)
      .attr('class', d => `titles year ${d.class}`)
      .attr('x', d => this.center.x + d.dx)
      .attr('y', d => this.center.y + d.dy);

    titles.exit().remove();
    return this.show_legend(radius);
  }

  // Moves all circles towards the @center
  // of the visualization
  move_towards_center(alpha) {
    return d => {
      d.x = d.x + ((this.center.x - d.x) * (this.damper + 0.02) * alpha);
      return d.y = d.y + ((this.center.y - d.y) * (this.damper + 0.02) * alpha);
    };
  }

  show_viz_type(func) {
    this.candidate_search_input().slideUp();
    this.show_all_candidates();
    this.hide_legend();

    if(func === 'candidate') {
      this.show_by_candidate();
    }
    if(func === 'party') {
      this.do_split(d => d.party);
    }
    if(func === 'expenditure') {
      const category_titles = {
        communication: 'Communication & Outreach',
        overhead: 'Overhead',
        staff: 'Staff & Professional Services',
        contributions: 'Contributions',
        fees: 'Taxes & Fees',
        other: 'Other'
      };

      const accessor = d => d.super_category;
      this.do_split(accessor, {
        charge: d => this.charge(d) * 1.3,
        title_accessor(category) { return category_titles[category]; }
      });
    }
    if(func === 'island') {
      this.do_split(d => candidate_utils.get_island(d));
    }
    if(func === 'office') {
      this.do_split(d => d.office);
    }
    if(func === 'year') {
      return this.display_group_all();
    }
  }

  candidate_search_input() {
    return this._candidate_search_input || $('.candidate_search_container input.autocomplete');
  }

  show_all_candidates() {
    this.circles
      .transition().duration(1000)
      .style('opacity', 1);
    return this.candidate_search_input().val('');
  }

  show_by_candidate(options) {
    if (options == null) { options = {}; }
    const accessor = d => d.name;
    this.candidate_search_input().slideDown();
    return this.do_split(accessor, options);
  }

  do_split(accessor, options) {
    if (options == null) { options = {}; }
    let location_map = this.move_to_location_map(this.nodes, accessor, options);
    if (options.modify_location_map != null) {
      location_map = options.modify_location_map(location_map);
    }
    const charge = (options.charge != null) ?
      options.charge
    :
      this.charge;

    this.kill_forces();
    this.forces = [];
    const force_map = location_map.keys().map(key => {
      const nodes = this.nodes.filter( d => key === accessor(d) );
      const force = d3.layout.force()
        .nodes(nodes)
        .size([this.width, this.height]);
      this.forces.push(force);
      return { force, key, nodes };
  });

    force_map.forEach(force => {
      const circles = this.vis.selectAll("circle")
        .filter( d => force.key === accessor(d) );
      force.force.gravity(0)
        .theta(1.0)
        .charge(charge)
        .chargeDistance(Infinity)
        .friction(0.87)
        .on("tick", e => {
          return circles.each(this.move_towards_candidates(e.alpha, location_map, accessor))
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);
      });
      return force.force.start();
    });

    // Remove old titles
    let titles = this.vis.selectAll('text.titles').remove();

    const title_accessor = (options.title_accessor != null) ?
      d => options.title_accessor(d.key)
    :
      d => d.key;
    titles = this.vis.selectAll('text.titles')
      .data(location_map.values(), d => d.key);

    //titles.enter().append('text')
    //  .text('CENTERS')
    //  .attr('text-anchor', 'middle')
    //  .attr('x', (d) -> d.x)
    //  .attr('y', (d) -> d.y)

    const padding = 55;

    const line_height = 20;
    const line_offset = (d, line_num) => d.y + d.radius + padding + (line_height*line_num);
    titles.enter().append('text')
      .attr("class", "titles header")
      .text(title_accessor)
      .attr("text-anchor", "middle")
      .attr('x', d => d.x)
      .attr('y', d => line_offset(d,0));

    titles.enter().append('text')
      .attr('class', 'titles amount')
      .text(d => this.format_money_millions(parseFloat(d.sum)))
      .attr('text-anchor', 'middle')
      .attr('x', d => d.x)
      .attr('y', d => line_offset(d,1));

    //# Debug info
    //titles.enter().append('text')
    //  .attr('class', 'titles amount')
    //  .text (d) => d.radius
    //  .attr('text-anchor', 'middle')
    //  .attr('x', (d) -> d.x)
    //  .attr('y', (d) -> line_offset(d,2))

    //titles.enter().append('text')
    //  .attr('class', 'titles candidate_names')
    //  .text (d) =>
    //    #d.candidates.slice(0, 3).join(', ')
    //    d.candidates.length
    //  .attr('text-anchor', 'middle')
    //  .attr('x', (d) -> d.x)
    //  .attr('y', (d) -> d.y + 260)

    return titles.exit().remove();
  }

  format_money_millions(amount_in_dollars) {
    const amount_in_millions = amount_in_dollars/1e6;
    if (amount_in_millions <= 0.01) {
      return "< $0.01 million";
    } else {
      return d3.format('$,.2f')(amount_in_millions) + ' million';
    }
  }

  // move all circles to be grouped by candidate
  // Move by alpha amount each time called
  move_towards_candidates(alpha, location_map, accessor) {
    return d => {
      const target = location_map.get(accessor(d));
      d.x = d.x + ((target.x - d.x) * (this.damper + 0.02) * alpha * 1.1);
      return d.y = d.y + ((target.y - d.y) * (this.damper + 0.02) * alpha * 1.1);
    };
  }


  // Creates grouping based on the grouping_func parameter and uses that to
  // compute groups and lay them out in a grid-based manner
  // AKA: Here lies black magic
  move_to_location_map(nodes, grouping_func, options) {
    let prev_radius;
    if (options == null) { options = {}; }
    const min_grouping_width = 300;
    const groupings_per_row = Math.floor(this.width / min_grouping_width) - 1;
    const min_grouping_height = 450;
    const get_width = i => {
      return ((i % groupings_per_row) + 1) * min_grouping_width;
    };
    const get_height = i => {
      const num_row = Math.floor(i / groupings_per_row) + 1;
      return (num_row * min_grouping_height) - 100;
    };
    const groups = d3.nest()
      .key( grouping_func )
      .rollup( leaves => {
        return {
          sum: d3.sum(leaves, d => parseFloat(d.value)),
          candidates: d3.set(leaves.map(this.get_candidate_short_name)).values(),
          radius: this.estimate_circle_diameter(leaves)/2
        };
      })
      .map(nodes, d3.map);

    const max_num_rows = 5;
    const padding = 30;
    const label_padding = 90;
    let col_num = (prev_radius = 0);
    let num_in_row = 1;
    const max_num_in_row = 6;
    // Push first row up
    let prev_y = -60;

    const sort = (options.sort != null) ?
      options.sort
    :
      (a, b) => d3.descending(
        parseFloat(groups.get(a).sum),
        parseFloat(groups.get(b).sum)
      );

    groups.keys().sort(sort).forEach((key, index) => {
      let y;
      const entry = groups.get(key);
      entry['key'] = key;

      if (col_num >= num_in_row) { col_num = 0; }
      if (col_num === 0) {
        const prev_num_in_row = num_in_row;
        while ((this.width/num_in_row) > ((entry.radius*2) + (padding*3))) {
          num_in_row += 1;
        }
        num_in_row -= 1;

        // Last row should be same num_in_row as the previous
        const num_left_in_layout = groups.keys().length - index;
        if (num_in_row > num_left_in_layout) {
          if (!(num_left_in_layout > (groups.keys().length - 1))) { num_in_row = prev_num_in_row; }
        }

        num_in_row = Math.min(max_num_in_row, num_in_row);
      }

      const min_width = (this.width/num_in_row);
      const x = (min_width * col_num) + (min_width/2);

      // Only calculate y for first column in row
      if (col_num === 0) {
        y = prev_y + prev_radius + entry.radius + (padding*2) + label_padding;
        prev_y = y;
        prev_radius = entry.radius;
      }

      y = prev_y;

      entry['x'] = x;
      entry['y'] = y;
      entry['radius'] = prev_radius;  //prev_radius is our radius for this row
      groups.set(key, entry);

      return col_num += 1;
    });
    return groups;
  }

  // Calculates class for data
  get_supercategory(category) {
    if (['Durable Assets', 'Food & Beverages', 'Insurance', 'Lease/Rent', 'Office Supplies', 'Travel & Lodging', 'Utilities', 'Vehicle'].includes(category)) {
      return 'overhead';
    } else if (['Contribution to Community Organization', 'Contribution to Political Party', 'Hawaii Election Campaign Fund'].includes(category)) {
      return 'contributions';
    } else if (['Advertising', 'Candidate Fundraiser Tickets', 'Postage/Mailing', 'Printing', 'Surveys, Polls & Voter Lists', 'Advertising, Media & Collateral Materials', 'Printing, Postage, Mailing & Freight', 'Surveys, Polls, Research & Voter Lists'].includes(category)) {
      return 'communication';
    } else if (['Employee Services', 'Professional Services', 'Contract, Employee & Professional Services'].includes(category)) {
      return 'staff';
    } else if (['Bank Charges & Adjustments', 'Filing Fee', 'Taxes'].includes(category)) {
      return 'fees';
    } else if (['Other'].includes(category)) {
      return 'other';
    } else {
      // console.log('category', category)
      return 'other';
    }
  }

  // Turn "Abercrombie, Neil" to "Abercrombie (D)"
  get_candidate_short_name(d) {
    return d.name.split(',')[0] + ` (${d.party[0]})`;
  }

  estimate_circle_diameter(nodes) {
    const area = d3.sum(nodes, d => Math.PI * Math.pow(d.radius, 2));
    const diameter = 2 * Math.sqrt(area/Math.PI);
    const estimated_diameter = ((Math.log(nodes.length)/140) + 1) * diameter;
    return estimated_diameter;
  }

  // move all circles to their associated @year_centers 
  move_towards_year(alpha) {
    return d => {
      const target = this.year_centers[d.election_period];
      d.x = d.x + ((target.x - d.x) * (this.damper + 0.02) * alpha * 1.1);
      return d.y = d.y + ((target.y - d.y) * (this.damper + 0.02) * alpha * 1.1);
    };
  }

  show_details(data, i, element) {
    d3.select(element).attr("stroke", "black");
    //console.log("charge is #{this.charge(data)} radius is: " + data.radius)
    let content = "<div class=\"inner_tooltip\">";
    content += `<span class=\"candidate\">${data.name}</span><br/>`;
    content += `<span class=\"office\">${data.election_year}, ${data.office}</span><br/>`;
    content +=`<span class=\"amount\"> ${data.category} $${addCommas(data.value)}</span><br/>`;
    //content +="<span class=\"amount\"> charge #{this.charge(data)} </span><br/>"
    //content +="<span class=\"name\">Amount:</span><span class=\"value\"> $#{addCommas(data.value)}</span><br/>"
    //content +="<span class=\"name\">Category:</span><span class=\"value\"> #{data.category}</span><br/>"
    //content +="<span class=\"name\">Super Category:</span><span class=\"value\"> #{data.super_category}</span><br/>"
    //content +="<span class=\"name\">Office:</span><span class=\"value\"> #{data.office}</span><br/>"
    //content +="<span class=\"name\">Party:</span><span class=\"value\"> #{data.party}</span><br/>"
    //content +="<span class=\"name\">Election Period:</span><span class=\"value\"> #{data.election_period}</span>"
    content +="</div>";
    return this.tooltip.showTooltip(content,d3.event);
  }
    //d3.select(element)
    //  .move_to_front()


  hide_details(data, i, element) {
    d3.select(element).attr("stroke", '');
    return this.tooltip.hideTooltip();
  }


  // Show rich information about candidate
  // Maybe move to another file
  // This class will have its own set of data that it copies from the general records
  // Ideally it could all be passed in to the initializer
  // Maybe should create class for record or circle elements
  render_modal(circle_data, i, element) {
    this.kill_forces();
    $('#candidate_vis').find('svg').remove();
    $('#candidate_modal').find('#expenditure-record-table-container').empty();

    const {
      reg_no
    } = circle_data;
    const records = window.records.filter( d => d.reg_no === reg_no);
    const nodes = window.viz.selectAll('circle')
      .filter( d => d.reg_no === reg_no )
      .sort( (a, b) => d3.descending(a.radius, b.radius))
      .data();

    const center_node = nodes.filter( d => circle_data.category === d.category)[0];
    const non_center_nodes = nodes.filter( d => circle_data.category !== d.category);
    const largest_radius = d3.max(non_center_nodes, d => d.radius);
    console.log(`largest radius is ${largest_radius}, similar to 61?`);
    const link_padding = largest_radius > 40 ?
      90
    :
      55;

    const links = non_center_nodes.map( node => ({
      source: center_node,
      target: node
    }));

    const link_distance = Math.max(40, center_node.radius) + link_padding;
    const modal_viz_padding = 5;
    const modal_viz_height = (link_distance*2) + (largest_radius*2) + (modal_viz_padding*2);
    const modal_viz_width = $('#candidate_vis').width();

    const viz = d3.select('#candidate_vis').append('svg')
      .attr('width', '100%')
      .attr('height', modal_viz_height);

    const circles = viz.selectAll('circle')
      .data(nodes, d => d.id);
    this.do_create_circles(circles);

    // Fade circles except center circle
    circles.filter( node => node.category !== circle_data.category)
      .transition().duration(1000)
      .style('opacity', 0.5);

    // TODO: calcuate height and width offset relative to their old absolute
    // position (probably use d3 scales)
    circles
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);

    const center_loc = {x: modal_viz_width/2, y: modal_viz_height/2};
    console.log("Center loc is " + JSON.stringify(center_loc));
    const move_center_towards_center = alpha => {
      return d => {
        if (d.id === center_node.id) {
          d.x = d.x + ((center_loc.x - d.x) * (this.damper + 0.02) * alpha);
          return d.y = d.y + ((center_loc.y - d.y) * (this.damper + 0.02) * alpha);
        }
      };
    };

    const tick = e => {
      return circles.each(move_center_towards_center(e.alpha))
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);
    };

    console.log(`force layout with width ${modal_viz_width} height: ${modal_viz_height}`);
    const force = d3.layout.force()
      .size([modal_viz_width, modal_viz_height])
      .nodes(nodes)
      .links(links)
      .friction(0.7)
      .theta(0.5)
      .gravity(0.4)
      .charge( d => {
        const charge = -300 + (-200 * Math.log(d.radius));
        this.charge(d) * 50;
        return charge;
      })
      .linkDistance(link_distance)
      .on('tick', tick)
      .start();

    window.force = force;

    return this.update_modal(reg_no, circle_data.category);
  }

  // Updates records on modal
  update_modal(reg_no, category) {
    console.log('updating modal');
    const url = 'https://hicscdata.hawaii.gov/resource/3maa-4fgr.json';

    const encoded_category = encodeURIComponent(category);
    const year = candidate_utils.get_vis_year();
    // https://dev.socrata.com/docs/functions/like.html
    // Example working link https://hicscdata.hawaii.gov/resource/fmfj-bac2.json?$limit=5&$where=election_period%20like%20%27%25-2008%27
    const url_params = "$limit=20&$where=reg_no='" + reg_no + `'and expenditure_category='${encoded_category}' and election_period like '%25` + year + "'&$order=amount desc";

    const modal = $('#candidate_modal');
    modal.find('.expenditure-error').hide();
    modal.find('.expenditure-loading').show();
    $.get(`${url}?${url_params}`, function(data) {
      const columns = [
        {name: 'date', display_name: 'Date', func(d) { return d.substring(0,10); } },
        {name: 'expenditure_category', display_name: 'Expenditure Category'},
        {name: 'vendor_name', display_name: 'Vendor Name'},
        {name: 'purpose_of_expenditure', display_name: 'Purpose of Expenditure'},
        {name: 'amount', display_name: 'Amount', func(d) { return money(d); }}
      ];
      return tabulate('#candidate_modal #expenditure-record-table-container', 'expenditure-record-table', data, columns);
  }).always( () => modal.find('.expenditure-loading').hide())
    .error( () => modal.find('.expenditure-error').show());

    const candidate_info = window.organizational_records.filter(d => d.reg_no === reg_no)[0];
    const {
      candidate_name
    } = candidate_info;
    const candidate_office = candidate_info.office;

    modal.find('.candidate_name').text(candidate_name);
    const cur_year = candidate_utils.get_vis_year();
    modal.find('.current_year').text(cur_year);
    modal.find('.candidate_office').text(candidate_office);
    modal.find('.expenditure_category_title').text(category);
    return show_powerballot_link(modal.find('a.powerballot').hide(), reg_no);
  }

  // Update the center node of the modal
  update_modal_center(circle_data, i, element) {
    return this.render_modal(circle_data, i, element);
  }

  size_legend_init() {
    // Size Legend
    const height = 200;

    const legend_sizes = [
      { label: '$ 100,000',     r: 100 * 1000 },
      { label: '$ 500,000',     r: 500 * 1000 },
      { label: '$ 1 million',   r: 1000000 }
    ];
    $.each(legend_sizes, (i,d) => {
      return d.r = this.radius_scale(d.r);
    });

    const largest_legend_offset = 40;
    const largest_radius = d3.max(legend_sizes, d => d.r);
    const radius_range = d3.extent(legend_sizes, d => d.r);
    const y = d3.scale.ordinal()
        .domain( legend_sizes.map(d => d.r) )
        .range( [-radius_range[0], -(radius_range[1] + largest_legend_offset + radius_range[0]) / 2, -(radius_range[1] + largest_legend_offset)] );
    // Constrain to whole numbers
    y.range(y.range().map( d => Math.round(d)));

    const width = $("#size-legend-container").width();
    const size_legend = d3.select("#size-legend-container")
      .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append('g')
          .attr("transform", d => `translate(${(width / 2) - (width / 6)},${(height / 2) + largest_radius})`);

    const circles = size_legend.selectAll("circle")
      .data( legend_sizes );

    circles.enter()
      .append('circle')
        .attr('r', d => d.r )
        .attr('cx', 0)
        .attr('cy', d => -d.r);

    const label_buffer = 40;
    const label_text_buffer = 10;
    const line_y_pos = d => - d.r - (d.r * Math.sin(d.y_ang));
    const line_x_pos = function(d) { let val;
    return val = Math.sqrt(Math.pow(d.r, 2) - Math.pow(y(d.r) + d.r, 2)); };
    circles.enter()
      .append('polyline')
        .attr('points', d => `${line_x_pos(d)}, ${y(d.r)}, ${largest_radius+label_buffer}, ${y(d.r)}`);

    return circles.enter()
      .append('text')
        .attr('class', 'size_label')
        .attr('x', largest_radius + label_buffer + label_text_buffer )
        .attr('y', d => y(d.r))
        .text( d => d.label);
  }

  show_legend(radius) {
    return d3.select('#vis-full-key')
      .transition().duration(1500)
      .style('opacity', 1)
      .style('top', ((radius * 2) + 80 + 85) + 'px');
  }
  hide_legend() {
    return d3.select('#vis-full-key')
      .transition().duration(1500)
      .style('opacity', 0)
      .style('top', '2000px');
  }

  handle_anchor_link() {
    // Detect if anchor is set and click on that candidate
    if (window.location.hash.length > 0) {
      const reg_no = window.location.hash.substr(1);
      $('#viz_nav_container .viz_nav[data-name="candidate"]').click();
      const candidate = window.organizational_records.filter( d => d.reg_no === reg_no)[0];
      if (candidate != null) {
        return this.highlightSingleCandidate(candidate.candidate_name);
      } else {
        return console.warn(`Unable to find candidate_name from reg_no ${reg_no}`);
      }
    }
  }

  highlightSingleCandidate(candidate_name_to_find) {
    return this.show_by_candidate({modify_location_map: location_map => {
      location_map.keys().forEach(candidate_name => {
        if (candidate_name !== candidate_name_to_find) {
          // Move off screen
          return location_map.get(candidate_name).x = -200;
        } else {
          location_map.get(candidate_name).x = this.width/2;
          return location_map.get(candidate_name).y = 200;
        }
      });
      return location_map;
    }
    });
  }

  initialize_candidate_autocomplete() {
    const candidate_lookup = window.organizational_records.map(d => ({
      value: d.candidate_name,
      data: d.reg_no
    }));
    const $container = $('.candidate_search_container');
    const $input = this.candidate_search_input();

    const reset_candidate_search = () => {
      this.show_all_candidates();
      return this.show_by_candidate();
    };

    $input.bind('input', function() {
      if ($(this).val().length <= 0) {
        return reset_candidate_search();
      }
    });

    return $input.autocomplete({
      lookup: candidate_lookup,
      lookupLimit: 6,
      lookupFilter(suggestion, originalQuery, queryLowerCase) {
        // Allow first and last name reversal
        // A search of "David Ige" should match "Ige, David"
        // "ige" should also match "Ige, David"
        const query_words = queryLowerCase.match(/[^ ]+/g);
        // Every query word needs to match the suggestion
        return query_words.every(query => suggestion.value.toLowerCase().indexOf(query) !== -1);
      },
      autoSelectFirst: true,
      onSelect: suggestion => {
        return this.highlightSingleCandidate(suggestion.value);
      },
      appendTo: $container,
      showNoSuggestionNotice: true,
      noSuggestionNotice: 'No candidates match your query',
      formatResult(suggestion, currentValue) {
        let formatted = suggestion.value;
        currentValue.match(/[^ ]+/g).forEach(function(value) {
          const pattern = '(' + $.Autocomplete.utils.escapeRegExChars(value) + ')';
          return formatted = formatted.replace(new RegExp(pattern, 'gi'), '<strong>$1<\/strong>');
        });
        return formatted;
      },
      onSearchComplete: (query, suggestions) => {
        const candidates_to_show = suggestions.map(d => d.data);
        if (suggestions.length <= 0) {
          return reset_candidate_search();
        } else if ((suggestions.length <= 6) && (suggestions.length > 0)) {
          // Show selected candidates
          this.circles.filter( circle => Array.from(candidates_to_show).includes(circle.reg_no))
            .transition().duration(1000)
            .style('opacity', 1);
          // Hide other candidates
          return this.circles.filter( circle => !Array.from(candidates_to_show).includes(circle.reg_no))
            .transition().duration(1000)
            .style('opacity', 0.3);
        }
      }
    });
  }
}

  // End class BubbleChart

const root = window;

// Helper class for things that don't rely on BubbleChart data
class CandidateUtil {
  constructor() {
    this.get_vis_year = this.get_vis_year.bind(this);
    this.get_island = this.get_island.bind(this);
  }

  static initClass() {
    this.prototype.MAUI = 'Maui, Lanai, Molokai';
    this.prototype.KAUAI = 'Kauai, Niihau';
  }

  get_vis_year() {
    let cur_year;
    const $year_el = $('.viz_nav.year');
    return cur_year = $year_el.data('year');
  }

  get_island(record) {
    //01-01 to 07-07  Hawaii
    //08-01 to 13-03  Maui
    //13-04           Lanai
    //13-05 to 13-09  Molokai
    //14-01 to 16-05  Kauai
    //16-06           Niihau
    //17-01 to 51-06  Oahu

    let matches;
    if (['Governor', 'Mayor', 'Lt. Governor', 'Prosecuting Attorney', 'OHA', 'BOE'].includes(record.office)) {
      return 'All';
    } else if (['Honolulu Council'].includes(record.office)) {
      return 'Oahu';
    } else if (['Maui Council'].includes(record.office)) {
      return this.MAUI;
    } else if (['Kauai Council'].includes(record.office)) {
      return this.KAUAI;
    } else if (['Hawaii Council'].includes(record.office)) {
      return 'Hawaii';
    } else if (['Senate'].includes(record.office)) {
      matches = window.precinct_records.filter(d => d.senate === record.district);
      if (!matches[0]) {
        console.log('no matches', record);
      }
      return this.get_island_by_precinct(matches[0].precinct);
    } else if (['House'].includes(record.office)) {
      matches = window.precinct_records.filter(d => d.house === record.district);
      return this.get_island_by_precinct(matches[0].precinct);
    } else {
      return 'Other';
    }
  }

  get_island_by_precinct(precinct) {

    let island;
    const as_number = parseInt(precinct.substring(0,2) + precinct.substring(3,5));
    // console.log("as number #{as_number} precinct #{precinct}")
    // console.log("as num", as_number)
    return island = as_number <= 707 ?
      'Hawaii'
    : as_number <= 1303 ?
      this.MAUI
    : as_number <= 1304 ?
      this.MAUI // Lanai
    : as_number <= 1309 ?
      this.MAUI // Molokai
    : as_number <= 1605 ?
      this.KAUAI
    : as_number <= 1606 ?
      this.KAUAI // Niihau
    : as_number <= 5106 ?
      'Oahu'
    :
      'Error';
  }
}
CandidateUtil.initClass();

root.candidate_utils = new CandidateUtil;

var show_powerballot_link = function($el, candidate_reg_no) {
  const powerballot_url = "http://codeforhawaii.github.io/hawaii-power-ballot/allgeneral.htm";
  const url = "http://services2.arcgis.com/tuFQUQg1xd48W6M5/arcgis/rest/services/HI_2014_primary_candidates/FeatureServer/1/query";
  const params = {
    where: `CC_Reg_No='${candidate_reg_no}'`,
    f: 'pjson',
    outFields: 'Candidate_ID'
  };
  return $.get(url, params, function(data) {
    const features = JSON.parse(data).features[0];
    if (features != null) {
      const candidate_id = features.attributes.Candidate_ID;
      return $el.show().attr('href', powerballot_url + '#' + candidate_id);
    } else {
      return console.warn(`Unable to find candidate id for reg no ${candidate_reg_no}`);
    }
  });
};

const campaignInit = function() {
  $('.legend tr').on('mouseenter', function() {
    const category = $(this).data('category');
    const circles = d3.selectAll('circle');
    return circles.filter( circle => circle.super_category !== category)
      .transition().duration(1000)
      .style('opacity', 0.3);
  });
  return $('.legend tr[data-category]').on('mouseleave', function() {
    const category = $(this).data('category');
    const circles = d3.selectAll('circle');
    return circles.transition().duration(1000)
      .style('opacity', 1);
  });
};


$(function() {
  let chart = null;

  campaignInit();

  // Join records on reg_no
  const join_data = function(expend_recs, org_recs) {
    const full_records = [];
    let i=0; let j=0;
    while (true) {
      var expend_rec = expend_recs[i];
      var org_rec = org_recs[j];
      if ((expend_rec == null) || (org_rec == null)) {
          break;
        }

      if (expend_rec.reg_no === org_rec.reg_no) {
        full_records.push($.extend({}, expend_rec, org_rec));
        i++;
      } else if (expend_rec.reg_no !== org_rec.reg_no) {
        j++;
      }
    }
    return full_records;
  };

  // Filter data down to what we want
  const filter_data = function(records, year) {
    const filtered_csv = records.filter( function(d) {
      // Only a handful of records have negative amounts so it is safe to ignore them
      if (parseInt(d.amount) < 0) {
        return false;
      // TODO: Might be better to just check the last year
      } else if (year === 2024) {
        return (d.election_period === '2022-2024') || (d.election_period === '2020-2024');
      } else if (year === 2022) {
        return (d.election_period === '2020-2022') || (d.election_period === '2018-2022');
      } else if (year === 2020) {
        return (d.election_period === '2018-2020') || (d.election_period === '2016-2020');
      } else if (year === 2018) {
        return (d.election_period === '2016-2018') || (d.election_period === '2014-2018');
      } else if (year === 2016) {
        return (d.election_period === '2014-2016') || (d.election_period === '2012-2016');
      } else if (year === 2014) {
        return (d.election_period === '2012-2014') || (d.election_period === '2010-2014');
      } else if (year === 2012) {
        return (d.election_period === '2010-2012') || (d.election_period === '2008-2012');
      } else if (year === 2010) {
        return (d.election_period === '2008-2010') || (d.election_period === '2006-2010');
      } else if (year === 2008) {
        return (d.election_period === '2006-2008') || (d.election_period === '2004-2008');
      } else if (year === 'gov') {
        return (d.election_period === '2012-2014') && (d.office === 'Governor');
      } else if (year === 'senate') {
        return (d.election_period === '2012-2014') && (d.office === 'Senate');
      } else {
        return false;
      }
      //else if year == 'gov2'
      // d.election_period == '2014-2016' && d.office == 'Senate'
      //d.election_period == '2010-2012' && d.office == 'Governor'
      //d.election_period == '2010-2012' && d.office == 'Senate'
    });
    const sorted = filtered_csv.sort( (a, b) => d3.descending(parseFloat(a.amount), parseFloat(b.amount)));
    //sorted = sorted.slice(0, 800)
    const reduced = _.reduce(filtered_csv, function(acc, d) {
      let curr = acc[d.candidate_name];
      if (curr == null) { curr = []; }
      curr.push(d);
      curr = _.sortBy(curr, d => // Why the 5 here?
      parseFloat(d.amount.slice(5)))
          .reverse();
      acc[d.candidate_name] = _.first(curr, 1);
      return acc;
    }
    , {});
    //filtered_csv = _.reduce(_.values(reduced), (acc, d) ->
    //  return acc.concat(d)
    //, [])
    filtered_csv;
    return sorted;
  };

  root.update_year = function(next) {
    const records = window.raw_records;

    const cur_year = candidate_utils.get_vis_year();
    const direction = next ? 1 : -1;
    const next_year = cur_year + (2*direction);

    // old disabled color: #bcbbb4, old enabled color: #454542
    if (next_year === 2008) {
      $('.viz_nav.year .left-arrow').attr('src', 'images/year_arrow_disabled.png')
        .removeClass('clickable');
    } else {
      $('.viz_nav.year .left-arrow').attr('src', 'images/year_arrow_transparent.png')
        .addClass('clickable');
    }

    if (next_year === 2022) {
      $('.viz_nav.year .right-arrow').attr('src', 'images/year_arrow_disabled.png')
        .removeClass('clickable');
    } else {
      $('.viz_nav.year .right-arrow').attr('src', 'images/year_arrow_transparent.png')
        .addClass('clickable');
    }

    // This defines the acceptable range of years to navigate to
    const range = d3.range(2008, 2022.1, 2);
    if (!Array.from(range).includes(next_year)) {
      return;
    }

    // update year element
    const $year_el = $('.viz_nav.year');
    $year_el.animate({color: 'white'}, {complete() {
      // Not black, dark grey
      $year_el.find('.year-text').text(next_year);
      $year_el.data('year', next_year);
      return $year_el.animate({color: '#454542'});
    }
    });

    const filtered_records = filter_data(records, next_year);
    window.debug_now = true;

    window.records = filtered_records;
    return chart.update_data(filtered_records);
  };

  const render_vis = function(error, expenditure_records, organizational_records, precinct_records) {
    const raw_records = join_data(expenditure_records, organizational_records);
    window.raw_records = raw_records;
    // This is the default data to show
    const filtered_records = filter_data(raw_records, 2022);
    //filtered_records = filter_data(raw_records, 'gov')
    //filtered_records = filter_data(raw_records, 'senate')

    window.precinct_records = precinct_records;

    window.records = filtered_records;
    window.organizational_records = organizational_records;
    chart = new BubbleChart(filtered_records);
    chart.display_group_all();
    chart.size_legend_init();
    return chart.handle_anchor_link();
  };
  root.get_chart = () => {
    return chart;
  };

  $('#viz_nav_container .viz_nav').on('click', function(e) {
    e.preventDefault();
    const $viz_nav = $(e.target).closest('.viz_nav');
    const func = $viz_nav.data('name');
    const currentFunc = $('.viz_nav.btn.selected').data('name');

    $viz_nav.animate({backgroundColor: '#73884f'});
    $viz_nav.animate({backgroundColor: '#FFFFFF'});

    if (func !== currentFunc) {
      $viz_nav.siblings('.btn').removeClass('selected');
      $viz_nav.addClass('selected');

      return window.get_chart().show_viz_type(func);
    } else {
      $viz_nav.removeClass('selected');
      return window.get_chart().show_viz_type('year');
    }
  });

  $('.viz_nav .right-arrow').on('click', function(e) {
    e.stopPropagation();
    if ($(this).hasClass('clickable')) {
      return window.update_year(true);
    }
  });
  $('.viz_nav .left-arrow').on('click', function(e) {
    e.stopPropagation();
    if ($(this).hasClass('clickable')) {
      return window.update_year(false);
    }
  });

  $('#nav #mini-legend').on('click', function(e) {
    e.preventDefault();
    // Position the hidden legend
    const pos = $(this).offset();
    pos.top = 50;
    return $('#mini-legend-body').slideToggle().offset(pos);
  });

  return queue()
    .defer(d3.csv, "data/campaign_spending_summary.csv")
    .defer(d3.csv, "data/organizational_report.csv")
    .defer(d3.csv, "data/precinct.csv")
    .await(render_vis);
});
