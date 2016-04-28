"use strict";

/* eslint no-undef: 0, new-cap: 0 */

var request = require("request");
var amqp = require("../index.js");
var assert = require("assert");
var async = require("async");
var _ = require("lodash");

var defaultBehaviour = {exchange: "e1", confirm: true, url: "amqp://localhost"};

function init(behaviour) {
  return amqp(behaviour);
}

function shutdown(broker, done) {
  broker.removeAllListeners("error");
  broker.on("error", function (err) {});
  broker.shutdown(done);
}

Feature("Connect", function () {
  
  Scenario("Ok connection", function () {
    var broker;
    after((done) => shutdown(broker, done));
    When("Connecting to default port", function () {
      broker = init(defaultBehaviour);
    });
    Then("The connection should be ok", function (done) {
      broker.publish("foobar", "foobar", done);
    });
  });

  Scenario("Bad connection", function () {
    var broker;
    var badPortBehaviour;
    after((done) => shutdown(broker, done));
    When("Trying to connect to bad port", function () {
      badPortBehaviour = _.extend({}, defaultBehaviour, {reuse: "bad-port", url: "amqp://localhost:6666"});
    });
    Then("We should get an error", function (done) {
      broker = init(badPortBehaviour);
      broker.once("error", function () {
        done();
      });
      broker.publish("test", "Message");
    });
  });

  Scenario("Disconnect with reuse", function () {
    var broker;
    after((done) => shutdown(broker, done));
    When("We have a connection", function () {
      broker = amqp(defaultBehaviour);
    });
    And("And we kill all rabbit connections", killRabbitConnections);
    And("We sleep a while", function (done) { setTimeout(done, 500); });
    Then("We can use the broker again", function (done) {
      broker.publish("bogus", "Hello", done);
    });
  });
});

var pubTests = [
  {type: "buffer", data: new Buffer("Hello"), result: "Hello"},
  {type: "string", data: "Hello", result: "Hello"},
  {type: "object", data: {greeting: "Hello"}, result: {greeting: "Hello"}}
];

pubTests.forEach(function (test) {
  Scenario("Pubsub with " + test.type + " message", function () {
    var broker;
    var recieved;   
    after((done) => shutdown(broker, done));
    And("We have a connection", function () {
      broker = init(defaultBehaviour);
    });
    And("We create a subscription", function (done) {
      broker.subscribeTmp("testRoutingKey", function (msg) {
        recieved = msg;
      }, done);
    });
    And("We publish a message", function (done) {
      broker.publish("testRoutingKey", test.data, done);
    });
    Then("It should arrive correctly", function () {
      assert.deepEqual(test.result, recieved);
    });
  });
});

Scenario("Multiple routing keys", function () {
  var messages = [];
  var broker;
  var handler = function (message) {
    messages.push(message.testData);
  };
  after((done) => shutdown(broker, done));
  When("We have a connection", function () {
    broker = init(defaultBehaviour);
  });
  And("We create a subscription for routing key 1 and 2", function (done) {
    broker.subscribe(["rk1", "rk2"], "testQ2", handler, done);
  });
  When("We publish a message with routing key 1", function (done) {
    broker.publish("rk1", {testData: "m1"}, done);
  });
  Then("It should be delivered once", function () {
    assert.deepEqual(["m1"], messages);
  });
  When("We publish a message with routing key 2", function (done) {
    broker.publish("rk2", {testData: "m2"}, done);
  });
  Then("It should be delivered once", function () {
    assert.deepEqual(messages, ["m1", "m2"]);
  });
});


Scenario("Multiple subscriptions", function () {
  var messages = [];
  var broker;
  var handler = function (message) {
    messages.push(message);
  };
  after((done) => shutdown(broker, done));
  When("We have a connection", function () {
    broker = init(defaultBehaviour);
  });
  And("We create a subscription with routing key 1", function (done) {
    broker.subscribe(["k1"], "testQ-1", handler, done);
  });
  And("We create another subscription qith routing key 1", function (done) {
      broker.subscribe(["k1"], "testQ-2", handler, done);
  });
  And("We create a subscription with routing key 2", function (done) {
    broker.subscribe(["k2"], "testQ-3", handler, done);
  });

  When("We publish a message with key 1", function (done) {
    broker.publish("k1", "m1", done);
  });
  Then("It should be delivered twice", function () {
    assert.deepEqual(["m1", "m1"], messages);
  });
  When("We publish a message with routing key 2", function (done) {
    broker.publish("k2", "m2", done);
  });
  Then("It should be delivered once", function () {
    assert.deepEqual(messages, ["m1", "m1", "m2"]);
  });
});


Scenario("Pubsub using tmp queue", function () {
  var recieved;
  var broker;
  after((done) => shutdown(broker, done));
  When("We have a connection", function () {
    broker = init(defaultBehaviour);
  });
  And("We create a subscription without specifying a queue name", function (done) {
    broker.subscribeTmp("testRoutingKey", function (msg) {
      recieved = msg;
    }, done);
  });
  And("We publish a message", function (done) {
    broker.publish("testRoutingKey", "Hi there!", done);
  });
  Then("It should arrive correctly", function () {
    assert.deepEqual("Hi there!", recieved);
  });
});

Scenario("Cancelled sub", function () {
  var broker;
  var error;
  after(() => shutdown(broker));
  When("We have a connection", function () {
    broker = amqp(defaultBehaviour);
  });

  And("We create a subscription", function (done) {
    broker.on("error", function (err) {
      error = err;
    });
    broker.subscribe("testRoutingKey", "testQ2", function () {}, done);
  });
  And("We delete the queue", function (done) {
    deleteRabbitQueue("testQ2", done);
  });
  Then("An error should be raised", function () {
    assert.equal("Subscription cancelled", error);
  });
});

Feature("Bootstrapping", function () {
  var broker;
  before(killRabbitConnections);
  after(() => shutdown(broker));
  When("Connect to the borker", function () {
    broker = amqp(defaultBehaviour);
  });
  And("We use it a ton of times", function (done) {
    var i = 0;
    async.whilst(
      function () { return i++ < 100; },
      function (cb) { broker.publish("bogus", "bogus", cb); },
      done);
  });
  Then("Only one actual connection should be created", function (done) {
    getRabbitConnections(function (err, conns) {
      if (err) return done(err);
      assert.equal(1, conns.length);
      done();
    });
  });
});

function getRabbitConnections(callback) {
  request.get("http://guest:guest@localhost:15672/api/connections",
  function (err, resp, connections) {
    callback(err, JSON.parse(connections));
  });
}

function killRabbitConnections() {
  getRabbitConnections(function (err, connections) {
    if (err) assert(false, err);
    connections.forEach(killRabbitConnection);
  });
}

function killRabbitConnection(conn) {
  deleteResource("http://guest:guest@localhost:15672/api/connections/" + conn.name, assert.ifError);
}

function deleteRabbitQueue(queue, done) {
  deleteResource("http://guest:guest@localhost:15672/api/queues/%2F/" + queue, done);
}

function deleteResource(url, done) {
  request.del(url, function (err, resp, body) {
    if (err) return done(err);
    if (resp.statusCode >= 300) return done(resp.statusCode + " " + body);
    done();
  });
}
