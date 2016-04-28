"use strict";

var bootstrap = require("./bootstrap");
var EventEmitter = require("events");
var transform = require("./transform");
var _ = require("lodash");

var defaultBehaviour = {
  reuse: "default",
  ack: false,
  confirm: false,
  heartbeat: 10,
  productName: getProductName(),
  resubscribeOnError: true
};

function init(behaviour) {
  var api = new EventEmitter();
  behaviour = _.assign(defaultBehaviour, behaviour);

  api.subscribeTmp = function (routingKeyOrKeys, handler, cb) {
    api.subscribe(routingKeyOrKeys, undefined, handler, cb);
  };

  api.subscribe = function (routingKeyOrKeys, queue, handler, cb) {
    bootstrap(behaviour, api, function (connErr, conn) {
      var resubTimer;
      if (connErr) return handleSubscribeError(connErr);
      conn.on("error", handleSubscribeError);

      var routingKeys = Array.isArray(routingKeyOrKeys) ? routingKeyOrKeys : [routingKeyOrKeys];
      conn.createChannel(function (channelErr, subChannel) {
        subChannel.prefetch(behaviour.prefetch);
        var queueOpts = {durable: !!queue, autoDelete: !queue, exclusive: !queue};
        subChannel.assertExchange(behaviour.exchange, "topic");
        subChannel.assertQueue(queue, queueOpts);
        routingKeys.forEach(function (key) {
          subChannel.bindQueue(queue, behaviour.exchange, key, {});
        });
        var amqpHandler = function (message) {
          if (!message) return handleSubscribeError("Subscription cancelled");
          var ackFun = function () { subChannel.ack(message); };
          handler(transform.decode(message), message, {ack: ackFun});
        };
        var consumeOpts = {noAck: !behaviour.ack};
        subChannel.consume(queue, amqpHandler, consumeOpts, cb);
        api.emit("subscribed", {key: routingKeyOrKeys, queue: queue});
      });

      function handleSubscribeError(err) {
        if (err) {
          api.emit("error", err);
          if (behaviour.resubscribeOnError && !resubTimer) {
            resubTimer = setTimeout(function () {
              api.subscribe(routingKeyOrKeys, queue, handler);
            }, 5000);
          }
        }
      }
    });
  };

  api.publish = function (routingKey, message, cb) {
    cb = cb || function () {};
    bootstrap(behaviour, api, function (connErr, conn, channel) {
      if (connErr) {
        api.emit("error", connErr);
        return cb(connErr);
      }
      var encodedMsg = transform.encode(message);
      channel.publish(behaviour.exchange, routingKey, encodedMsg.buffer, encodedMsg.props, cb);
    });
  };

  api.deleteQueue = function (queue) {
    bootstrap(behaviour, api, function (connErr, conn, channel) {
      channel.deleteQueue(queue);
    });
  };

  api.shutdown = function (cb) {
    cb = cb || function () {};
    bootstrap(behaviour, api, function (connErr, conn) {
      if (connErr) return cb();
      conn.close(cb);
    });
  };

  return api;
}

function getProductName() {
  try {
    var pkg = require(process.cwd() + "/package.json");
    return pkg.name + " " + pkg.version;
  } catch (e) {
    return "exp-amqp-connection";
  }
}

module.exports = init;
