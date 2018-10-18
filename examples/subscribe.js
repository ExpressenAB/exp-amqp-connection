"use strict";

var init = require("exp-amqp-connection");

var amqpBehaviour = {
  url: "amqp://localhost",
  exchange: "my-excchange",
  ack: "true",
  prefetch: 10
};

var broker = init(amqpBehaviour);

broker.on("connected", function() {
  console.log("Connected to amqp server");
});

broker.on("subscribed", function(subscription) {
  console.log("Subscription started:", subscription);
});

// Simplest way to deal with errors: abort the process.
// Assuming of course that you have a scheduler or process manager (kubernetes,
// pm2, forever etc) in place to restart your process.
//
// NOTE: See the "subcribe-reconnect" example on how to handle errors without
// restarting the process.
broker.on("error", function(error) {
  console.error("Amqp error", error, ", aborting process.");
  process.exit(1);
});

function handleMessage(message, meta, notify) {
  console.log("Got message", message, "with routing key", meta.fields.routingKey);
  notify.ack();
}

broker.subscribe("some-routing-key", "some-queue", handleMessage);

setInterval(function() {
  broker.publish("some-routing-key", "Hello " + new Date());
}, 1000);