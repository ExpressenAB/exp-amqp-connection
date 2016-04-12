"use strict";

/* eslint no-undef: 0, new-cap: 0 */

var request = require("request");
var amqp = require("../index.js");
var crypto = require("crypto");
var assert = require("assert");
var async = require("async");
var _ = require("lodash");

var defaultBehaviour = {exchange: "e1", confirmMode: true};
var reuseBehaviour = _.assign({}, defaultBehaviour, {reuse: "test"});
var defaultUrl = "amqp://localhost";
var connection;

Feature("Connect", function () {

  Scenario("Ok connection", function () {
    after(disconnect);
    When("Trying to connect to default port", function () {
      // Noopt
    });
    Then("We should bet able to connect", function (done) {
      connect(defaultUrl, defaultBehaviour, ignoreErrors(done));
    });
    And("The connection should be ok", testConnection);

  });

  Scenario("Bad connection", function () {
    after(disconnect);
    When("Trying to connect to bad port", function () {
    });
    Then("We should get an error", function (done) {
      connect("amqp://localhost:7832", defaultBehaviour, ensureErrors(done));
    });
  });

  Scenario("Disconnect with reuse", function () {
    after(disconnect);
    When("We have a reuse connection", function (done) {
      connect(defaultUrl, reuseBehaviour, ignoreErrors(done));
    });
    And("And we kill all rabbit connections", killRabbitConnections);
    And("We sleep a while", function (done) { setTimeout(done, 500); });
    And("We connect again", function (done) {
      connect(defaultUrl, reuseBehaviour, ignoreErrors(done));
    });
    Then("The connection should work", testConnection);
  });
});

var pubTests = [
  {type: "string", data: "Hello"},
  {type: "object", data: {greeting: "Hello"}}
];

pubTests.forEach(function (test) {
  Scenario("Pubsub with " + test.type + " message", function () {
    after(disconnect);
    var recieved;
    And("We have a connection", function (done) {
      connect(defaultUrl, defaultBehaviour, ignoreErrors(done));
    });
    And("We create a subscription", function (done) {
      connection.subscribe("testRoutingKey", "testQ1", function (msg) {
        recieved = msg;
      }, done);
    });
    And("We publish a message", function (done) {
      connection.publish("testRoutingKey", test.data, done);
    });
    Then("It should arrive correctly", function () {
      assert.deepEqual(test.data, recieved);
    });
  });
});

Scenario("Multiple routing keys", function () {
  var messages = [];
  var handler = function (message) {
    messages.push(message.testData);
  };
  after(disconnect);
  When("We have a connection", function (done) {
    connect(defaultUrl, defaultBehaviour, ignoreErrors(done));
  });
  And("We create a subscription for routing key 1 and 2", function (done) {
    connection.subscribe(["rk1", "rk2"], "testQ1", handler, done);
  });
  When("We publish a message with routing key 1", function (done) {
    connection.publish("rk1", {testData: "m1"}, done);
  });
  Then("It should be delivered once", function () {
    assert.deepEqual(["m1"], messages);
  });
  When("We publish a message with routing key 2", function (done) {
    connection.publish("rk2", {testData: "m2"}, done);
  });
  Then("It should be delivered once", function () {
    assert.deepEqual(messages, ["m1", "m2"]);
  });
});

Scenario("Cancelled sub", function () {
  after(disconnect);
  When("We have a connection", function (done) {
    connect(defaultUrl, defaultBehaviour, ignoreErrors(done));
  });
  And("We create a subscription", function (done) {
    connection.subscribe("testRoutingKey", "testQ2", function (msg) {
      message = msg;
    }, done);
  });
  And("We delete the queue, an error should be raised", function (done) {
    connection.on("error", function (err) {
      assert.equal("Subscription cancelled", err);
      done();
    });
    deleteRabbitQueue("testQ2");
  });
});

Feature("Bootstrapping", function () {
  var behaviour;
  after(disconnect);
  When("We specify a resuse key", function () {
    behaviour = {reuse: "some key"};
  });
  And("Create a ton of connections", function (done) {
    var i = 0;
    async.whilst(
      function () { return i++ < 20; },
      function (cb) { connect(defaultUrl, behaviour, cb); },
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

/*
Feature("Dead letter exchange", function () {
Scenario("Publishing failed messages on dead letter exchange", function () {
var message;
var deadLetterExchangeName = "e1.dead";
var behaviour = _.assign(defaultBehaviour, {
deadLetterExchangeName: deadLetterExchangeName,
subscribeOptions: {
ack: true
}
});

after(function (done) {
killDeadLetter(behaviour.deadLetterExchangeName, function () {
disconnect();
done();
});
});
And("We have a connection with a dead letter exchange", function (done) {
connect(defaultUrl, behaviour, ignoreErrors(done));
});
And("We are listing to the dead letter exchange", function (done) {
amqp(defaultUrl, {exchange: deadLetterExchangeName}, function (err, conn) {
if (err) return done(err);
conn.subscribe("#", "deadQ", function (msg) {
message = msg;
}, done);
});
});

And("We reject all messages", function (done) {
connection.subscribe("testRoutingKey", "TestQ3", function (msg, headers, deliveryInfo, ack) {
ack.reject(false);
}, done);
});
When("We publish a message", function (done) {
connection.publish("testRoutingKey", {testData: "hello"}, done);
});
Then("The message should be in the dead letter queue", function (done) {
setTimeout(function () {
assert.equal(message.testData, "hello");
done();
}, 50);
});
});
});
*/

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

function disconnect(done) {
  if (connection) connection.close(done);
  else done();
}

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

/*
function killDeadLetter(deadLetterExchangeName, done) {
  var queueUrl = util.format("http://guest:guest@localhost:15672/api/queues/%2F/%s.deadLetterQueue", deadLetterExchangeName);
  var exchangeUrl = util.format("http://guest:guest@localhost:15672/api/exchanges/%2F/%s", deadLetterExchangeName);

  deleteResource(exchangeUrl, function (err) {
    if (err) return done(err);
    deleteResource(queueUrl, done);
  });
}
*/

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
