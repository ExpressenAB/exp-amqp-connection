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
    after((done) => {
      // Ignore err from shutdown to bad port
      shutdown(broker, (err) => { // eslint-disable-line no-unused-vars
        done();
      });
    });
    When("Trying to connect to bad port", () => {
      badPortBehaviour = Object.assign({}, defaultBehaviour, {reuse: "bad-port", url: "amqp://" + RABBIT_HOST + ":6666"});
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

Feature("Pubsub", () => {
  var pubTests = [
    {type: "buffer", data: new Buffer("Hello"), result: "Hello"},
    {type: "string", data: "Hello", result: "Hello"},
    {type: "object", data: {greeting: "Hello"}, result: {greeting: "Hello"}}
  ];

  pubTests.forEach((test) => {
    Scenario("Pubsub with " + test.type + " message", () => {
      var broker;
      var received;
      after((done) => shutdown(broker, done));
      And("We have a connection", () => {
        broker = init(defaultBehaviour);
      });
      And("We create a subscription", (done) => {
        broker.subscribeTmp("testRoutingKey", (msg) => {
          received = msg;
        }, done);
      });
      And("We publish a message", (done) => {
        broker.publish("testRoutingKey", test.data);
        waitForTruthy(() => received, done);
      });
      Then("It should arrive correctly", () => {
        assert.deepEqual(test.result, received);
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


  Scenario("Unparsable message", () => {
    var nMessages = 0;
    var broker;
    after((done) => shutdown(broker, done));
    var handler = () => {
      nMessages++;
    };
    When("We have a connection", () => {
      broker = init(defaultBehaviour);
    });
    And("We create a subscription", (done) => {
      broker.subscribe("rk1", "testQ2", handler, done);
    });
    When("We publish an unparsable message", (done) => {
      var amqpLib = require("amqplib/callback_api");
      amqpLib.connect(defaultBehaviour.url, {}, (err, conn) => {
        if (err) return done(err);
        conn.createChannel((err2, channel) => {
          if (err2) return done(err2);
          channel.publish(
            defaultBehaviour.exchange,
            "rk1",
            new Buffer("Hej knekt"),
            {contentType: "application/json"});
          done();
        });
      });
    });
    Then("It should not be delivered", () => {
      assert.equal(0, nMessages);
    });
    When("We publish a valid message", () => {
      broker.publish("rk1", {testData: "m2"});
    });
    Then("It should be delivered once", (done) => {
      waitForTruthy(() => nMessages === 1, done);
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
    var received;
    var broker;
    after((done) => { shutdown(broker, done); });
    When("We have a connection", () => {
      broker = init(defaultBehaviour);
    });
    And("We create a subscription without specifying a queue name", (done) => {
      broker.subscribeTmp("testRoutingKey", (msg) => {
        received = msg;
      }, done);
    });
    And("We publish a message", (done) => {
      broker.publish("testRoutingKey", "Hi there!");
      waitForTruthy(() => received, done);
    });
    Then("It should arrive correctly", () => {
      assert.deepEqual("Hi there!", received);
    });
  });

  Scenario("Acknowledgement", () => {
    var received = [];
    var broker;
    after((done) => { shutdown(broker, done); });

    When("We have a connection with acknowledgement enabled and prefetch 3", () => {
      broker = init(_.defaults({ack: true, prefetch: 3}, defaultBehaviour));
    });
    And("We create a subscription", (done) => {
      broker.subscribeTmp("testAckRoutingKey", (msg, meta, ack) => {
        received.push({msg: msg, ack: ack});
      }, done);
    });
    And("We publish five messages messages", () => {
      _.times(5, () => broker.publish("testAckRoutingKey", "Hi there 1"));
    });
    Then("Only three of them should be delivered", (done) => {
      waitForTruthy(() => received.length === 3, done);
    });

    When("We acknowledge them", () => {
      received.forEach((r) => r.ack.ack());
      received = [];
    });

    Then("The remaining two should be received", (done) => {
      waitForTruthy(() => received.length === 2, done);
        received.forEach((r) => r.ack.ack());
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

  Scenario("Connection removed", () => {
    var broker;
    var error;

    after((done) => { shutdown(broker, done); });
    When("We have a connection", (done) => {
      broker = amqp(defaultBehaviour);
      broker.on("error", (err) => {
        error = err;
      });
      // Just do something so the connection is bootstrapped.
      broker.publish("garbage", "garbage", done);
    });

    And("We delete the connection", (done) => {
      killRabbitConnections();
      waitForTruthy(() => error, done);
    });
    Then("An error 320 should be raised", () => {
      assert.equal(320, error.code);
    });
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

Feature("Delayed publish", () => {
  Scenario("2.5 second delay", () => {
    var broker;
    let received = null;
    after((done) => shutdown(broker, done));
    When("We have a connection", () => {
      broker = init(defaultBehaviour);
    });
    And("We create a subscription", (done) => {
      broker.subscribeTmp("testRoutingKey", (msg) => {
        received = msg;
      }, done);
    });
    And("We publish a message with a 2.5 second deplay", () => {
      broker.delayedPublish("testRoutingKey", "Hello hi", 2500);
    });

    When("We wait one second", (done) => {
      setTimeout(done, 1000);
    });
    Then("It should not have arrived yet", () => {
      assert.equal(null, received);
    });
    When("We wait two more seconds", (done) => {
      setTimeout(done, 2000);
    });
    Then("The message should have arrived", () => {
      assert.equal("Hello hi", received);
    });
  });
});

Feature("Multiple connections", () => {
  let broker1, broker2;

  after((done) => shutdown(broker1, done));
  after((done) => shutdown(broker2, done));

  let received1, received2;

  Given("We have a connection to one exchange", () => {
    broker1 = init(Object.assign({}, defaultBehaviour, {
      exchange: "es-first",
      reuse: "first",
      confirm: true
    }));
  });

  And("We have a connection to another exchange", () => {
    broker2 = init(Object.assign({}, defaultBehaviour, {
      exchange: "es-second",
      reuse: "second",
      confirm: true
    }));
  });

  And("We create a subscription to first connection", (done) => {
    broker1.subscribeTmp("testRoutingKey-1", (msg) => {
      received1 = msg;
    }, done);
  });

  And("We create a subscription to first connection", (done) => {
    broker2.subscribeTmp("testRoutingKey-2", (msg) => {
      received2 = msg;
    }, done);
  });

  When("We publish a to first connection", (done) => {
    broker1.publish("testRoutingKey-1", "Hello first");
    waitForTruthy(() => received1, done);
  });

  And("We publish a to second connection", (done) => {
    broker2.publish("testRoutingKey-2", "Hello second");
    waitForTruthy(() => received2, done);
  });

  Then("The first message should arrive correctly", () => {
    assert.equal("Hello first", received1);
  });

  And("The second messages should arrive correctly", () => {
    assert.equal("Hello second", received2);
  });
});

Feature("Negative acknowledgement", () => {

  Scenario("Default requeue behaviour", () => {
    var received = [];
    var broker;
    var requeues = 0;

    after((done) => shutdown(broker, done));

    Given("We have a connection", () => {
      broker = init(_.defaults({
        ack: true
      }, defaultBehaviour));
    });
    And("We create a subscription that will nack one message", (done) => {
      broker.subscribeTmp("testNackRoutingKey", (msg, meta, ack) => {
        received.push({
          msg: msg,
          meta: meta,
          ack: ack
        });

        var isNackMessage = msg.msgId === 0;
        var requeued = isNackMessage && received.length > 1;

        if (isNackMessage && !requeued) {
          ack.nack();
        } else {
          ack.ack();
        }
        if (requeued) {
          requeues++;
        }
      }, done);
    });
    When("We publish 3 messages", () => {
      _.times(3, (n) => broker.publish("testNackRoutingKey", {
        "msgId": n
      }));
    });
    Then("There should be 4 received messages", (done) => {
      waitForTruthy(() => received.length === 4, done);
    });
    And("One message should have been requeued", () => {
      assert.equal(requeues, 1);
    });
  });

  Scenario("Not requeueing nacked messages", () => {
    var received = [];
    var broker;
    var requeues = 0;

    after((done) => shutdown(broker, done));

    Given("We have a connection", () => {
      broker = init(_.defaults({
        ack: true
      }, defaultBehaviour));
    });
    And("We create a subscription that will nack one message with requeue false", (done) => {
      broker.subscribeTmp("testNackRoutingKey", (msg, meta, ack) => {
        received.push({
          msg: msg,
          meta: meta,
          ack: ack
        });

        var isNackMessage = msg.msgId === 0;
        var requeued = isNackMessage && received.length > 1;

        if (isNackMessage && !requeued) {
          ack.nack(false);
        } else {
          ack.ack();
        }
        if (requeued) {
          requeues++;
        }
      }, done);
    });
    When("We publish 3 messages", () => {
      _.times(3, (n) => broker.publish("testNackRoutingKey", {
        "msgId": n
      }));
    });
    Then("There should be 3 received messages", (done) => {
      waitForTruthy(() => received.length === 3, done);
    });
    And("No messages should have been requeued", () => {
      assert.equal(requeues, 0);
    });
  });

});

Feature("Dead letter exchange", () => {

  var received = [];
  var broker;
  var deadLetterReceived = [];
  var deadLetterBroker;
  var requeues = 0;

  after((done) => shutdown(broker, done));

  Given("We have a connection with a dead letter exchange", () => {
    broker = init(_.defaults({
      ack: true,
      queueArguments: {
        "x-dead-letter-exchange": "DLX"
      }
    }, defaultBehaviour));
  });
  And("We have a connection to said dead letter exchange", () => {
    deadLetterBroker = init(_.defaults({
      exchange: "DLX"
    }, defaultBehaviour));
  });
  And("We create a subscription that will nack one message without requeueing", (done) => {
    broker.subscribeTmp("testNackRoutingKey", (msg, meta, ack) => {
      received.push({
        msg: msg,
        meta: meta,
        ack: ack
      });

      var isNackMessage = msg.msgId === 0;
      var requeued = isNackMessage && received.length > 1;

      if (isNackMessage && !requeued) {
        ack.nack(false);
      } else {
        ack.ack();
      }
      if (requeued) {
        requeues++;
      }
    }, done);
  });
  And("We create a subscription to the dead letter exchange", (done) => {
    deadLetterBroker.subscribeTmp("testNackRoutingKey", (msg, meta, ack) => {
      deadLetterReceived.push({
        msg: msg,
        meta: meta,
        ack: ack
      });
    }, done);
  });
  When("We publish 3 messages", () => {
    _.times(3, (n) => broker.publish("testNackRoutingKey", {
      "msgId": n
    }));
  });
  Then("There should be 3 received messages", (done) => {
    waitForTruthy(() => received.length === 3, done);
  });
  And("No messages should have been requeued", () => {
    assert.equal(requeues, 0);
  });
  And("There should be 1 received dead letter", (done) => {
    waitForTruthy(() => deadLetterReceived.length === 1, done);
  });
});

Feature("Exchange type and options", () => {
  Scenario("Alternate exchange", () => {
    var broker;
    var alternateBroker;
    var alternateReceived;
    var msgContent = {
      msgId: 1
    };

    after((done) => shutdown(broker, () => shutdown(alternateBroker, done)));

    Given("We have a connection", () => {
      broker = init(_.defaults({
        exchange: "pe",
        exchangeOptions: {
          alternateExchange: "ae"
        }
      }, defaultBehaviour));
      broker.on("error", console.error);
    });

    And("A connection to an alternate exchange", () => {
      alternateBroker = init(_.defaults({
        reuse: "alternate",
        exchange: "ae"
      }, defaultBehaviour));
      alternateBroker.on("error", console.error);
    });

    And("A subscription to alternate exchange", (done) => {
      alternateBroker.subscribeTmp("testAlternateRoutingKey", (msg) => {
        alternateReceived = msg;
      }, done);
    });

    When("We publish a message", (done) => {
      broker.publish("testAlternateRoutingKey", msgContent, done);
    });

    Then("We receive it on the alternate exchange", () => {
      waitForTruthy(() => alternateReceived, () => {
        assert.equal(alternateReceived.msgId, 1);
      });
    });
  });

  Scenario("Exchange type", () => {
    var broker;
    var received1;
    var received2;
    var msgContent = {
      msgId: 1
    };

    after((done) => shutdown(broker, done));

    Given("We have a connection to a fanout exchange", () => {
      broker = init(_.defaults({
        exchange: "fanout",
        exchangeType: "fanout"
      }, defaultBehaviour));
      broker.on("error", console.error);
    });

    And("A subscription", (done) => {
      broker.subscribeTmp("foo", (msg) => { received1 = msg; }, done);
    });

    And("Another subscription", (done) => {
      broker.subscribeTmp("bar", (msg) => { received2 = msg; }, done);
    });

    When("We publish a message", (done) => {
      broker.publish("baz", msgContent, done);
    });

    Then("We receive it on both queues, disregarding routing key", () => {
      waitForTruthy(() => received1 && received2, () => {
        assert.equal(received1.msgId, 1);
        assert.equal(received2.msgId, 1);
      });
    });
  });
});

Feature("Metadata", () => {

  var receivedMessage;
  var broker;
  var correlationId = "123XCY";

  var msgContent = {
    "msgId": 1
  };
  var msgMeta = {
    correlationId: correlationId
  };

  after((done) => shutdown(broker, done));

  Given("We have a connection", () => {
    broker = init(_.defaults({
      ack: true
    }, defaultBehaviour));
    broker.on("error", (err) => {
      console.log(err);
    });
  });
  And("We create a subscription", (done) => {
    broker.subscribeTmp("testMetaDataRoutingKey", (msg, meta, ack) => {
      receivedMessage = {
        content: msg,
        meta: meta
      };
      ack.ack();
    }, done);
  });
  When("We publish a message with a correlationId", (done) => {
    broker.publish("testMetaDataRoutingKey", msgContent, msgMeta);
    waitForTruthy(() => receivedMessage, done);
  });
  Then("Received message should contain expected correlationId", () => {
    assert.equal(receivedMessage.content.msgId, 1);
    assert(receivedMessage.meta.properties.correlationId);
    assert.equal(receivedMessage.meta.properties.correlationId, correlationId);
  });
  When("We publish another message with correlationId and a 0.5 second delay", () => {
    receivedMessage = {};
    msgContent.msgId = 2;
    broker.delayedPublish("testMetaDataRoutingKey", msgContent, 500, msgMeta);
  });
  And("We wait 0.6 seconds", (done) => {
    setTimeout(done, 600);
  });
  Then("Received message should contain expected correlationId", () => {
    assert.equal(receivedMessage.content.msgId, 2);
    assert(receivedMessage.meta.properties.correlationId);
    assert.equal(receivedMessage.meta.properties.correlationId, correlationId);
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
