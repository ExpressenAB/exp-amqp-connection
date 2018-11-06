"use strict";

var bootstrap = require("./bootstrap");
var EventEmitter = require("events");
var transform = require("./transform");
var crypto = require("crypto");
var async = require("async");

var TMP_Q_TTL = 60000;

var dummyLogger = {
  // eslint-disable-next-line no-console
  info: console.log,
  // eslint-disable-next-line no-console
  error: console.log
};

var defaultBehaviour = {
  ack: false,
  confirm: false,
  heartbeat: 10,
  productName: getProductName(),
  resubscribeOnError: true,
  queueArguments: {},
  prefetch: 20,
  logger: dummyLogger
};

function init(behaviour) {
  var api = new EventEmitter();
  behaviour = Object.assign({}, defaultBehaviour, behaviour);

  // get connnection and add event listeners if it's brand new.
  var doBootstrap = function(callback) {
    bootstrap(behaviour, function(bootstrapErr, bootstrapRes) {
      if (bootstrapErr) api.emit("error", bootstrapErr);
      if (bootstrapRes && bootstrapRes.virgin) {
        bootstrapRes.connection.on("error", function(err) { api.emit("error", err); });
        bootstrapRes.connection.on("close", function(why) { api.emit("error", why); });
        bootstrapRes.pubChannel.on("error", function(err) { api.emit("error", err); });
        bootstrapRes.subChannel.on("error", function(err) { api.emit("error", err); });
      }
      callback(bootstrapErr, bootstrapRes);
    });
  };

  api.subscribeTmp = function(routingKeyOrKeys, handler) {
    api.subscribe(routingKeyOrKeys, undefined, handler);
  };

  api.subscribe = function(routingKeyOrKeys, queue, handler, attempt) {
    attempt = attempt || 0;
    var resubTimer;

    // try to resubscribe in 5 secs on error.
    var resubscribeOnError = function(err) {
      if (err && !resubTimer && behaviour.resubscribeOnError) {
        behaviour.logger.info("Amqp error received. Resubscribing in 5 secs.");
        resubTimer = setTimeout(function() {
          api.subscribe(routingKeyOrKeys, queue, handler, attempt + 1);
          resubTimer = null;
        }, 5000);
      }
    };
    // Only add resubscribe listener on first attempt.
    if (attempt === 0) {
      api.on("error", resubscribeOnError);
    }

    doBootstrap(function(bootstrapErr, bootstrapRes) {
      // failed to connect - abort
      if (bootstrapErr) {
        resubscribeOnError(bootstrapErr);
        return;
      }
      var routingKeys = Array.isArray(routingKeyOrKeys) ? routingKeyOrKeys : [routingKeyOrKeys];
      var subChannel = bootstrapRes.subChannel;
      subChannel.prefetch(behaviour.prefetch);
      var queueOpts = {
        durable: !!queue,
        autoDelete: !queue,
        exclusive: !queue,
        arguments: Object.assign(!queue ? { "x-expires": TMP_Q_TTL } : {}, behaviour.queueArguments)
      };
      var queueName = queue ? queue : getProductName() + "-" + getRandomStr();
      subChannel.assertExchange(behaviour.exchange, "topic");
      subChannel.assertQueue(queueName, queueOpts);
      routingKeys.forEach(function(key) {
        subChannel.bindQueue(queueName, behaviour.exchange, key, {});
      });
      var amqpHandler = function(message) {
        if (!message) return resubscribeOnError("Subscription cancelled");
        var ackFun = function() { subChannel.ack(message); };
        var nackFun = function(requeue) { subChannel.nack(message, false, requeue); };
        var decodedMessage;
        try {
          decodedMessage = transform.decode(message);
        } catch (decodeErr) {
          behaviour.logger.error("Ignoring un-decodable message:", message, "reason:", decodeErr);
          if (behaviour.ack) {
            subChannel.ack(message);
          }
          return;
        }
        handler(decodedMessage, message, { ack: ackFun, nack: nackFun });
      };
      var consumeOpts = { noAck: !behaviour.ack };
      subChannel.consume(queueName, amqpHandler, consumeOpts);
      api.emit("subscribed", { key: routingKeyOrKeys, queue: queueName, attempt: attempt });
    });
  };

  api.publish = function(routingKey, message, meta, cb) {
    if (typeof meta === "function") cb = meta;
    cb = cb || function() {};
    doBootstrap(function(bootstrapErr, bootstrapRes) {
      if (bootstrapErr) {
        return cb(bootstrapErr);
      }
      var encodedMsg = transform.encode(message, meta);
      bootstrapRes.pubChannel.publish(behaviour.exchange, routingKey, encodedMsg.buffer, encodedMsg.props, cb);
    });
  };

  api.delayedPublish = function(routingKey, message, delay, meta, cb) {
    if (typeof meta === "function") cb = meta;
    cb = cb || function() {};
    doBootstrap(function(bootstrapErr, bootstrapRes) {
      if (bootstrapErr) return cb(bootstrapErr);
      var name = behaviour.exchange + "-exp-amqp-delayed-" + delay;
      var channel = bootstrapRes.pubChannel;
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
      var encodedMsg = transform.encode(message, meta);
      async.series([
        function(done) {
          channel.bindQueue(name, name, "#", {}, done);
        },
        function(done) {
          channel.publish(name, routingKey, encodedMsg.buffer, encodedMsg.props, done);
        }
      ], cb);
    });
  };

  api.deleteQueue = function(queue) {
    doBootstrap(function(err, res) {
      res.pubChannel.deleteQueue(queue);
    });
  };

  api.shutdown = function(cb) {
    cb = cb || function() {};
    doBootstrap(function(err, res) {
      if (err) return cb(err);
      res.connection.close(cb);
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
