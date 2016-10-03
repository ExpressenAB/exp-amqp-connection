"use strict";

/* eslint no-undef: 0, new-cap: 0 */

var request = require("request");
var amqp = require("../index.js");
var assert = require("assert");
var async = require("async");
var _ = require("lodash");

var RABBIT_HOST = "linked-rabbitmq";
var defaultBehaviour = {exchange: "e1", confirm: true, url: "amqp://" + RABBIT_HOST};

Feature("Connect", () => {

  Scenario("Ok connection", () => {
    var broker;
    after((done) => shutdown(broker, done));
    When("Connecting to default port", () => {
      broker = init(defaultBehaviour);
    });
    Then("The connection should be ok", (done) => {
      broker.publish("foobar", "foobar", done);
    });
  });

  Scenario("Bad connection", () => {
    var broker;
    var badPortBehaviour;
    after((done) => { shutdown(broker, done); });
    When("Trying to connect to bad port", () => {
      badPortBehaviour = _.extend({}, defaultBehaviour, {reuse: "bad-port", url: "amqp://" + RABBIT_HOST + ":6666"});
    });
    Then("We should get an error", (done) => {
      broker = init(badPortBehaviour);
      broker.once("error", () => {
        done();
      });
      broker.publish("test", "Message");
    });
  });

  Scenario("Disconnect with reuse", () => {
    var broker;
    after((done) => { shutdown(broker, done); });
    When("We have a connection", () => {
      broker = amqp(defaultBehaviour);
    });
    And("And we kill all rabbit connections", killRabbitConnections);
    And("We sleep a while", (done) => { setTimeout(done, 500); });
    Then("We can use the broker again", (done) => {
      broker.publish("bogus", "Hello", done);
    });
  });
});

var pubTests = [
  {type: "buffer", data: new Buffer("Hello"), result: "Hello"},
  {type: "string", data: "Hello", result: "Hello"},
  {type: "object", data: {greeting: "Hello"}, result: {greeting: "Hello"}}
];

pubTests.forEach((test) => {
  Scenario("Pubsub with " + test.type + " message", () => {
    var broker;
    var recieved;
    after((done) => shutdown(broker, done));
    And("We have a connection", () => {
      broker = init(defaultBehaviour);
    });
    And("We create a subscription", (done) => {
      broker.subscribeTmp("testRoutingKey", (msg) => {
        recieved = msg;
      }, done);
    });
    And("We publish a message", (done) => {
      broker.publish("testRoutingKey", test.data);
      waitForTruthy(() => recieved, done);
    });
    Then("It should arrive correctly", () => {
      assert.deepEqual(test.result, recieved);
    });
  });
});

Scenario("Multiple routing keys", () => {
  var messages = [];
  var broker;
  after((done) => shutdown(broker, done));
  var handler = (message) => {
    messages.push(message.testData);
  };
  When("We have a connection", () => {
    broker = init(defaultBehaviour);
  });
  And("We create a subscription for routing key 1 and 2", (done) => {
    broker.subscribe(["rk1", "rk2"], "testQ2", handler, done);
  });
  When("We publish a message with routing key 1", (done) => {
    broker.publish("rk1", {testData: "m1"});
    waitForTruthy(() => messages.length > 0, done);
  });
  Then("It should be delivered once", () => {
    assert.deepEqual(["m1"], messages);
  });
  When("We publish a message with routing key 2", (done) => {
    broker.publish("rk2", {testData: "m2"});
    waitForTruthy(() => messages.length > 1, done);
  });
  Then("It should be delivered once", () => {
    assert.deepEqual(messages, ["m1", "m2"]);
  });
});


Scenario("Multiple subscriptions", () => {
  var messages = [];
  var broker;
  var handler = (message) => {
    messages.push(message);
  };
  after((done) => { shutdown(broker, done); });
  When("We have a connection", () => {
    broker = init(defaultBehaviour);
  });
  And("We create a subscription with routing key 1", (done) => {
    broker.subscribe(["k1"], "testQ-1", handler, done);
  });
  And("We create another subscription qith routing key 1", (done) => {
      broker.subscribe(["k1"], "testQ-2", handler, done);
  });
  And("We create a subscription with routing key 2", (done) => {
    broker.subscribe(["k2"], "testQ-3", handler, done);
  });

  When("We publish a message with key 1", (done) => {
    broker.publish("k1", "m1");
    waitForTruthy(() => messages.length > 1, done);
  });
  Then("It should be delivered twice", () => {
    assert.deepEqual(["m1", "m1"], messages);
  });
  When("We publish a message with routing key 2", (done) => {
    broker.publish("k2", "m2");
    waitForTruthy(() => messages.length > 2, done);
  });
  Then("It should be delivered once", () => {
    assert.deepEqual(messages, ["m1", "m1", "m2"]);
  });
});

Scenario("Pubsub using tmp queue", () => {
  var recieved;
  var broker;
  after((done) => { shutdown(broker, done); });
  When("We have a connection", () => {
    broker = init(defaultBehaviour);
  });
  And("We create a subscription without specifying a queue name", (done) => {
    broker.subscribeTmp("testRoutingKey", (msg) => {
      recieved = msg;
    }, done);
  });
  And("We publish a message", (done) => {
    broker.publish("testRoutingKey", "Hi there!");
    waitForTruthy(() => recieved, done);
  });
  Then("It should arrive correctly", () => {
    assert.deepEqual("Hi there!", recieved);
  });
});

Scenario("Cancelled sub", () => {
  var broker;
  var error;
  after((done) => { shutdown(broker, done); });
  When("We have a connection", () => {
    broker = amqp(defaultBehaviour);
  });

  And("We create a subscription", (done) => {
    broker.on("error", (err) => {
      error = err;
    });
    broker.subscribe("testRoutingKey", "testQ2", () => {}, done);
  });
  And("We delete the queue", (done) => {
    deleteRabbitQueue("testQ2", (err) => {
      if (err) return done(err);
      waitForTruthy(() => error, done);
    });
  });
  Then("An error should be raised", () => {
    assert.equal("Subscription cancelled", error);
  });
});

Feature("Bootstrapping", () => {
  var broker;
  before(killRabbitConnections);
  after((done) => { shutdown(broker, done); });
  When("Connect to the borker", () => {
    broker = amqp(defaultBehaviour);
  });
  And("We use it a ton of times", (done) => {
    var i = 0;
    async.whilst(
      () => { return i++ < 100; },
      (cb) => { broker.publish("bogus", "bogus", cb); },
      done);
  });
  Then("Only one actual connection should be created", (done) => {
    getRabbitConnections((err, conns) => {
      if (err) return done(err);
      assert.equal(1, conns.length);
      done();
    });
  });
});

function getRabbitConnections(callback) {
  request.get(adminUrl() + "/api/connections",
              (err, resp, connections) => {
                if (err) return callback(err);
                callback(null, JSON.parse(connections));
              });
}

function killRabbitConnections() {
  getRabbitConnections((err, connections) => {
    if (err) assert(false, err);
    connections.forEach(killRabbitConnection);
  });
}

function killRabbitConnection(conn) {
  deleteResource(adminUrl() + "/api/connections/" + conn.name, assert.ifError);
}

function deleteRabbitQueue(queue, done) {
  deleteResource(adminUrl() + "/api/queues/%2F/" + queue, done);
}

function deleteResource(url, done) {
  request.del(url, (err, resp, body) => {
    if (err) return done(err);
    if (resp.statusCode >= 300) return done(resp.statusCode + " " + body);
    done();
  });
}

function adminUrl() {
  return "http://guest:guest@" + RABBIT_HOST + ":15672";
}

function init(behaviour) {
  return amqp(behaviour);
}

function shutdown(broker, done) {
  if (broker) {
    broker.removeAllListeners("error");
    broker.on("error", () => {});
    broker.shutdown(done);
  } else {
    setImmediate(done);
  }
}

function waitForTruthy(fun, cb) {
  return fun() ? cb() : setTimeout(() => waitForTruthy(fun, cb), 5);
}
