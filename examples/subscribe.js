"use strict";

// Simplest way to subscribe. Start the subscription and don't listen to "error" events
// from the broker. This will cause the process to crash in case of errors.
// This of course requires a process manager such as "pm2" or "forever" in place
// to restart the process.

var init = require("exp-amqp-connection");

var amqpBehaviour = {
  url: "amqp://localhost",
  exchange: "my-excchange",
  ack: "true",
  prefetch: 10
};

var broker = init(amqpBehaviour);

broker.on("connected", function () {
  console.log("Connected to amqp server");
});

broker.on("subscribed", function (subscription) {
  console.log("Subscription started:", subscription);
});

function handleMessage(message, meta, notify) {
  console.log("Got message", message, "with routing key", meta.fields.routingKey);
  notify.ack();
}

broker.subscribe("some-routing-key", "some-queue", handleMessage);

setInterval(function () {
  broker.publish("some-routing-key", "Hello " + new Date());
}, 1000);
