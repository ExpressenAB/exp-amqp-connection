"use strict";

// Start a subscription. Restarts the subscription in case of errors

const init = require("exp-amqp-connection");

const amqpBehaviour = {
  url: "amqp://localhost",
  exchange: "my-excchange",
  ack: "true",
  resubscribeOnError: true
};

const broker = init(amqpBehaviour);

broker.on("connected", () => {
  console.log("Connected to amqp server");
});

broker.on("error", (error) => {
  console.log("AMQP error:", error);
});

function handleMessage(message, meta, notify) {
  console.log("Got message", message, "with routing key", meta.fields.routingKey);
  notify.ack();
}

broker.subscribe("some-routing-key", "some-queue", handleMessage);

setInterval(() => {
  broker.publish("some-routing-key", "Hello");
}, 1000);
