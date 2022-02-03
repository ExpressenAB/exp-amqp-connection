"use strict";

const tested = require("../lib/transform");
const assert = require("assert");

Feature("Transform", () => {

  let decoded;
  const text = "Just text - e.g. soap xml";

  Scenario("Decode", () => {
    When("We receive a message without properties", () => {
      const encoded = tested.encode(text);
      const message = {
        content: encoded.buffer,
      };
      decoded = tested.decode(message);
    });
    Then("It should decode text content", () => {
      assert.equal(text, decoded);
    });
  });
});
