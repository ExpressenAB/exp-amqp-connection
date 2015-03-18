# Simple amqp library

## Features

* Hides underlying amqp implementation details
* Publish
* Subscribe
* Optionally kill process on errors
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

The first arg is amqp connection options. See https://github.com/postwait/node-amqp#connection-options-and-url.

The second arg defines various behaviour options:

```javascript
var behaviourOpts = {
  dieOnError: "...", // If true, kill the node process in case of amqp errors
  exchange: "...", // Name of exchange to use. Leave undefined for rabbit default exchange.
  reuse: "...", // Reuse connections using the specified key
  logger: "..." // one-arg-function used for logging errors. Defaults to console.log
  exchangeOptions: "...", // Options to pass to the exchange
  queueOptions: "...", // Options to pass to the queue
  subscribeOptions: "...", // Options to use for subscribing
};
```

default values for options, these will be merged with your changes.

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

```js
var amqpConn = require("exp-amqp-connection");

amqpConn({host: "amqpHost"}, {exchange: "myExchange"}, function (err, conn) {
  if (err) return console.err(err);
  conn.subscribe("myRoutingKey", "myQueueName", function (message) {
    console.log("Got message", message);
  });
});
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
