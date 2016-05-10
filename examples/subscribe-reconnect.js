"use strict";

// Start a subscription. Restarts the subscription in case of errors

var init = require("exp-amqp-connection");

var amqpBehaviour = {
  url: "amqp://localhost",
  exchange: "my-excchange",
  ack: "true",
  resubscribeOnError: true
};

var broker = init(amqpBehaviour);

broker.on("connected", function () {
  console.log("Connected to amqp server");
});

broker.on("error", function (error) {
  console.log("AMQP error:", error);
});

function handleMessage(message, meta, notify) {
  console.log("Got message", message, "with routing key", meta.fields.routingKey);
  notify.ack();
}

broker.subscribe("some-routing-key", "some-queue", handleMessage);

setInterval(function () {
  broker.publish("some-routing-key", "Hello " + new Date());
}, 1000);
