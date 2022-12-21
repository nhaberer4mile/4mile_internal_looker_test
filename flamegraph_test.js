function resetZoom() {
  flameGraph.resetZoom();
}
function onClickHandler(d) {
  history.pushState({ id: d.id }, d.data.name, `#${d.id}`);
}
function stringToColorHash(str) {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  var colour = '#';
  for (var i = 0; i < 3; i++) {
    var value = (hash >> (i * 8)) & 0xFF;
    colour += ('00' + value.toString(16)).substr(-2);
  }
  return colour;
}
function stepwiseScale(data, scaler) {
  if (!Number.isInteger(scaler)) return;
  childrenTotalCount = 0;
  // no children - exit
  if (data["children"].length==0) {
    return;
  }
  // get total of children values
  for (var i = 0; i < data["children"].length; i++) {
    childrenTotalCount += data["children"][i]["value"];
  }
  // scale children's values up to scaler
  if (data["value"] / scaler > childrenTotalCount) {
    for (var i = 0; i < data["children"].length; i++) {
      percentScale = data["children"][i]["value"] / childrenTotalCount;
      data["children"][i]["value"] = Math.round(percentScale * (data["value"] / scaler));
    }
  }
  // recurse through children
  for (var i = 0; i < data["children"].length; i++) {
    stepwiseScale(data["children"][i], scaler);
  }
}
var vis = {
  id: 'flamegraph',
  label: 'Flamegraph',
  options: {
      color: {
          type: 'string',
          label: 'Custom Color',
          display: 'color',
      },
      diameter: {
          type: "string",
          label: "Diameter",
          default: '100%',
          placeholder: "100%"
      },
      stepWiseMaxScale: {
          type: "number",
          label: "Stepwise Max Scale",
          placeholder: 4
      },
      top_label: {
          type: "string",
          label: "Title",
          placeholder: "My awesome chart"
      }
  },
  // Set up the initial state of the visualization
  create: function(element, config) {
      var css = '<style> .d3-flame-graph rect{stroke:#EEE;fill-opacity:.8}.d3-flame-graph rect:hover{stroke:#474747;stroke-width:.5;cursor:pointer}.d3-flame-graph-label{pointer-events:none;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;font-size:12px;font-family:Verdana;margin-left:4px;margin-right:4px;line-height:1.5;padding:0;font-weight:400;color:#000;text-align:left}.d3-flame-graph .fade{opacity:.6!important}.d3-flame-graph .title{font-size:20px;font-family:Verdana}.d3-flame-graph-tip{line-height:1;font-family:Verdana;font-size:12px;padding:12px;background:rgba(0,0,0,.8);color:#fff;border-radius:2px;pointer-events:none}.d3-flame-graph-tip:after{box-sizing:border-box;display:inline;font-size:10px;width:100%;line-height:1;color:rgba(0,0,0,.8);position:absolute;pointer-events:none}.d3-flame-graph-tip.n:after{content:"\25BC";margin:-1px 0 0;top:100%;left:0;text-align:center}.d3-flame-graph-tip.e:after{content:"\25C0";margin:-4px 0 0;top:50%;left:-8px}.d3-flame-graph-tip.s:after{content:"\25B2";margin:0 0 1px;top:-8px;left:0;text-align:center}.d3-flame-graph-tip.w:after{content:"\25B6";margin:-4px 0 0 -1px;top:50%;left:100%} </style> ';
      element.innerHTML = css;
      container = element.appendChild(document.createElement("div"));
      container.setAttribute("id",`lensview-flamegraph`);
      container.classList.add("d3-flame-graph");
      container.set
  },
  // Render in response to the data or settings changing
  update: function(data, element, config, queryResponse) {
      var parentSpanIdKey = queryResponse.fields.dimensions[0].name;
      var currentSpanIdKey = queryResponse.fields.dimensions[1].name; 
      var currentSpanNameKey = queryResponse.fields.dimensions[2].name;
      var measureKey = queryResponse.fields.measures[0].name;
      // rename keys
      var len = Object.keys(data).length;
      for (i = 0; i < len; i++) {
          data[i]["name"] =  data[i][currentSpanNameKey].value;
          delete data[i][currentSpanNameKey];
          data[i]["value"] = data[i][measureKey].value;
          data[i]["originalValue"] = data[i][measureKey].value;
          data[i]["children"] = []
      }
      // sort rows ascending by parent step
      data.sort(function(a, b) {
          return parseInt(a[parentSpanIdKey].value) - parseInt(b[parentSpanIdKey].value);
      });
      // nest children steps inside parent steps for chart
      while (len > 1) {
          lastElement = data[len - 1];
          lastElementParent = lastElement[parentSpanIdKey].value;
          for (i = 0; i < len; i++) {
              if (data[i][currentSpanIdKey].value == lastElementParent) {
                  data[i]["children"].push(lastElement);
                  if (data[i][measureKey].value != lastElement[measureKey].value) {
                    data[i]["value"] += lastElement["value"]
                  } else {
                    data[i]["value"] = lastElement["value"]
                  }
                  delete data[len - 1];
                  break;
              }
          }
          if (data[len - 1] == lastElement) {
            vis.addError({
              title: "Data is not nestable",
              message: "Data must be in nested hierarchy structure.\
                        Ensure the 1st dimension is the parent id, 2nd dimension is the child id, and 3rd dimension is the descriptor."
            });
            break;
          }
          len = Object.keys(data).length;
      }
      var root = data[0]
      //scale children to minimum values
      stepwiseScale(root, config.stepWiseMaxScale);
      // set chart diameter & max width
      var ratio = parseFloat(config.diameter) / 100.0;
      if (isNaN(ratio)) {
        var diameter = element.clientWidth;
      } else if (ratio > 10) {
        var diameter = element.clientWidth * 10;
      } else {
        var diameter = Math.round(element.clientWidth * ratio);
      }
      var flameGraph = d3.flamegraph()
          .width(diameter)
          .transitionDuration(1000)
          .title(config.top_label)
          .onClick(onClickHandler);
      // Using second measure as sort name
      if (queryResponse.fields.measures.length > 1) {
        var sortName = queryResponse.fields.measures[1].name;
        flameGraph.sort(function (a, b) {
          a.data[sortName] - b.data[sortName];
        });
      }
      // Set color mapper
      flameGraph.setColorMapper(function(d, originalColor) {
        return stringToColorHash(d.data.name)
      });
      // set the tooltip hover
      var tip = d3.tip()
        .direction("s")
        .offset([8, 0])
        .attr('class', 'd3-flame-graph-tip')
        .html(function(d) { return d.data.name + " (" + d.data.originalValue.toLocaleString() + ")"; });
      flameGraph.tooltip(tip);
      var details = document.getElementById("details");
      flameGraph.setDetailsElement(details);
      d3.select('#lensview-flamegraph')
      .datum(root)
      .call(flameGraph);
  }
};
looker.plugins.visualizations.add(vis);
