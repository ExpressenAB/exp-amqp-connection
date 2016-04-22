"use strict";

var bootstrap = require("exp-amqp-connection");

var amqpBehaviour = {
  exchange: "my-exchange",
  confirm: true // Enables callback as last parameter to the publish functions
};

bootstrap("amqp://localhost", amqpBehaviour, function (connErr, conn) {
  if (connErr) return console.log("AMQP connect error", connErr);
  conn.publish("some-routing-key", "Hello", function (err) {
    if (err) console.error("Amqp server failed to deliver message");
  });
});
