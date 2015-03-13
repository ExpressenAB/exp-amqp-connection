"use strict";

var exec = require("child_process").exec;
var amqp = require("../index.js");
var should = require("chai").should();

var defaultBehaviour = {exchange: "e1"};
var defauleConnOpts = {};

before(ensure_rabbit_started);
before(unpause_rabbit);

describe("Connect", function () {
  it("Should connect to a running amqp host", function (done) {
    amqp(defaultConnOpts, defaultBehaviour, done);
  });
  describe("Should return error when amqp host is down", function () {
    describe("rabbit is not running", function (done) {
      pause_rabbit(done);
    });
    it("should return error", function (done) {
      amqp(defaultConnOpts, defaultBehaviour, function (err, conn) {
        should.exist(err);
        done();
      });
    });
  });
});

function ensure_rabbit_started(done) {
  exec("rabbitmqctl status", done);
}

function pause_rabbit(done) {
  exec("rabbitmqctl stop_app", done);
}

function unpause_rabbit(done) {
  exec("rabbitmqctl start_app", done);
}
