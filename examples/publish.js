"use strict";

const init = require("..");

const amqpBehaviour = {
  url: "amqp://localhost",
  exchange: "my-exchange",
  confirm: true // Enables callback as last parameter to the publish functions
};

const broker = init(amqpBehaviour);

broker.on("connected", () => {
  console.log("Connected to amqp server");
});

broker.publish("some-routing-key", "Hello", (err) => {
  if (err) return console.log("Amqp server failed to deliver message");
  console.log("Message delivered.");
  broker.shutdown();
});
