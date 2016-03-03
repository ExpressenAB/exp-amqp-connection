"use strict";
var amqp = require("amqp");
var util = require("util");
var extend = require("./extend.js");
var getLog = require("./getLog.js");

var defaultExchangeOptions = {
  durable: true,
  autoDelete: false,
  confirm: true
};
var defaultQueueOptions = {
  autoDelete: true
};
var defaultSubscribeOptions = {};

var savedConns = {};

function connect(connectionConfig, behaviour, callback) {
  if (behaviour.reuse && attemptReuse(behaviour.reuse, callback)) {
    return;
  }
  return doConnect(connectionConfig, behaviour, callback);
}

function attemptReuse(key, callback) {
  var savedConn = savedConns[key];
  if (savedConn && savedConn.api) {
    callback(null, savedConn.api);
    return true;
  }
  if (savedConn) {
    savedConn.once("bootstrapped", function (api) {
      callback(null, api);
    });
    return true;
  }
  return false;
}

function doConnect(connectionConfig, behaviour, callback) {
  var api = {
    subscribe: subscribe,
    subscribeExclusive: subscribeExclusive,
    publish: publish,
    deleteQueue: deleteQueue,
    close: close
  };

  var logger = getLog(behaviour.logger);
  var exchangeOptions = extend(defaultExchangeOptions, behaviour.exchangeOptions);
  var queueOptions = extend(defaultQueueOptions, behaviour.queueOptions);
  var subscribeOptions = extend(defaultSubscribeOptions, behaviour.subscribeOptions);
  var exchange = null;
  connectionConfig.clientProperties =
    {"capabilities": {"consumer_cancel_notify": !!behaviour.consumerCancelNotification}};
  connectionConfig.heartbeat = 10;
  var conn = amqp.createConnection(connectionConfig, {reconnect: !behaviour.dieOnError});

  if (behaviour.reuse) {
    savedConns[behaviour.reuse] = conn;
  }

  conn.on("close", function (hadError) {
    logger.info("Connectoion closed", hadError);
  });

  conn.on("error", function (connectionError) {
    handleError(connectionError, logger);
  });

  conn.once("error", callback);

  conn.on("ready", function () {
    logger.info("Connected to rabbit host", connectionConfig.host);
  });

  conn.once("ready", function () {
    conn.removeListener("error", callback);
    getExchange(function (exch) {
      logger.info("Exchange opened to rabbit host", connectionConfig.host);
      exchange = exch;
      conn.api = api;
      conn.emit("bootstrapped", api);
      return callback(null, api);
    });
  });

  function getExchange(callback) {
    var exch = conn.exchange(behaviour.exchange, exchangeOptions, function () {
      setImmediate(function () {
        if (behaviour.deadLetterExchangeName) {
          return setupDeadLetterExchange(behaviour.deadLetterExchangeName, function () {
            callback(exch);
          });
        }
        callback(exch);
      });
    });
  }

  function setupDeadLetterExchange(deadLetterExchangeName, callback) {
    var options = {
      durable: true,
      autoDelete: false,
      type: "topic"
    };
    conn.exchange(deadLetterExchangeName, options, function (ex) {
      var options = {durable: true, autoDelete: false};
      conn.queue(deadLetterExchangeName + ".deadLetterQueue", options, function (q) {
        q.bind(ex, "#");
        callback();
      });
    });
  }

  function getQueueOptions() {
    if (behaviour.deadLetterExchangeName) {
      queueOptions["arguments"] = queueOptions["arguments"] || {};
      queueOptions["arguments"]["x-dead-letter-exchange"] = behaviour.deadLetterExchangeName;
      if (!subscribeOptions.ack) {
        throw new Error("Ack must be enabled in subscribeOptions for dead letter exchange to work");
      }
    }
    return queueOptions;
  }

  function publish(routingKey, message, publishCallback) {
    var actualPublishCallback = publishCallback || function () {};
    return exchange.publish(routingKey, message, {}, function (error) {
      if (error) return actualPublishCallback("Publish error");
      return actualPublishCallback();
    });
  }

  function subscribeExclusive(routingKey, queueName, handler, subscribeCallback, waitCallback) {
    waitCallback = waitCallback || function () {};
    var onExclusiveCallback = subscribeCallback || function () {};
    var internalSubscribeOptions = extend(subscribeOptions, {exclusive: true});
    var routingPatterns = Array.isArray(routingKey) ? routingKey : [routingKey];

    function attemptExclusiveSubscribe(id) {
      logger.debug("Attempting to connect to queue", id);
      conn.queue(queueName, getQueueOptions(), function (queue) {
        routingPatterns.forEach(function (routingPattern) {
          queue.bind(behaviour.exchange, routingPattern);
        });
        queue.on("basicCancel", function () {
          handleError("Subscription cancelled from server side", logger);
        });
        queue.on("error", function (err) {
          if (err.code === 403) {
            logger.info("Someone else is using the queue, we'll try again", id);
            waitCallback(err, id);
            setTimeout(attemptExclusiveSubscribe.bind(null, ++id), 5000);
          } else {
            logger.error("Queue error", err.stack || err, id);
          }
        });
        queue.subscribe(internalSubscribeOptions, function (message, headers, deliveryInfo, ack) {
          handler(message, headers, deliveryInfo, ack);
        }).addCallback(function () {
          onExclusiveCallback();
          logger.info("Exclusively subscribing to '" + queueName + "'", id);
        });
      });
    }

    attemptExclusiveSubscribe(1);
  }

  function subscribe(routingKeyOrKeys, queueName, handler, subscribeCallback) {
    var actualSubscribeCallback = subscribeCallback || function () {};
    var routingKeys = Array.isArray(routingKeyOrKeys) ? routingKeyOrKeys : [routingKeyOrKeys];
    conn.queue(queueName, getQueueOptions(), function (queue) {
      queue.on("error", function (queueError) {
        return actualSubscribeCallback(queueError);
      });
      queue.once("basicConsumeOk", function () {return actualSubscribeCallback(); });
      queue.on("basicCancel", function () {
        handleError("Subscription cancelled from server side", logger, true);
      });
      routingKeys.forEach(function (routingKey) {
        queue.bind(behaviour.exchange, routingKey);
      });
      queue.subscribe(subscribeOptions, handler);
    });
  }

  function close(callback) {
    if (callback) {
      conn.once("close", function () {callback();});
    }
    conn.disconnect();
  }

  function handleError(error, logger, reconnect) {
    if (behaviour.dieOnError) {
      logger.error("Killing myself over error: ", error);
      setTimeout(function () {
        process.exit(1);
      }, 3000);
    } else if (reconnect) {
      logger.info("Destroying connection forcing reconnect due to error:", error);
      conn.socket.destroy();
    }
    logger.error(util.format("Amqp error", error, "\n", error.stack || ""));
  }

  function deleteQueue(queueName) {
    conn.queue(queueName, {noDeclare: true}, function (queue) {
      queue.destroy();
    });
  }

  return api;
}

module.exports = connect;
