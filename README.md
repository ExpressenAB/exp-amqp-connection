# Simple amqp library

[![Build Status](https://travis-ci.org/ExpressenAB/exp-amqp-connection.svg?branch=master)](https://travis-ci.org/ExpressenAB/exp-amqp-connection)

## Purpouse and features

This library is intended for doing simple publish and subscribe to an amqp broker.

- Easy and declarative way to use an amqp broker for publishing and subscribing.
- Hides underlying amqp details as much as possible.
- Tries to maintain amqp best practices such as: separate channels for subscriptions and publishing, consumer cancel notifications, confirm channels, heartbeats etc.
- Optimized for low to medium message rates. If your app processes a large number of messages (say 20 messages per second) or more,
  consider a library more closely attached to the amqp protocol such as https://www.npmjs.com/package/amqplib

## Api

```js
var broker = require("exp-amqp-connection");
broker.connect(amqpUrl, beahviour, callback(err, conn) {
});
```

### Connect parameters
* url: amqp url. This is where you specify amqp server adress/port, username, password ect.
*(example: "amqp://user:pass@localhost:15675")*
* behaviour: object with fields:
  * reuse: key for connection re-use. If omitted, a new connection will be returned for each "connect" call. Defaults to the name of the node app from package.json
  * ack: set to true if messages receiver should be acked (see examples below). Defaults to false.
  * confirm: whether or not to use confirm mode for publishing. If enabled, a callback can be added to the publish call to see if the publish was successful or not. Default to false.
  * heartbeat. Send heartbeats at regular intervals to ensure that the server is reachable. Defaults to 10 seconds. Set to 0 to disable heartbeats.
  * productName: will show up in the admin interface for the connection. Great for debugging purpouses. Defaults to node app name and version from package.json.
* callback: callback function containing broker object for publish and subscribe


## Usage patterns

See "examples" folder.

### Publisher

```js
var broker = require("exp-amqp-connection");

var amqpBehaviour = {exchange: "myExchange", errorHandler: error};

broker("amqp://localhost", amqpBehaviour, function (connErr, conn) {
  if (connErr) return console.log("AMQP connect error", connErr);
  conn.publish("data", "routingKey", function (err) {
    console.log(
  });
});
  
function error(error) {
  console.log("Broker error", error);
}
```

Your app will now use a single connection/channel for publishing to rabbit. In case of connection problems, you will get a new connection
once the connection can be established again. 

### Subscriber (kill process on error)

Bind a queue to an exchange and subscribe to it. In case of errors, termintate the process.

This is the simplest and most robust way of dealing with lost connections and other amqp problems.
However it presumes you hava a process manager (pm2, forever etc) in place to restart the process.

```js
var broker = require("exp-amqp-connection");
var amqpBehaviour = {reuse: "myKey", exchange: "myExchange", ack: "true". errorHandler = error};

broker("amqp://localhost", function (err, conn) {
  if (err) return handleError(err);
  conn.subsribe("routingKey", "someQueue", function (message, meta, notify) {
    console.log("Got message", message, "with routing key", meta.routingKey);
    notify.ack();
  })
  });

function handleError(err) {
  console.log("Broker error, terminating process", err);
  process.exit(1);
}

```


### Subscriber (reconnect on error)

If you do not wish to crash your app in case of amqp errors, you have to re-initilize the subscription in case of errors instead.
This requires a few more lines of code:

```js
var broker = require("exp-amqp-connection");
var amqpBehaviour = {exchange: "myExchange", ack: "true"};
var resubTimer;

function subscribe() {
  broker("amqp://localhost", amqpBehaviour, function (err, conn) {
    resubTimer = null;
    if (err) return handleError(err);
    conn.subscribe("routingKey", "someQueue", handleMessage, handleError);
  });
}

function handleMessage(message, meta, notify) {
  console.log("Got message", message, "with routing key", meta.routingKey);
  notify.ack();
}

function handleError(err) {
if (!resubTimer) {
    console.log("Broker error, resubscribing: ", err);
    resubTimer = setTimeout(subscribe, 1000);
  }
}

subscribe();
```



