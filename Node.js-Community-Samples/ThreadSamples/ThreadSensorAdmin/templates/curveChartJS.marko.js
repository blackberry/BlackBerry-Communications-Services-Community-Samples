// Compiled using marko@4.14.0 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/src/html").t(__filename),
    marko_componentType = "/threadsensoradmin$1.0.0/templates/curveChartJS.marko",
    components_helpers = require("marko/src/components/helpers"),
    marko_renderer = components_helpers.r,
    marko_defineComponent = components_helpers.c,
    marko_helpers = require("marko/src/runtime/html/helpers"),
    marko_escapeXml = marko_helpers.x,
    marko_escapeScript = marko_helpers.xs;

function render(input, out, __component, component, state) {
  var data = input;

  out.w("<script type=\"text/javascript\">\r\n    google.charts.load('current', {'packages':['corechart']});\r\n\r\n    google.charts.setOnLoadCallback(drawChart_" +
    marko_escapeScript(data.chartNo) +
    ");\r\n\r\n    function drawChart_" +
    marko_escapeScript(data.chartNo) +
    "() {\r\n        var data = google.visualization.arrayToDataTable([\r\n        " +
    marko_escapeScript(data.chartDataValues) +
    "\r\n        ]);\r\n\r\n        var options = {\r\n        title: '" +
    marko_escapeScript(data.chartDeviceID) +
    "',\r\n        legend: { position: 'bottom' },\r\n        vAxis: {minValue: 0, maxValue: 60}\r\n        };\r\n\r\n        var chart = new google.visualization.LineChart(document.getElementById('curve_chart_" +
    marko_escapeScript(data.chartDeviceID) +
    "'));\r\n\r\n        chart.draw(data, options);\r\n    }\r\n</script>");
}

marko_template._ = marko_renderer(render, {
    ___implicit: true,
    ___type: marko_componentType
  });

marko_template.Component = marko_defineComponent({}, marko_template._);

marko_template.meta = {
    id: "/threadsensoradmin$1.0.0/templates/curveChartJS.marko"
  };
