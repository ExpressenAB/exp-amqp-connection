# Simple message broker library.

## Features

* Hides underlying amqp implementation details
* Publish
* Subscribe
* Optionally kill process on errors
* Reuse connection

## Examples

### Publish

    var amqpConn = require("exp-amqp-connection");
    amqpConn({host: "amqphost"}, {exchange: "myExchange"}, function (err, conn) {
      if (err) return console.err(err);
      conn.publish("myRoutingKey", "a message");
    })

### Subscribe

    var amqpConn = require("exp-amqp-connection");
    amqpConn({host: "amqphost"}, {exchange: "myExchange"}, function (err, conn) {
      if (err) return console.err(err);
      conn.subscribe("myRoutingKey", "a message");
      });

### Reuse connection

All calls providing the same reuse key will get the same connection returned. If no
reuse key is provided, a new connection is returned each time.

The following will yield a single connection to rabbit instead of 5000:

    var amqpConn = require("exp-amqp-connection");

    for(var i = 0; i < 5000; i++) {
      amqpConn({host: "amqphost"}, {reuse: "SomeKey"}, function (err, conn) {
        if (err) return console.err(err);
        conn.publish("myRoutingKey", "a message");
        });
    }



