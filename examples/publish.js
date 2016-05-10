"use strict";

var init = require("exp-amqp-connection");

var amqpBehaviour = {
  url: "amqp://localhost",
  exchange: "my-exchange",
  confirm: true // Enables callback as last parameter to the publish functions
};

var broker = init(amqpBehaviour);

broker.on("connected", function () {
  console.log("Connected to amqp server");
});

broker.publish("some-routing-key", "Hello " + new Date(), function (err) {
  if (err) return console.log("Amqp server failed to deliver message");
  console.log("Message delivered.");
  broker.shutdown();
});

