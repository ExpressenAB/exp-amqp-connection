"use strict";

// Subscribe with temporary queue which will
// be deleted once the amqp connection is lost.

const init = require("..");

const amqpBehaviour = {
  url: "amqp://localhost",
  exchange: "my-excchange",
  ack: "true",
};

const broker = init(amqpBehaviour);

broker.on("error", (err) => console.log(`AMQP Error: ${err}`));

broker.on("connected", () => {
  console.log("Connected to amqp server");
});

function handleMessage(message, meta, notify) {
  console.log("Got message", message, "with routing key", meta.fields.routingKey);
  notify.ack();
}

broker.subscribeTmp("some-routing-key", handleMessage);

setInterval(() => {
  broker.publish("some-routing-key", `Hello ${new Date()}`);
}, 1000);
