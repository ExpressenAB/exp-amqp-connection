# Simple amqp library

[![Build Status](https://travis-ci.org/ExpressenAB/exp-amqp-connection.svg?branch=master)](https://travis-ci.org/ExpressenAB/exp-amqp-connection)

## Purpose and features

This library is intended for doing simple publish and subscribe to an amqp broker.

- Easy and declarative way to use an amqp broker for publishing and subscribing.
- Hides underlying amqp details as much as possible.
- Tries to maintain amqp best practices such as: per-application connection, separate channels for subscriptions and publishing, consumer cancel notifications, confirm channels, heartbeats etc.
- Resilient to runtime errors such as connection problems etc.
- Optimized for simple apps with a handful of subscriptions.
For heavy-duty messaging, consider a library more closely attached to the amqp protocol such as https://www.npmjs.com/package/amqplib

Limitations:

- Error handling is crude: any error on any channel will tear down the connection and all channels with it. Most runtime errors are connectivity problems however, so this should be ok for the target audience.
- Uses a single exchange defined in behaviour options for all operations. Makes the API smaller and easier to work with.
- The exchange type will always be "topic"

## Api

Exposes a single function that boostraps a broker object, which in turn can be used for publishing and consuming messages.
For example:

```js

var init = require("exp-amqp-connection");
var behaviour = {
  exchange: "my-exchange",
  url: "amqp://localhost"
};
var broker = init(behaviour);

broker.subscribeTmp("routingKey1", console.log);
broker.subscribeTmp("routingKey2", console.log);

broker.publish("routingKey1", "Msg 1");
broker.publish("routingKey1", "Msg 2");

// Delay delivery with 3000 ms using temporary exchange/queue-pair and dead-lettering.
broker.delayedPublish("routingKey2", "Msg 3", 3000);
```

### Options

The following options are accepted:

* url: amqp url. This is where you specify amqp server adress/port, username, password etc. *(example: "amqp://user:pass@localhost:15675")*
* exchange: exchange to use, set to "" to use the built-in default exchange.
* ack: set to true if messages receiver should be acked (see "subscribe" in examples folder). Defaults to false.
* prefetch: Maximuma allowed number of messages awaiting acknowledgement. Only applicable if "ack" is true. Defaults to 20. 
* confirm: whether or not to use confirm mode for publishing. If enabled, a callback can be added to the publish call to see if the publish was successful or not. Defaults to false.
* heartbeat. Send heartbeats at regular intervals to ensure that the server is reachable. Defaults to 10 seconds. Set to 0 to disable heartbeats.
* productName: will show up in the admin interface for the connection. Great for debugging purpouses. Defaults to node app name and version from package.json.
* queueArguments: broker-specific args for creating queues ("x-message-ttl", "x-max-priority" etc)
* reuse: key for connection re-use.
* logger: A logger object implementing error, warning, info, debug for example https://github.com/tj/log.js


### Broker

The broker object returned has the following functions. See the [examples](examples) for more info on parameters etc.

#### publish(routingKey, message, callback)

#### subscribe(routingKey, queue, handler, callback)

#### subscribeTmp(routingKey, handler, callback)

Subscribe using nameless tmp queue. Queue will be destroyed when the broker disconnects.

#### shutdown(callback)

Shuts down connection to broker.

#### events

* "error": in case of amqp errors
* "connected": when connected to amqp server
* "subscribed": when subscription is started
