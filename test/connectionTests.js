"use strict";

var exec = require("child_process").exec;
var amqp = require("../index.js");
var crypto = require("crypto");
var assert = require("assert");

var defaultBehaviour = {exchange: "e1", errorLogger: null};
var defaultConnOpts = {};

before(function (done) {unpauseRabbit(done);});

Feature("Connect", function () {

  Scenario("Ok connection", function () {
    after(disconnect);
    When("Rabbit is running", unpauseRabbit);
    Then("We should bet able to connect", function (done) {
      connect(defaultConnOpts, defaultBehaviour, ignoreErrors(done));
    });
    And("The connection should be ok", testConnection);

  });

  Scenario("Bad connection", function () {
    after(disconnect);
    When("Rabbit is not running", pauseRabbit);
    Then("We should get an error", function (done) {
      connect(defaultConnOpts, defaultBehaviour, ensureErrors(done));
    });
  });

  Scenario("Reconnect", function () {
    after(disconnect);
    When("Rabbit is running", unpauseRabbit);
    And("We have a connection", function (done) {
      connect(defaultConnOpts, defaultBehaviour, ignoreErrors(done));
    });
    And("Rabbit goes down", pauseRabbit);
    And("Rabbit comes back up", unpauseRabbit);
    Then("The connection should be ok", testConnection);
  });

});

Feature("Pubsub", function () {
  Scenario("Ok pubsub", function () {
    var message;
    after(disconnect);
    When("Rabbit is running", unpauseRabbit);
    And("We have a connection", function (done) {
      connect(defaultConnOpts, defaultBehaviour, ignoreErrors(done));
    });
    And("We create a subscription", function (done) {
      connection.subscribe("testRoutingKey", "testQ", function (msg) {
        message = msg;
      }, done);
    });
    And("We publish a message", function (done) {
      connection.publish("testRoutingKey", {testData: "hello"}, done);
    });
    Then("It should arrive correctly", function () {
      assert.equal(message.testData, "hello");
    });
  });
});

var connection;

function testConnection(done) {
  var randomRoutingKey = "RK" + crypto.randomBytes(6).toString("hex");
  connection.subscribe(randomRoutingKey, randomRoutingKey, function () {
    done();
  }, function () {
    connection.publish(randomRoutingKey, "someMessage");
  });
}

function ensureErrors(callback) {
  return function (err) {
    if (err) {
      callOnce(callback);
    }
  };
}

function ignoreErrors(callback) {
  return function (err) {
    if (!err) {
      callOnce(callback);
    }
  };
}

function callOnce(callback) {
  if (callback && !callback.alreadyCalled) {
    callback.alreadyCalled = true;
    callback();
  }
}

function connect(opts, behaviour, callback) {
  connection = amqp(opts, behaviour, callback);
}

function disconnect() {
  if (connection) connection.close();
}

function pauseRabbit(done) {
  exec("rabbitmqctl stop_app", done);
}

function unpauseRabbit(done) {
  exec("rabbitmqctl start_app", done);
}
