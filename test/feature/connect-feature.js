"use strict";

const utils = require("../testUtils");
const assert = require("chai").assert;

Feature("Connect", () => {
  Scenario("Ok connection", () => {
    let broker, eventReceived;
    after((done) => utils.shutdown(broker, done));
    When("Connecting to default port", () => {
      broker = utils.init();
    });
    Then("The connection should be ok", (done) => {
      broker.on("connected", () => {
        eventReceived = true;
      });
      broker.publish("foobar", "foobar", done);
    });
    And("We should get a connected event", () => {
      assert(eventReceived);
    });
  });

  Scenario("Bad connection", () => {
    let broker;
    let badPortBehaviour;
    after((done) => utils.shutdown(broker, done));
    When("Trying to connect to bad port", () => {
      badPortBehaviour = { configKey: "bad-port", url: "amqp://localhost:6666" };
    });
    Then("We should get an error", (done) => {
      broker = utils.init(badPortBehaviour);
      broker.once("error", () => {
        done();
      });
      broker.publish("test", "Message");
    });
  });

  Scenario("Disconnect with reuse", () => {
    let broker;
    after((done) => utils.shutdown(broker, done));

    When("We have a connection", () => {
      broker = utils.init();
    });

    And("And we kill all rabbit connections", async () => {
      await utils.killRabbitConnections(true);
    });

    And("We sleep a while", (done) => setTimeout(done, 500));

    Then("We can use the broker again", (done) => {
      broker.publish("bogus", "Hello", done);
    });
  });
});
