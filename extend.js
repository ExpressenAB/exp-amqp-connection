"use strict";

function extend(orig, attributes) {
  var newObj = {};
  Object.keys(orig).forEach(function (key) {
    newObj[orig] = orig[key];
  });
  Object.keys(attributes).forEach(function (key) {
    newObj[orig] = attributes[key];
  });
}

module.exports = extend;
