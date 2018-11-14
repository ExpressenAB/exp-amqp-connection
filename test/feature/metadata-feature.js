"use strict";

const utils = require("../testUtils");
const assert = require("assert");

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

  after((done) => utils.shutdown(broker, done));

  Given("We have a connection", () => {
    broker = utils.init({
      ack: true,
      configKey: "metaDataTest",
    });
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
    utils.waitForTruthy(() => receivedMessage, done);
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
