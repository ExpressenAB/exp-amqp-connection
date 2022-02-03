/* eslint-disable no-loop-func */
"use strict";

const utils = require("../testUtils");
const assert = require("assert");

Feature("Bootstrapping", () => {
  let broker;
  before(utils.killRabbitConnections);
  after((done) => utils.shutdown(broker, done));

  Scenario("Reuse connection", () => {
    When("Connect to the borker", () => {
      broker = utils.init();
    });
    And("We use it a ton of times", async () => {
      let count = 100;
      while (count--) {
        await new Promise((resolve, reject) => broker.publish("bogus", "bogus", (err) => {
          if (err) return reject(err);
          return resolve();
        }));
      }
    });

    Then("Only one actual connection should be created", async () => {
      let conns = await utils.getRabbitConnections();
      while (conns.length === 0) conns = await utils.getRabbitConnections();
      assert.equal(1, conns.length);
    });
  });

  Scenario("Same config key for different conf", () => {
    Given("A rabbit connection initialized with key 'A1'", () => {
      const orgBroker = utils.init({ configKey: "A1", exchange: "hello" });
      orgBroker.publish("1", "OK");
    });
    let borken;
    When("We initialize another connection using key 'A1', but with different settings", () => {
      borken = utils.init({ configKey: "A1", exchange: "byebye" });
    });
    let error;
    Then("It should not be usable", (done) => {
      borken.on("error", (err) => {
        error = err;
        done();
      });
      borken.publish("1", "SHOULD FAIL");
    });

    And("The error message shoukd indicate there was a problem with the conf", () => {
      assert(error.includes("same configKey"), error);
    });
  });
});
