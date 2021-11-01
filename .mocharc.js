"use strict";

process.env.NODE_ENV = "test";
process.env.RABBIT_URL = process.env.RABBIT_URL || "amqp://guest:guest@localhost";
process.env.RABBIT_MGT_URL = process.env.RABBIT_MGT_URL || "http://guest:guest@localhost:15672";

module.exports = {
  ui: "mocha-cakes-2",
  timeout: 10000,
  recursive: true,
  exit: true,
};
