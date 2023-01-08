ShExWebApp = (function () {
  const shapeMap = require("shape-map")
  return Object.assign({}, {
    ShExTerm:             require('@shexjs/term'),
    Util:                 require('@shexjs/util'),
    RdfJsDb:              require('@shexjs/neighborhood-rdfjs').ctor,
    Validator:            require('@shexjs/validator').ShExValidator,
    Writer:               require('@shexjs/writer'),
    Loader:               require("@shexjs/loader"),
    Parser:               require("@shexjs/parser"),
    "eval-simple-1err":   require("@shexjs/eval-simple-1err"),
    "eval-threaded-nerr": require("@shexjs/eval-threaded-nerr"),
    ShapeMap:             shapeMap,
    ShapeMapParser:       shapeMap.Parser,
    JsYaml:               require("js-yaml"),
    DcTap:                require("dctap").DcTap,
    Map:                  require("."),
    NestedTurtleWriter:   require("./lib/NestedWriter"),
  })
})()

if (typeof require !== 'undefined' && typeof exports !== 'undefined')
  module.exports = ShExWebApp;
