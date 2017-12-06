"use strict";

/* eslint no-undef: 0, new-cap: 0 */

var tested = require("../transform");
var assert = require("assert");

Feature("Transform", () => {

  var decoded;
  var text = "Just text - e.g. soap xml";

  Scenario("Decode", () => {
    When("We receive a message without properties", () => {
      var encoded = tested.encode(text);
      var message = {
        content: encoded.buffer
      };
      decoded = tested.decode(message);
    });
    Then("It should decode text content", () => {
      assert.equal(text, decoded);
    });
  });
});
