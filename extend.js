"use strict";

function extend(orig, attributes) {
  var newObj = {};
  Object.keys(orig || {}).forEach(function (key) {
    newObj[key] = orig[key];
  });
  Object.keys(attributes || {}).forEach(function (key) {
    newObj[key] = attributes[key];
  });
  return newObj;
}

module.exports = extend;
