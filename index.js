"use strict";

const bootstrap = require("./bootstrap");
const EventEmitter = require("events");
const transform = require("./transform");
const crypto = require("crypto");
const async = require("async");

const TMP_Q_TTL = 60000;

const dummyLogger = {
  // eslint-disable-next-line no-console
  info: console.log,
  // eslint-disable-next-line no-console
  error: console.log
};

const defaultBehaviour = {
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
  const api = new EventEmitter();
  behaviour = Object.assign({}, defaultBehaviour, behaviour);

  // get connnection and add event listeners if it's brand new.
  const doBootstrap = function(callback) {
    bootstrap(behaviour, (bootstrapErr, bootstrapRes) => {
      if (bootstrapErr) api.emit("error", bootstrapErr);
      if (bootstrapRes && bootstrapRes.virgin) {
        bootstrapRes.connection.on("error", (err) => api.emit("error", err));
        bootstrapRes.connection.on("close", (why) => api.emit("error", why));
        bootstrapRes.pubChannel.on("error", (err) => api.emit("error", err));
        bootstrapRes.subChannel.on("error", (err) => api.emit("error", err));
      }
      callback(bootstrapErr, bootstrapRes);
    });
  };

  api.subscribeTmp = function(routingKeyOrKeys, handler) {
    api.subscribe(routingKeyOrKeys, undefined, handler);
  };

  api.subscribe = function(routingKeyOrKeys, queue, handler, attempt) {
    attempt = attempt || 0;
    let resubTimer;

    // try to resubscribe in 5 secs on error.
    const resubscribeOnError = (err) => {
      if (err && !resubTimer && behaviour.resubscribeOnError) {
        behaviour.logger.info("Amqp error received. Resubscribing in 5 secs.");
        resubTimer = setTimeout(() => {
          api.subscribe(routingKeyOrKeys, queue, handler, attempt + 1);
          resubTimer = null;
        }, 5000);
      }
    };
    // Only add resubscribe listener on first attempt.
    if (attempt === 0) {
      api.on("error", resubscribeOnError);
    }

    doBootstrap((bootstrapErr, bootstrapRes) => {
      // failed to connect - abort
      if (bootstrapErr) {
        resubscribeOnError(bootstrapErr);
        return;
      }
      const routingKeys = Array.isArray(routingKeyOrKeys) ? routingKeyOrKeys : [routingKeyOrKeys];
      const subChannel = bootstrapRes.subChannel;
      subChannel.prefetch(behaviour.prefetch);
      const queueOpts = {
        durable: !!queue,
        autoDelete: !queue,
        exclusive: !queue,
        arguments: Object.assign(!queue ? { "x-expires": TMP_Q_TTL } : {}, behaviour.queueArguments)
      };
      const queueName = queue ? queue : `${getProductName()}-${getRandomStr()}`;
      subChannel.assertExchange(behaviour.exchange, "topic");
      subChannel.assertQueue(queueName, queueOpts);
      routingKeys.forEach((key) => subChannel.bindQueue(queueName, behaviour.exchange, key, {}));
      const amqpHandler = function(message) {
        if (!message) {
          api.emit("error", "Subscription cancelled");
          return resubscribeOnError("Subscription cancelled");
        }
        const ackFun = () => subChannel.ack(message);
        const nackFun = (requeue) => subChannel.nack(message, false, requeue);
        let decodedMessage;
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
      const consumeOpts = { noAck: !behaviour.ack };
      subChannel.consume(queueName, amqpHandler, consumeOpts, (err) => {
        if (err) return api.emit("error", err);
        api.emit("subscribed", { key: routingKeyOrKeys, queue: queueName, attempt: attempt });
      });
    });
  };

  api.publish = function(routingKey, message, meta, cb) {
    if (typeof meta === "function") cb = meta;
    cb = cb || (() => {});
    doBootstrap((bootstrapErr, bootstrapRes) => {
      if (bootstrapErr) {
        return cb(bootstrapErr);
      }
      const encodedMsg = transform.encode(message, meta);
      bootstrapRes.pubChannel.publish(behaviour.exchange, routingKey, encodedMsg.buffer, encodedMsg.props, cb);
    });
  };

  api.delayedPublish = function(routingKey, message, delay, meta, cb) {
    if (typeof meta === "function") cb = meta;
    cb = cb || function() {};
    doBootstrap((bootstrapErr, bootstrapRes) => {
      if (bootstrapErr) return cb(bootstrapErr);
      const name = `${behaviour.exchange}-exp-amqp-delayed-${delay}`;
      const channel = bootstrapRes.pubChannel;
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
      const encodedMsg = transform.encode(message, meta);
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

  api.deleteQueue = function(queue, cb) {
    cb = cb || (() => {});
    doBootstrap((err, res) => {
      if (err) return cb(err);
      res.pubChannel.deleteQueue(queue);
    });
  };

  api.shutdown = function(cb) {
    cb = cb || (() => {});
    doBootstrap((err, res) => {
      if (err) {
        return cb(err);
      }
      res.connection.close(cb);
    });
  };

  return api;
}

function getProductName() {
  try {
    const pkg = require(`${process.cwd()}/package.json`);
    const nodeEnv = (process.env.NODE_ENV || "development");
    return `${pkg.name}-${nodeEnv}`;
  } catch (e) {
    return "exp-amqp-connection";
  }
}

function getRandomStr() {
  return crypto.randomBytes(20).toString("hex").slice(1, 8);
}

module.exports = init;
