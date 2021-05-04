"use strict";

const utils = require("../testUtils");
const assert = require("assert");
const async = require("async");

Feature("Publish", () => {
  Scenario("No confirm", () => {
    let broker;
    after((done) => utils.shutdown(broker, done));

    When("We have a connection with confirm=false", () => {
      broker = utils.init({ confirm: false });
    });

    Then("The callback should be invoked when we publish a message", (cb) => {
      broker.publish("testRoutingKey", "Hello hi", cb);
    });
  });

  Scenario("Confirmed publish", () => {
    let broker;
    after((done) => utils.shutdown(broker, done));

    When("We have a connection with confirm=true", () => {
      broker = utils.init({ confirm: true });
    });

    Then("The callback should be invoked when we publish a message", (cb) => {
      broker.publish("testRoutingKey", "Hello hi", cb);
    });
  });

  Scenario("2.5 second delay", () => {
    let broker;
    let received = null;
    const delay = 2500;
    after((done) => utils.shutdown(broker, done));
    before((done) =>
      async.parallel(
        [
          (cb) => utils.deleteRabbitQueue(`e1-exp-amqp-delayed-${delay}`, cb),
          (cb) => utils.deleteRabbitExchange(`e1-exp-amqp-delayed${delay}`, cb),
        ],
        done
      )
    );

    When("We have a connection", () => {
      broker = utils.init();
    });
    And("We create a subscription", () => {
      broker.subscribeTmp("testRoutingKey", (msg) => {
        received = msg;
      });
    });
    And("We publish a message with a 2.5 second deplay", () => {
      broker.delayedPublish("testRoutingKey", "Hello hi", delay);
    });

    When("We wait one second", (done) => {
      setTimeout(done, 1000);
    });
    Then("It should not have arrived yet", () => {
      assert.equal(null, received);
    });
    When("We wait 3 more seconds", (done) => {
      setTimeout(done, 3000);
    });
    Then("The message should have arrived", () => {
      assert.equal("Hello hi", received);
    });

    When("We publish another message with a 2.5 second deplay", () => {
      received = null;
      broker.delayedPublish("testRoutingKey", "Hello hi 2", delay);
    });

    When("We wait one second", (done) => {
      setTimeout(done, 1000);
    });
    Then("It should not have arrived yet", () => {
      assert.equal(null, received);
    });
    When("We wait 3 more seconds", (done) => {
      setTimeout(done, 3000);
    });
    Then("The message should have arrived", () => {
      assert.equal("Hello hi 2", received);
    });
  });
});
