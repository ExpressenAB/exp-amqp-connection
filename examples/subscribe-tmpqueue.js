"use strict";

// Omit the queue name when subscribing to get a temporary queue which will
// be deleted once the amqp connection is lost.

var bootstrap = require("exp-amqp-connection");

var amqpBehaviour = {
  exchange: "myExchange"
};

bootstrap("amqp://localhost", amqpBehaviour, function (err, broker) {
  if (err) return console.log(err);
  broker.subscribe("routing-key-pattern", undefined, handleMessage);
});

function handleMessage(message) {
  console.log("Got message", message);
}
