"use strict";

var request = require("request");
var amqp = require("../index.js");
var crypto = require("crypto");
var assert = require("assert");
var async = require("async");

var defaultBehaviour = {exchange: "e1", errorLogger: console.log};
var defaultConnOpts = {};
var connection;

Feature("Connect", function () {

  Scenario("Ok connection", function () {
    after(disconnect);
    When("Trying to connect to default port");
    Then("We should bet able to connect", function (done) {
      connect(defaultConnOpts, defaultBehaviour, ignoreErrors(done));
    });
    And("The connection should be ok", testConnection);

  });

  Scenario("Bad connection", function () {
    after(disconnect);
    When("Trying to connect to bad port");
    Then("We should get an error", function (done) {
      connect({port: 9999}, defaultBehaviour, ensureErrors(done));
    });
  });

  Scenario("Reconnect", function () {
    after(disconnect);
    And("We have a connection", function (done) {
      connect(defaultConnOpts, defaultBehaviour, ignoreErrors(done));
    });
    And("And we kill all rabbit connections", killRabbitConnections);
    Then("The connection should be ok", testConnection);
  });

});

Feature("Pubsub", function () {
  Scenario("Ok pubsub", function () {
    var message;
    after(disconnect);
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

function getRabbitConnections(callback) {
  request.get("http://guest:guest@localhost:15672/api/connections",
              function (err, resp, connections) {
                callback(err, JSON.parse(connections));
              });
}

function killRabbitConnections(done) {
  getRabbitConnections(function (err, connections) {
    if (err) return done(err);
    async.each(connections, killRabbitConnection, done);
  });
}

function killRabbitConnection(connection, done) {
  request.del("http://guest:guest@localhost:15672/api/connections/" + connection.name, done);
}
