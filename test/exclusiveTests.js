"use strict";

var amqp = require("../index.js");
var assert = require("assert");

var defaultBehaviour = {exchange: "e1", logger: null};
var defaultConnOpts = {};
var connection;

Feature("Exclusive subscribe", function () {
  Scenario("Should allow subscribing", function () {
    var message;
    after(disconnect);
    Given("We have a connection", function (done) {
      connect(defaultConnOpts, defaultBehaviour, ignoreErrors(done));
    });
    And("We create an exclusiveSubscription", function (done) {
      connection.subscribeExclusive("#", "myExclusiveQueue", function (msg) {
        message = msg;
      }, done);
    });
    When("We publish a message", function (done) {
      connection.publish("testRoutingKey", {testData: "hello"}, done);
    });
    Then("It should arrive correctly", function () {
      assert.equal(message.testData, "hello");
    });
  });

  Scenario("Should fail to subscribe twice", function () {
    var message;
    after(disconnect);
    Given("We have a connection", function (done) {
      connect(defaultConnOpts, defaultBehaviour, ignoreErrors(done));
    });
    And("We create an exclusiveSubscription", function (done) {
      connection.subscribeExclusive("#", "myExclusiveQueue", function () {}, done);
    });
    When("We try to create another exclusiveSubscription", function (done) {
      connection.subscribeExclusive("#", "myExclusiveQueue", function (msg) {
        message = msg;
      }, null, function (err) {
        assert(err);
        assert.equal(err.code, 403);
        done();
      });
    });

    And("We publish a message", function (done) {
      connection.publish("testRoutingKey", {testData: "hello"}, done);
    });
    Then("It should not get any", function () {
      assert.equal(undefined, message);
    });

  });
});

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
