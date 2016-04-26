# Simple amqp library

[![Build Status](https://travis-ci.org/ExpressenAB/exp-amqp-connection.svg?branch=master)](https://travis-ci.org/ExpressenAB/exp-amqp-connection)

## Purpouse and features

This library is intended for doing simple publish and subscribe to an amqp broker.

- Easy and declarative way to use an amqp broker for publishing and subscribing.
- Hides underlying amqp details as much as possible.
- Tries to maintain amqp best practices such as: separate channels for subscriptions and publishing, consumer cancel notifications, confirm channels, heartbeats etc.
- Optimized for simple apps with a handful of subscriptions.
For heavy-duty messaging, consider a library more closely attached to the amqp protocol such as https://www.npmjs.com/package/amqplib

Limitations:

- Error handling is crude: any error on any channel will tear down the connection and all channels with it. Most runtime errors are connectivity problems however, so this should be ok for the target audience.
- Uses a single exchange defined in behaviour options for all operations. Makes the API smaller and easier to work with.
- The exchange type will always be "topic"

## Api

Exposes a single function used for boostrapping a broker object that can be used for publishing and consuming messages.

```js
var bootstrap = require("exp-amqp-connection");
var behaviour = {exchange: "my-exchange"};
bootstrap("amqp://localhost", {}, callback(err, broker) {
   if (err) return consol.log("Failed to initialize broker!", err);
   broker.publish("someRoutingKey", "Some message");
});
```

### Connect parameters
* url: amqp url. This is where you specify amqp server adress/port, username, password ect.
*(example: "amqp://user:pass@localhost:15675")*
* behaviour: object with fields:
  * exchange: exchange to use, set to "" to use the built-in default exchange.
  * ack: set to true if messages receiver should be acked (see examples below). Defaults to false.
  * confirm: whether or not to use confirm mode for publishing. If enabled, a callback can be added to the publish call to see if the publish was successful or not. Default to false.
  * heartbeat. Send heartbeats at regular intervals to ensure that the server is reachable. Defaults to 10 seconds. Set to 0 to disable heartbeats.
  * productName: will show up in the admin interface for the connection. Great for debugging purpouses. Defaults to node app name and version from package.json.
  * reuse: key for connection re-use. Set to null if you want a new connection to rabbit each time.
* callback: callback function providing broker object. See "examples" folder for API.

### Broker object

TODO

## Usage patterns

See "examples" folder.

