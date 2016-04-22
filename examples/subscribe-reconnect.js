"use strict";

// Start a subscription. Restarts the subscription in case of errors

var bootstrap = require("exp-amqp-connection");

var resubTimer;

var amqpBehaviour = {
  exchange: "myExchange",
  ack: "true" // We want ack our messages during subscribe
};

function subscribe() {
  resubTimer = null;
  bootstrap("amqp://localhost", amqpBehaviour, function (err, broker) {
    if (err) return handleError(err);
    broker.on("error", handleError);
    broker.subscribe([], "someQueue", handleMessage, handleError);
  });
}

function handleMessage(message, meta, notify) {
  console.log("Got message", message, "with routing key", meta.routingKey);
  notify.ack();
}

function handleError(err) {
  if (err) {
    console.log("Re-subscribing due to amqp error:", err);
    // Sleep 5 seconds before trying to subsribe again.
    // Also ensure that we don't have a resubscribe pending already.
    if (!resubTimer) {
      resubTimer = setTimeout(subscribe, 5000);
    }
  }
}

subscribe();
