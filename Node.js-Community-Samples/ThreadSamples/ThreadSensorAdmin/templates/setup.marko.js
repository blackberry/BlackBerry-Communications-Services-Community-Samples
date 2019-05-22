// Compiled using marko@4.14.0 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/src/html").t(__filename),
    marko_componentType = "/threadsensoradmin$1.0.0/templates/setup.marko",
    components_helpers = require("marko/src/components/helpers"),
    marko_renderer = components_helpers.r,
    marko_defineComponent = components_helpers.c,
    marko_helpers = require("marko/src/runtime/html/helpers"),
    marko_loadTag = marko_helpers.t,
    component_globals_tag = marko_loadTag(require("marko/src/components/taglib/component-globals-tag")),
    marko_escapeXml = marko_helpers.x,
    init_components_tag = marko_loadTag(require("marko/src/components/taglib/init-components-tag")),
    await_reorderer_tag = marko_loadTag(require("marko/src/taglibs/async/await-reorderer-tag"));

function render(input, out, __component, component, state) {
  var data = input;

  out.w("<!doctype html><html><header><title>Add A Collector</title> </header><body>");

  component_globals_tag({}, out);

  out.w("<h1>Setup Page</h1><h2>Add Collector</h2><form name=\"addCollector\" action=\"/setup\" method=\"POST\">Collector ID: <input type=\"text\" name=\"collectorID\"><br> Collector Spark Reg ID: <input type=\"text\" name=\"sparkRegID\"><br><br><input type=\"submit\" value=\"Save\"></form>" +
    marko_escapeXml(data.message));

  init_components_tag({}, out);

  await_reorderer_tag({}, out, __component, "13");

  out.w("</body></html>");
}

marko_template._ = marko_renderer(render, {
    ___implicit: true,
    ___type: marko_componentType
  });

marko_template.Component = marko_defineComponent({}, marko_template._);

marko_template.meta = {
    id: "/threadsensoradmin$1.0.0/templates/setup.marko",
    tags: [
      "marko/src/components/taglib/component-globals-tag",
      "marko/src/components/taglib/init-components-tag",
      "marko/src/taglibs/async/await-reorderer-tag"
    ]
  };
