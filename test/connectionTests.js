"use strict";

var exec = require("child_process").exec;
var amqp = require("../index.js");
var crypto = require("crypto");
var should = require("chai").should();

var defaultBehaviour = {exchange: "e1"};
var defaultConnOpts = {};

before(function (done) {unpause_rabbit(done);});

Feature("Connect", function () {

  Scenario("Ok connection", function () {
    after(disconnect);
    When("Rabbit is running", unpause_rabbit);
    Then("We should bet able to connect", function (done) {
      connect(defaultConnOpts, defaultBehaviour, ignore_errors(done));
    });
    And("The connection should be ok", test_connection);

  });

  Scenario("Bad connection", function () {
    after(disconnect);
    When("Rabbit is not running", pause_rabbit);
    Then("We should get an error", function (done) {
      connect(defaultConnOpts, defaultBehaviour, ensure_errors(done));
    });
  });

  Scenario("Reconnect", function () {
    after(disconnect);
    When("Rabbit is running", unpause_rabbit);
    And("We have a connection", function (done) {
      connect(defaultConnOpts, defaultBehaviour, ignore_errors(done));
    });
    And("Rabbit goes down", pause_rabbit);
    And("Rabbit comes back up", unpause_rabbit);
    Then("The connection should be ok", test_connection);
  });
});

var connection;

function test_connection(done) {
  var randomRoutingKey = "RK" + crypto.randomBytes(6).toString("hex");
  connection.subscribe(randomRoutingKey, randomRoutingKey, function (msg) {
    done();
  }, function () {
    connection.publish(randomRoutingKey, "someMessage");
  });
}

function ensure_errors(callback) {
  return function (err) {
    if (err) {
      call_once(callback);
    };
  }
}

function ignore_errors(callback) {
  return function (err) {
    if (!err) {
      call_once(callback);
    }
  }
}

function call_once(callback) {
  if (callback && !callback.alreadyCalled) {
    callback.alreadyCalled = true;
    callback();
  }
}

function connect(opts, behaviour, callback) {
  return connection = amqp(opts, behaviour, callback);
}

function disconnect() {
  connection && connection.close();
}

function pause_rabbit(done) {
  exec("rabbitmqctl stop_app", done);
}

function unpause_rabbit(done) {
  exec("rabbitmqctl start_app", done);
}
