"use strict";

var bootstrap = require("./bootstrap");
var EventEmitter = require("events");
var transform = require("./transform");
var _ = require("lodash");
var crypto = require("crypto");
var async = require("async");

var TMP_Q_TTL = 60000;

var defaultBehaviour = {
  reuse: "default",
  ack: false,
  confirm: false,
  heartbeat: 10,
  productName: getProductName(),
  resubscribeOnError: true,
  queueArguments: {},
  prefetch: 20
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
        var queueOpts = {
          durable: !!queue,
          autoDelete: !queue,
          exclusive: !queue,
          arguments: Object.assign(!queue ? {"x-expires": TMP_Q_TTL} : {}, behaviour.queueArguments)
        };
        var queueName = queue ? queue : getProductName() + "-" + getRandomStr();
        subChannel.assertExchange(behaviour.exchange, "topic");
        subChannel.assertQueue(queueName, queueOpts);
        routingKeys.forEach(function (key) {
          subChannel.bindQueue(queueName, behaviour.exchange, key, {});
        });
        var amqpHandler = function (message) {
          if (!message) return handleSubscribeError("Subscription cancelled");
          var ackFun = function () {
            subChannel.ack(message);
          };
          handler(transform.decode(message), message, {ack: ackFun});
        };
        var consumeOpts = {noAck: !behaviour.ack};
        subChannel.consume(queueName, amqpHandler, consumeOpts, cb);
        api.emit("subscribed", {key: routingKeyOrKeys, queue: queueName});
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

  api.delayedPublish = function (routingKey, message, delay, cb) {
    cb = cb || function () {};
    bootstrap(behaviour, api, function (connErr, conn, channel) {
      var name = behaviour.exchange + "-exp-amqp-delayed-" + delay;
      channel.assertExchange(name, "fanout", {
        durable: true,
        autoDelete: true
      });
      channel.assertQueue(name, {
        durable: true,
        autoDelete: true,
        arguments: {
          "x-dead-letter-exchange": behaviour.exchange,
          "x-message-ttl": delay,
          "x-expires": delay + 60000
        }
      });
      var encodedMsg = transform.encode(message);
      async.series([
        function (done) {
          channel.bindQueue(name, name, "#", {}, done);
        },
        function (done) {
          channel.publish(name, routingKey, encodedMsg.buffer, encodedMsg.props, done);
        }
      ], cb);
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
    var nodeEnv = (process.env.NODE_ENV || "development");
    return pkg.name + "-" + nodeEnv;
  } catch (e) {
    return "exp-amqp-connection";
  }
}

function getRandomStr() {
  return crypto.randomBytes(20).toString("hex").slice(1, 8);
}

module.exports = init;
