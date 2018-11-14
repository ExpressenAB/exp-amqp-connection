"use strict";

const utils = require("../testUtils");
const assert = require("assert");

Feature("Delayed publish", () => {
  Scenario("2.5 second delay", () => {
    let broker;
    let received = null;
    after((done) => utils.shutdown(broker, done));
    When("We have a connection", () => {
      broker = utils.init();
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
