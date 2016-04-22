"use strict";

// Simplest way to subscribe. Start the subscription and don't listen to "error" events
// from the broker. This will cause the process to crash in case of errors.
// This of course requires a process manager such as "pm2" or "forever" in place
// to restart the process.

var bootstrap = require("exp-amqp-connection");

var amqpBehaviour = {
  exchange: "myExchange",
  ack: "true" // We want ack our messages during subscribe (see below)
};

bootstrap("amqp://localhost", amqpBehaviour, function (err, broker) {
  if (err) return console.log(err);
  broker.subscribe([], "someQueue", handleMessage);
});

function handleMessage(message, meta, notify) {
  console.log("Got message", message, "with routing key", meta.routingKey);
  notify.ack();
}
