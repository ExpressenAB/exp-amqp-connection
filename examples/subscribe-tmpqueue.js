"use strict";

// Omit the queue name when subscribing to get a temporary queue which will
// be deleted once the amqp connection is lost.

var bootstrap = require("exp-amqp-connection");

var amqpBehaviour = {
  exchange: "my-exchange"
};

bootstrap("amqp://localhost", amqpBehaviour, function (err, broker) {
  if (err) return console.log(err);
  broker.subscribe("some-routing-key", undefined, handleMessage);
});

function handleMessage(message) {
  console.log("Got message", message);
}
