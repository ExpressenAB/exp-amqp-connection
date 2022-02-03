"use strict";

const utils = require("../testUtils");
const assert = require("assert");

Feature("Negative acknowledgement", () => {

  Scenario("Default requeue behaviour", () => {
    const received = [];
    let broker;
    let requeues = 0;

    after((done) => utils.shutdown(broker, done));

    Given("We have a connection", () => {
      broker = utils.init({
        ack: true,
        configKey: "ackTest",
      });
    });
    And("We create a subscription that will nack one message", (done) => {
      broker.on("subscribed", () => done());
      broker.subscribeTmp("testNackRoutingKey", (msg, meta, ack) => {
        received.push({
          msg,
          meta,
          ack,
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
      for (let i = 0; i < 3; i++) {
        broker.publish("testNackRoutingKey", { msgId: i });
      }
    });
    Then("There should be 4 received messages", (done) => {
      utils.waitForTruthy(() => received.length === 4, done);
    });
    And("One message should have been requeued", () => {
      assert.equal(requeues, 1);
    });
  });

  Scenario("Not requeueing nacked messages", () => {
    const received = [];
    let broker;
    let requeues = 0;

    after((done) => utils.shutdown(broker, done));

    Given("We have a connection", () => {
      broker = utils.init({
        ack: true,
        configKey: "nackTest",
      });
    });
    And("We create a subscription that will nack one message with requeue false", (done) => {
      broker.on("subscribed", () => done());
      broker.subscribeTmp("testNackRoutingKey", (msg, meta, ack) => {
        received.push({
          msg,
          meta,
          ack,
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
      for (let i = 0; i < 3; i++) {
        broker.publish("testNackRoutingKey", { msgId: i });
      }
    });
    Then("There should be 3 received messages", (done) => {
      utils.waitForTruthy(() => received.length === 3, done);
    });
    And("No messages should have been requeued", () => {
      assert.equal(requeues, 0);
    });
  });
});
