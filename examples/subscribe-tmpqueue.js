"use strict";

// Subscribe with temporary queue which will
// be deleted once the amqp connection is lost.

var init = require("exp-amqp-connection");

var amqpBehaviour = {
  url: "amqp://localhost",
  exchange: "my-excchange",
  ack: "true"
};

var broker = init(amqpBehaviour);

broker.on("connected", function () {
  console.log("Connected to amqp server");
});

function handleMessage(message, meta, notify) {
  console.log("Got message", message, "with routing key", meta.fields.routingKey);
  notify.ack();
}

broker.subscribeTmp("some-routing-key", handleMessage);

setInterval(function () {
  broker.publish("some-routing-key", "Hello " + new Date());
}, 1000);
