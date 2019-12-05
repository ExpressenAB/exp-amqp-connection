"use strict";

const utils = require("../testUtils");
const assert = require("assert");

Feature("Dead letter exchange", () => {

  const received = [];
  let broker;
  const deadLetterReceived = [];
  let deadLetterBroker;
  let requeues = 0;

  after((done) => utils.shutdown(broker, done));

  Given("We have a connection with a dead letter exchange", () => {
    broker = utils.init({
      ack: true,
      configKey: "deadLetterTest",
      queueArguments: {
        "x-dead-letter-exchange": "DLX"
      }
    });
  });
  And("We have a connection to said dead letter exchange", () => {
    deadLetterBroker = utils.init({
      exchange: "DLX",
      configKey: "deadLetterTest2",
    });
  });

  And("We create a subscription that will nack one message without requeueing", (done) => {
    broker.once("subscribed", () => done());
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

    for (let i = 0; i < 3; i++) {
      broker.publish("testNackRoutingKey", { "msgId": i });
    }
  });
  Then("There should be 3 received messages", (done) => {
    utils.waitForTruthy(() => received.length === 3, done);
  });
  And("No messages should have been requeued", () => {
    assert.equal(requeues, 0);
  });
  And("There should be 1 received dead letter", (done) => {
    utils.waitForTruthy(() => deadLetterReceived.length === 1, done);
  });
});
