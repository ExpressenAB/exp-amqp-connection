"use strict";

var bootstrap = require("exp-amqp-connection");

var amqpBehaviour = {
  exchange: "my-exchange",
  confirm: true // Enables callback as last parameter to the publish functions
};

function publish() {
  bootstrap("amqp://localhost", amqpBehaviour, function (connErr, broker) {
    if (connErr) return console.log("AMQP connect error", connErr);
    broker.publish("some-routing-key", "Hello " + new Date(), function (err) {
      if (err) console.error("Amqp server failed to deliver message");
    });
  });
}

setInterval(publish, 1000);
