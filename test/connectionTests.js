"use strict";

/* eslint no-undef: 0, new-cap: 0 */

var request = require("request");
var amqp = require("../index.js");
var crypto = require("crypto");
var assert = require("assert");
var async = require("async");
var _ = require("lodash");

var defaultBehaviour = {exchange: "e1", confirm: true};
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
  var error;
  var errorHandlingBehaviour = _.extend({}, defaultBehaviour, {errorHandler: function (err) {
    if (!error) error = err;
  }});
  When("We have a connection", function (done) {
    connect(defaultUrl, errorHandlingBehaviour, ignoreErrors(done));
  });
  And("We create a subscription", function (done) {
    connection.on("error", function (err) {
      error = err;
    });
    connection.subscribe("testRoutingKey", "testQ2", function () {}, done);
  });
  And("We delete the queue", function (done) {
    deleteRabbitQueue("testQ2", done);
  });
  Then("An error should be raised", function () {
    assert.equal("Subscription cancelled", error);
  });
});

Feature("Bootstrapping", function () {
  var behaviour;
  before(killRabbitConnections);
  after(disconnect);
  When("We specify a resuse key", function () {
    behaviour = {reuse: "some key"};
  });
  And("Create a ton of connections", function (done) {
    var i = 0;
    async.whilst(
      function () { return i++ < 100; },
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

function testConnection(done) {
  var randomRoutingKey = "RK" + crypto.randomBytes(6).toString("hex");
  connection.subscribe(randomRoutingKey, randomRoutingKey, function () {
    done();
  }, function (err) {
    if (err) return done(err);
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
  amqp(opts, behaviour, function (err, conn) {
    if (err) return callback(err);
    connection = conn;
    if (conn.listenerCount("error") === 0) {
      conn.addListener("error", console.log);
    }
    return callback(null, conn);
  });
}

function disconnect(done) {
  if (connection) {
    connection.close(function (err) {
      if (err) console.log("Ignoring close error: ", err);
      done();
    });
  } else {
    done();
  }
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
