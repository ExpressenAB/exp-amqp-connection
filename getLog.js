"use strict";

function getLog(logger) {
  return logger || {
      debug: function () {},
      error: function () {},
      info: function () {},
      warn: function () {}
    };
}

module.exports = getLog;
