"use strict";

const utils = require("../testUtils");
const assert = require("assert");

Feature("Subscribe", () => {
  const pubTests = [
    { type: "buffer", data: Buffer.from("Hello"), result: "Hello" },
    { type: "string", data: "Hello", result: "Hello" },
    {
      type: "object",
      data: { greeting: "Hello" },
      result: { greeting: "Hello" },
    },
  ];

  let broker;

  afterEachScenario((done) => {
    if (broker) return utils.shutdown(broker, done);
    else done();
  });

  pubTests.forEach((test) => {
    Scenario(`Pubsub with ${test.type} message`, () => {
      let received;
      And("We have a connection", () => {
        broker = utils.init();
      });
      And("We create a subscription", (done) => {
        broker.on("subscribed", () => done());
        broker.subscribeTmp("testRoutingKey", (msg) => {
          received = msg;
        });
      });
      And("We publish a message", (done) => {
        broker.publish("testRoutingKey", test.data);
        utils.waitForTruthy(() => received, done);
      });
      Then("It should arrive correctly", () => {
        assert.deepEqual(test.result, received);
      });
    });
  });

  Scenario("Multiple routing keys", () => {
    const messages = [];

    before(() => utils.deleteRabbitQueue("testMultipleRoutingKeys"));

    const handler = (message) => {
      messages.push(message.testData);
    };
    When("We have a connection", () => {
      broker = utils.init();
    });
    And("We create a subscription for routing key 1 and 2", (done) => {
      broker.once("subscribed", () => done());
      broker.subscribe(["rk1", "rk2"], "testMultipleRoutingKeys", handler);
    });
    When("We publish a message with routing key 1", (done) => {
      broker.publish("rk1", { testData: "m1" });
      utils.waitForTruthy(() => messages.length > 0, done);
    });
    Then("It should be delivered once", () => {
      assert.deepEqual(["m1"], messages);
    });
    When("We publish a message with routing key 2", (done) => {
      broker.publish("rk2", { testData: "m2" });
      utils.waitForTruthy(() => messages.length > 1, done);
    });
    Then("It should be delivered once", () => {
      assert.deepEqual(messages, ["m1", "m2"]);
    });
  });

  Scenario("Unparsable message", () => {
    let nMessages = 0;
    const handler = () => {
      nMessages++;
    };
    When("We have a connection", () => {
      broker = utils.init();
    });
    And("We create a subscription", (done) => {
      broker.on("subscribed", () => done());
      broker.subscribeTmp("rk1", handler);
    });
    When("We publish an unparsable message", (done) => {
      const amqpLib = require("amqplib/callback_api");
      amqpLib.connect(utils.defaultBehaviour.url, {}, (err, conn) => {
        if (err) return done(err);
        conn.createChannel((err2, channel) => {
          if (err2) return done(err2);
          channel.publish(
            utils.defaultBehaviour.exchange,
            "rk1",
            Buffer.from("Hej knekt"),
            { contentType: "application/json" }
          );
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
      utils.waitForTruthy(() => nMessages === 1, done);
    });
  });

  Scenario("Multiple subscriptions", () => {
    const messages = [];
    const ts = new Date().getTime();
    const q1 = `msub1-${ts}`,
      q2 = `msub2-${ts}`,
      q3 = `msub3-${ts}`;

    const handler = (message) => {
      messages.push(message);
    };

    When("We have a connection", () => {
      broker = utils.init();
    });
    And("We create a subscription with routing key 1", (done) => {
      broker.on("subscribed", (sub) => sub.queue === q1 && done());
      broker.subscribe(["k1"], q1, handler);
    });
    And("We create another subscription qith routing key 1", (done) => {
      broker.on("subscribed", (sub) => sub.queue === q2 && done());
      broker.subscribe(["k1"], q2, handler);
    });
    And("We create a subscription with routing key 2", (done) => {
      broker.on("subscribed", (sub) => sub.queue === q3 && done());
      broker.subscribe(["k2"], q3, handler);
    });

    When("We publish a message with key 1", (done) => {
      broker.publish("k1", "m1");
      utils.waitForTruthy(() => messages.length > 1, done);
    });
    Then("It should be delivered twice", () => {
      assert.deepEqual(["m1", "m1"], messages);
    });
    When("We publish a message with routing key 2", (done) => {
      broker.publish("k2", "m2");
      utils.waitForTruthy(() => messages.length > 2, done);
    });
    Then("It should be delivered once", () => {
      assert.deepEqual(messages, ["m1", "m1", "m2"]);
    });
  });

  Scenario("Pubsub using tmp queue", () => {
    let received;
    When("We have a connection", () => {
      broker = utils.init();
    });
    And("We create a subscription without specifying a queue name", (done) => {
      broker.on("subscribed", () => done());
      broker.subscribeTmp("testRoutingKey", (msg) => {
        received = msg;
      });
    });
    And("We publish a message", (done) => {
      broker.publish("testRoutingKey", "Hi there!");
      utils.waitForTruthy(() => received, done);
    });
    Then("It should arrive correctly", () => {
      assert.deepEqual("Hi there!", received);
    });
  });

  Scenario("Acknowledgement", () => {
    const received = [];

    When(
      "We have a connection with acknowledgement enabled and prefetch 3",
      () => {
        broker = utils.init({ ack: true, prefetch: 3, configKey: "3prefetch" });
      }
    );
    And("We create a subscription", (done) => {
      broker.on("subscribed", () => done());
      broker.subscribeTmp("testAckRoutingKey", (msg, meta, ack) => {
        received.push({ msg: msg, ack: ack });
      });
    });
    And("We publish five messages messages", () => {
      for (let i = 0; i < 5; i++) {
        broker.publish("testAckRoutingKey", "Hi there 1");
      }
    });
    Then("Only three of them should be delivered", (done) => {
      utils.waitForTruthy(() => received.length === 3, done);
    });

    When("We acknowledge them", () => {
      received.forEach((r) => r.ack.ack());
      received.length = 0;
    });

    Then("The remaining two should be received", (done) => {
      utils.waitForTruthy(() => received.length === 2, done);
      received.forEach((r) => r.ack.ack());
    });
  });

  Scenario("Cancelled sub", () => {
    let error;
    When("We have a connection", () => {
      broker = utils.init();
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
      utils.deleteRabbitQueue("testQ2");
      utils.waitForTruthy(() => error, done);
    });
    Then("An error should be raised", () => {
      assert.equal("Subscription cancelled", error);
    });
  });

  Scenario("Connection removed", () => {
    let error = null;

    before(utils.killRabbitConnections);

    When("We have a connection", (done) => {
      broker = utils.init();
      broker.on("error", (err) => {
        error = err;
      });
      // Just do something so the connection is bootstrapped.
      broker.publish("garbage", "garbage", done);
    });

    And("We delete the connection", (done) => {
      utils.waitForTruthy(() => error, done);
      utils.killRabbitConnections(true);
    });
    Then("An error 320 should be raised", () => {
      assert(error !== null);
    });
  });
});
