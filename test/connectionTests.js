"use strict";

/* eslint no-undef: 0, new-cap: 0 */

const request = require("request");
const amqp = require("../index.js");
const assert = require("assert");
const async = require("async");
const _ = require("lodash");
const URL = require("url").URL;

const rabbitUrl = process.env.RABBIT_URL || "amqp://localhost";
const defaultBehaviour = { exchange: "e1", confirm: true, url: rabbitUrl };

Feature("Connect", () => {

  Scenario("Ok connection", () => {
    let broker;
    after((done) => shutdown(broker, done));
    When("Connecting to default port", () => {
      broker = init(defaultBehaviour);
    });
    Then("The connection should be ok", (done) => {
      broker.publish("foobar", "foobar", done);
    });
  });

  Scenario("Bad connection", () => {
    let broker;
    let badPortBehaviour;
    after((done) => shutdown(broker, done));
    When("Trying to connect to bad port", () => {
      badPortBehaviour = Object.assign({}, defaultBehaviour, { reuse: "bad-port", url: "amqp://localhost:6666" });
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
    let broker;
    after((done) => shutdown(broker, done));

    When("We have a connection", () => {
      broker = amqp(defaultBehaviour);
    });
    And("And we kill all rabbit connections", killRabbitConnections);
    And("We sleep a while", (done) => setTimeout(done, 500));
    Then("We can use the broker again", (done) => {
      broker.publish("bogus", "Hello", done);
    });
  });
});

Feature("Subscribe", () => {
  const pubTests = [
    { type: "buffer", data: new Buffer("Hello"), result: "Hello" },
    { type: "string", data: "Hello", result: "Hello" },
    { type: "object", data: { greeting: "Hello" }, result: { greeting: "Hello" } }
  ];

  pubTests.forEach((test) => {
    Scenario(`Pubsub with ${test.type} message`, () => {
      let broker;
      let received;
      after((done) => shutdown(broker, done));
      And("We have a connection", () => {
        broker = init(defaultBehaviour);
      });
      And("We create a subscription", (done) => {
        broker.on("subscribed", () => done());
        broker.subscribeTmp("testRoutingKey", (msg) => {
          received = msg;
        });
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
    const messages = [];
    let broker;

    before((done) => deleteRabbitQueue("testMultipleRoutingKeys", done));
    after((done) => shutdown(broker, done));
    const handler = (message) => {
      messages.push(message.testData);
    };
    When("We have a connection", () => {
      broker = init(defaultBehaviour);
    });
    And("We create a subscription for routing key 1 and 2", (done) => {
      broker.once("subscribed", () => done());
      broker.subscribe(["rk1", "rk2"], "testMultipleRoutingKeys", handler);
    });
    When("We publish a message with routing key 1", (done) => {
      broker.publish("rk1", { testData: "m1" });
      waitForTruthy(() => messages.length > 0, done);
    });
    Then("It should be delivered once", () => {
      assert.deepEqual(["m1"], messages);
    });
    When("We publish a message with routing key 2", (done) => {
      broker.publish("rk2", { testData: "m2" });
      waitForTruthy(() => messages.length > 1, done);
    });
    Then("It should be delivered once", () => {
      assert.deepEqual(messages, ["m1", "m2"]);
    });
  });


  Scenario("Unparsable message", () => {
    let nMessages = 0;
    let broker;
    after((done) => shutdown(broker, done));
    const handler = () => {
      nMessages++;
    };
    When("We have a connection", () => {
      broker = init(defaultBehaviour);
    });
    And("We create a subscription", (done) => {
      broker.on("subscribed", () => done());
      broker.subscribeTmp("rk1", handler);
    });
    When("We publish an unparsable message", (done) => {
      const amqpLib = require("amqplib/callback_api");
      amqpLib.connect(defaultBehaviour.url, {}, (err, conn) => {
        if (err) return done(err);
        conn.createChannel((err2, channel) => {
          if (err2) return done(err2);
          channel.publish(
            defaultBehaviour.exchange,
            "rk1",
            new Buffer("Hej knekt"), { contentType: "application/json" });
          done();
        });
      });
    });
    Then("It should not be delivered", () => {
      assert.equal(0, nMessages);
    });
    When("We publish a valid message", () => {
      broker.publish("rk1", { testData: "m2" });
    });
    Then("It should be delivered once", (done) => {
      waitForTruthy(() => nMessages === 1, done);
    });

  });

  Scenario("Multiple subscriptions", () => {
    const messages = [];
    let broker;
    const handler = (message) => {
      messages.push(message);
    };
    after((done) => shutdown(broker, done));
    When("We have a connection", () => {
      broker = init(defaultBehaviour);
    });
    And("We create a subscription with routing key 1", () => {
      broker.subscribe(["k1"], "testQ-1", handler);
    });
    And("We create another subscription qith routing key 1", () => {
      broker.subscribe(["k1"], "testQ-2", handler);
    });
    And("We create a subscription with routing key 2", (done) => {
      broker.on("subscribed", (sub) => {
        if (sub.queue === "testQ-3") done();
      });
      broker.subscribe(["k2"], "testQ-3", handler);
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
    let received;
    let broker;
    after((done) => shutdown(broker, done));
    When("We have a connection", () => {
      broker = init(defaultBehaviour);
    });
    And("We create a subscription without specifying a queue name", (done) => {
      broker.on("subscribed", () => done());
      broker.subscribeTmp("testRoutingKey", (msg) => {
        received = msg;
      });
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
    const received = [];
    let broker;
    after((done) => shutdown(broker, done));

    When("We have a connection with acknowledgement enabled and prefetch 3", () => {
      broker = init(_.defaults({ ack: true, prefetch: 3 }, defaultBehaviour));
    });
    And("We create a subscription", (done) => {
      broker.on("subscribed", () => done());
      broker.subscribeTmp("testAckRoutingKey", (msg, meta, ack) => {
        received.push({ msg: msg, ack: ack });
      });
    });
    And("We publish five messages messages", () => {
      _.times(5, () => broker.publish("testAckRoutingKey", "Hi there 1"));
    });
    Then("Only three of them should be delivered", (done) => {
      waitForTruthy(() => received.length === 3, done);
    });

    When("We acknowledge them", () => {
      received.forEach((r) => r.ack.ack());
      received.length = 0;
    });

    Then("The remaining two should be received", (done) => {
      waitForTruthy(() => received.length === 2, done);
      received.forEach((r) => r.ack.ack());
    });

  });

  Scenario("Cancelled sub", () => {
    let broker;
    let error;
    after((done) => shutdown(broker, done));
    When("We have a connection", () => {
      broker = amqp(defaultBehaviour);
    });

    And("We create a subscription", (done) => {
      broker.on("error", (err) => {
        error = err;
      });
      broker.on("subscribed", (sub) => {
        if (sub.attempt === 1) done();
      });
      broker.subscribe("testRoutingKey", "testQ2", () => {});
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
    let broker;
    let error;

    after((done) => shutdown(broker, done));
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
  let broker;
  before(killRabbitConnections);
  after((done) => shutdown(broker, done));
  When("Connect to the borker", () => {
    broker = amqp(defaultBehaviour);
  });
  And("We use it a ton of times", (done) => {
    let i = 0;
    async.whilst(
      () => i++ < 100,
      (cb) => broker.publish("bogus", "bogus", cb),
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
    let broker;
    let received = null;
    after((done) => shutdown(broker, done));
    When("We have a connection", () => {
      broker = init(defaultBehaviour);
    });
    And("We create a subscription", () => {
      broker.subscribeTmp("testRoutingKey", (msg) => {
        received = msg;
      });
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
    broker1.on("subscribed", (sub) => {
      console.log(sub);
      if (sub.attempt === 1) done();
    });
    broker1.subscribeTmp("testRoutingKey-1", (msg, meta) => {
      received1 = { msg, meta };
    });
  });

  And("We create a subscription to first connection", (done) => {
    broker2.on("subscribed", (sub) => {
      if (sub.attempt === 1) done();
    });
    broker2.subscribeTmp("testRoutingKey-2", (msg, meta) => {
      received2 = { msg, meta };
    });
  });

  When("We publish a to first connection", (done) => {
    broker1.publish("testRoutingKey-1", "Hello first");
    waitForTruthy(() => received1, done);
  });

  And("We publish a to second connection", (done) => {
    broker2.publish("testRoutingKey-2", "Hello second");
    waitForTruthy(() => received2, done);
  });

  Then("The first message should arrive correctly via the first connections exchange", () => {
    assert.equal("Hello first", received1.msg);
    assert.equal("es-first", received1.meta.fields.exchange);
  });

  And("The second messages should arrive correctly", () => {
    assert.equal("Hello second", received2.msg);
    assert.equal("es-second", received2.meta.fields.exchange);
  });
});

Feature("Negative acknowledgement", () => {

  Scenario("Default requeue behaviour", () => {
    const received = [];
    let broker;
    let requeues = 0;

    after((done) => shutdown(broker, done));

    Given("We have a connection", () => {
      broker = init(_.defaults({
        ack: true
      }, defaultBehaviour));
    });
    And("We create a subscription that will nack one message", (done) => {
      broker.on("subscribed", () => done());
      broker.subscribeTmp("testNackRoutingKey", (msg, meta, ack) => {
        received.push({
          msg: msg,
          meta: meta,
          ack: ack
        });

        const isNackMessage = msg.msgId === 0;
        const requeued = isNackMessage && received.length > 1;

        if (isNackMessage && !requeued) {
          ack.nack();
        } else {
          ack.ack();
        }
        if (requeued) {
          requeues++;
        }
      });
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
    const received = [];
    let broker;
    let requeues = 0;

    after((done) => shutdown(broker, done));

    Given("We have a connection", () => {
      broker = init(_.defaults({
        ack: true
      }, defaultBehaviour));
    });
    And("We create a subscription that will nack one message with requeue false", (done) => {
      broker.on("subscribed", () => done());
      broker.subscribeTmp("testNackRoutingKey", (msg, meta, ack) => {
        received.push({
          msg: msg,
          meta: meta,
          ack: ack
        });

        const isNackMessage = msg.msgId === 0;
        const requeued = isNackMessage && received.length > 1;

        if (isNackMessage && !requeued) {
          ack.nack(false);
        } else {
          ack.ack();
        }
        if (requeued) {
          requeues++;
        }
      });
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

  const received = [];
  let broker;
  const deadLetterReceived = [];
  let deadLetterBroker;
  let requeues = 0;

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
    broker.on("subscribed", () => done());
    broker.subscribeTmp("testNackRoutingKey", (msg, meta, ack) => {
      received.push({
        msg: msg,
        meta: meta,
        ack: ack
      });

      const isNackMessage = msg.msgId === 0;
      const requeued = isNackMessage && received.length > 1;

      if (isNackMessage && !requeued) {
        ack.nack(false);
      } else {
        ack.ack();
      }
      if (requeued) {
        requeues++;
      }
    });
  });
  And("We create a subscription to the dead letter exchange", (done) => {
    deadLetterBroker.on("subscribed", () => done());
    deadLetterBroker.subscribeTmp("testNackRoutingKey", (msg, meta, ack) => {
      deadLetterReceived.push({
        msg: msg,
        meta: meta,
        ack: ack
      });
    });
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

Feature("Metadata", () => {

  let receivedMessage;
  let broker;
  const correlationId = "123XCY";

  const msgContent = {
    "msgId": 1
  };
  const msgMeta = {
    correlationId: correlationId
  };

  after((done) => shutdown(broker, done));

  Given("We have a connection", () => {
    broker = init(_.defaults({
      ack: true
    }, defaultBehaviour));
  });
  And("We create a subscription", (done) => {
    broker.on("subscribed", () => done());
    broker.subscribeTmp("testMetaDataRoutingKey", (msg, meta, ack) => {
      receivedMessage = {
        content: msg,
        meta: meta
      };
      ack.ack();
    });
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
  request.get(
    `${adminUrl()}/api/connections`, (err, resp, connections) => {
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
  deleteResource(`${adminUrl()}/api/connections/${conn.name}`, assert.ifError);
}

function deleteRabbitQueue(queue, done) {
  deleteResource(`${adminUrl()}/api/queues/%2F/${queue}`, done);
}

function deleteResource(url, done) {
  request.del(url, (err, resp, body) => {
    if (err) return done(err);
    if (resp.statusCode >= 300) return done(`${resp.statusCode} ${body}`);
    done();
  });
}

function adminUrl() {
  const url = new URL(rabbitUrl);
  url.port = 15672;
  return url.href.replace("amqp://", "http://");
}

function init(behaviour) {
  return amqp(behaviour);
}

function shutdown(broker, done) {
  if (broker) {
    try {
      broker.removeAllListeners("error");
      broker.on("error", () => {});
      broker.shutdown((err) => {
        if (err) console.log("Ignoring shutdown error", err.message);
        done();
      });
    } catch (err) {
      console.log("Ignoring shutdown error", err.message);
      done();
    }
  } else {
    setImmediate(done);
  }
}

function waitForTruthy(fun, cb) {
  return fun() ? cb() : setTimeout(() => waitForTruthy(fun, cb), 5);
}
