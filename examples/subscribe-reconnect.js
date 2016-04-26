"use strict";

// Start a subscription. Restarts the subscription in case of errors

var bootstrap = require("exp-amqp-connection");

var resubTimer;

var amqpBehaviour = {
  exchange: "my-excchange",
  ack: "true" // We want ack our messages during subscribe
};

function subscribe() {
  resubTimer = null;
  bootstrap("amqp://localhost", amqpBehaviour, function (err, broker) {
    if (err) return handleError(err);
    broker.on("error", handleError);
    broker.subscribe("some-routing-key", "some-queue", handleMessage, handleError);
  });
}

function handleMessage(message, meta, notify) {
  console.log("Got message", message, "with routing key", meta.fields.routingKey);
  notify.ack();
}

function handleError(err) {
  if (err && !resubTimer) {
      // Sleep 5 seconds before trying to subsribe again.
      console.log("Re-subscribing due to amqp error:", err);
      resubTimer = setTimeout(subscribe, 5000);
  }
}

subscribe();
