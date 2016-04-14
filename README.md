# Simple amqp library

[![Build Status](https://travis-ci.org/ExpressenAB/exp-amqp-connection.svg?branch=master)](https://travis-ci.org/ExpressenAB/exp-amqp-connection)

## Purpouse and features

This library is intended for doing simple publish and subscribe to an amqp broker.

- Easy and declarative way to use an amqp broker for publishing and subscribing.
- Hides underlying amqp details as much as possible.
- Tries to maintain amqp best practices such as: separate channels for subscriptions and publishing, consumer cancel notifications, confirm channels etc.
- Optimized for low to medium message rates. If your app processes a large number of messages (say 20 messages per second) or more, use a library that is more closely attached to the amqp protocol.

## Example usages

### Publisher

```js
var amqpConnection = require("exp-amqp-connection");

var amqpBehaviour = {
  exchange: "myExchange"
};

amqpConnection("amqp://localhost", amqpBehaviour, function (connErr, conn) {
  if (connErr) return console.log("AMQP connect error", connErr);
  conn.on("error", function (amqpErr) {
    console.log("Uh-oh, amqp error: ", amqpErr);
  });
  conn.publish("data", "routingKey");
});
```

Your app will now use a single connection/channel for publishing to rabbit. In case the connection goes down messages will be queued and sent once the connection is up and running again.

### Subscriber (kill process on error)

```js
var amqpConnection = require("exp-amqp-connection");
var amqpBehaviour = {reuse: "myKey", exchange: "myExchange", ack: "true"};

amqpConnection("amqp://user:password@localhost", function (err, conn) {
  if (err) return console.log("AMQP connect error", err);
  conn.subsribe("routingKey", "someQueue", function (message, meta, notify) {
    console.log("Got message", message, "with routing key", meta.routingKey);
    notify.ack();
  })
});
```

This is the simplest and most robust way of dealing with connection problems and other errors when using an amqp.connection. Ingore any "error" events from the amqp connection which will cause the process to crash. Then let your process manager (pm2, forever etc) restart the process.

### Subscriber (reconnect on error)


If you do not wish to crash your app in case of amqp errors, you have to re-initilize the subscription in case of errors instead. This requires a few more lines of code:

```js
var amqpConnection = require("exp-amqp-connection");
var amqpBehaviour = {exchange: "myExchange", ack: "true"};
var resubTimer;

function subscribe() {
  amqpConnection("amqp://localhost", amqpBehaviour, function (err, conn) {
    resubTimer = null;
    if (err) return handleError(err);
    conn.on("error", handleError);
    conn.subscribe("routingKey", "someQueue", handleMessage, handleError);
  });
}

function handleMessage(message, meta, notify) {
  console.log("Got message", message, "with routing key", meta.routingKey);
  notify.ack();
}

function handleError(err) {
  if (err && !resubTimer) {
    resubTimer = setTimeout(subscribe, 1000);
  }
}

subscribe();
```

## API docs

For now, UTSL :(
