"use strict";

const utils = require("../testUtils");
const assert = require("assert");

Feature("Multiple connections", () => {
  let broker1, broker2;

  after((done) => utils.shutdown(broker1, done));
  after((done) => utils.shutdown(broker2, done));

  let received1, received2;

  Given("We have a connection to one exchange", () => {
    broker1 = utils.init({
      exchange: "es-first",
      configKey: "first",
      confirm: true
    });
  });

  And("We have a connection to another exchange", () => {
    broker2 = utils.init({
      exchange: "es-second",
      configKey: "second",
      confirm: true
    });
  });

  And("We create a subscription to first connection", (done) => {
    broker1.on("subscribed", (sub) => {
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
    utils.waitForTruthy(() => received1, done);
  });

  And("We publish a to second connection", (done) => {
    broker2.publish("testRoutingKey-2", "Hello second");
    utils.waitForTruthy(() => received2, done);
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
