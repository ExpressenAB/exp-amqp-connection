"use strict";

const utils = require("../testUtils");
const async = require("async");
const assert = require("assert");

Feature("Bootstrapping", () => {
  let broker;
  before(utils.killRabbitConnections);
  after((done) => utils.shutdown(broker, done));

  Scenario("Reuse connection", () => {
    When("Connect to the borker", () => {
      broker = utils.init();
    });
    And("We use it a ton of times", (done) => {
      async.forEachSeries(new Array(100), (_, cb) => broker.publish("bogus", "bogus", cb), done);
    });
    Then("Only one actual connection should be created", (done) => {
      utils.getRabbitConnections((err, conns) => {
        if (err) return done(err);
        assert.equal(1, conns.length);
        done();
      });
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
