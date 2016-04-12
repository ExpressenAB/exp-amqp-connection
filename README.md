# Simple amqp library

[![Build Status](https://travis-ci.org/ExpressenAB/exp-amqp-connection.svg?branch=master)](https://travis-ci.org/ExpressenAB/exp-amqp-connection)

Usage patterns

- Publish
- Subscribe - exit process on error
- Subscribe - reconnect on error

NOTE: Not possible to create channels, inheritance from node-amqp.

## Features

* Hides underlying amqp implementation details
* Publish
* Subscribe
* Reuse connection

## API

A single function is exported:

```js
var amqpConn = require("exp-amqp-connection");

amqpConn({host: "amqphost"}, {reuse: "myKey", exchange: "myExchange"}, function (err, conn) {
  if (err) return console.err(err);
  ...
});
```

The first arg is amqp connection options.
See https://github.com/postwait/node-amqp#connection-options-and-url.

The second arg defines various behaviour options:

```javascript
var behaviourOpts = {
  dieOnError: "...", // If true, kill the node process in case of amqp errors
  exchange: "...", // Name of exchange to use. Leave undefined for rabbit default exchange.
  reuse: "...", // Reuse connections using the specified key
  logger: "..." // one-arg-function used for logging errors. Defaults to console.log
  deadLetterExchangeName: "...", // Enable dead letter exchange by setting a name for it.
  exchangeOptions: "...", // Options to pass to the exchange
  queueOptions: "...", // Options to pass to the queue
  subscribeOptions: "...", // Options to use for subscribing,
  consumerCancelNotification: "..." // If true, enable rabbit consumner cancel notifications.
                                    // Causes exit of dieOnError is set, otherwise the notification
                                    // will just be logged
};
```

More info om consumer cancel notifications here: http://www.rabbitmq.com/consumer-cancel.html

Default values for options, these will be merged with your changes:

```javascript
var defaultExchangeOptions = {
  durable: true,
  autoDelete: false,
  confirm: true
};
var defaultQueueOptions = {
  autoDelete: true
};
var defaultSubscribeOptions = {};

```

## Examples

### Publish

```js
var amqpConn = require("exp-amqp-connection");

amqpConn({host: "amqpHost"}, {exchange: "myExchange"}, function (err, conn) {
  if (err) return console.err(err);
  conn.publish("myRoutingKey", "a message");
});
```

### Subscribe

NOTE: it is highly recommended to enable both ``dieOnError`` as well as
``consumerCancelNotification`` when subscribing to ensure a restart/reconnect in all scenarios
where the subscription fails.

```js
var amqpConn = require("exp-amqp-connection");
var behaviour = {exchange: "myExchange", dieOnError: true, consumerCancelNotification: true};
amqpConn({host: "amqpHost"}, behaviour, function (err, conn) {
  if (err) return console.err(err);
  conn.subscribe("myRoutingKey", "myQueueName", function (msg, headers, deliveryInfo, msgObject) {
    console.log("Got message", msg);
  });
});
```

You can subscribe to multiple routing keys by passing an array instead of a string:

```js
  ...
  conn.subscribe(["routingKey1", "routingKey2"], "myQueueName", function (msg) { ... });
  ...
```

### Reuse connection

All calls providing the same reuse key will get the same connection returned. If no
reuse key is provided, a new connection is returned each time.

The following will yield a single connection to rabbit instead of 5000:

```js
var amqpConn = require("exp-amqp-connection");

for(var i = 0; i < 5000; i++) {
  amqpConn({host: "amqpHost"}, {reuse: "someKey"}, function (err, conn) {
    if (err) return console.err(err);
    conn.publish("myRoutingKey", "a message");
  });
}
```

### Die on error

In certain cases you want to crash the entire node process when there is a problem
with the amqp connection. For example durable subscriptions have problems recovering
in certain corner cases, so in order to not risk getting into a deadlocked state it
is better to crash and let the process restart.

```js
var amqpConn = require("exp-amqp-connection");
amqpConn({host: "amqphost"}, {dieOnError: true}, function (err, conn) {
  if (err) return console.err(err);
  ...
});
```

### Dead letter exchange

Messages from a queue can be 'dead-lettered'; that is, republished to another exchange.
For more information: https://www.rabbitmq.com/dlx.html
This option will create a dead letter queue with the name
`deadLetterExchangeName + ".deadLetterQueue"`

```js
var amqpConn = require("exp-amqp-connection");

var options = {
  exchange: "myExchange",
  deadLetterExchangeName: "myExchange.dead",
  subscribeOptions: {
    ack: true // Ack must be enabled for dead lettering to work
  }
}

amqpConn({host: "amqpHost"}, options, function (err, conn) {
  if (err) return console.err(err);
  conn.subscribe("myRoutingKey", "myQueueName", function (msg, headers, deliveryInfo, msgObject) {
    if (msg) {
      messageObject.acknowledge();
    } else {
      messageObject.reject(false); // reject=true, requeue=false causes dead-lettering
    }

    console.log("Got message", msg);
  });
});
```
