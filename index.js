"use strict";
var amqp = require("amqp");
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
  var conn = amqp.createConnection(connectionConfig);

  if (behaviour.reuse) {
    savedConns[behaviour.reuse] = conn;
  }

  conn.on("error", function (connectionError) {
    handleError(connectionError, callback, logger);
  });
  conn.once("ready", function () {
    getExchange(function (exch) {
      exchange = exch;
      conn.api = api;
      conn.emit("bootstrapped", api);
      return callback(null, api);
    });
  });

  function getExchange(callback) {
    var exch = conn.exchange(behaviour.exchange, exchangeOptions, function () {
      setImmediate(function () {
        callback(exch);
      });
    });
  }

  function publish(routingKey, message, publishCallback) {
    var actualPublishCallback = publishCallback || function () {};
    return exchange.publish(routingKey, message, {}, function (error) {
      if (error) return actualPublishCallback("Publish error");
      return actualPublishCallback();
    });
  }

  function subscribeExclusive(routingKey, queueName, handler, subscribeCallback, queueIsTakenCallback) {
    queueIsTakenCallback = queueIsTakenCallback || function () {};
    var onExclusiveCallback = subscribeCallback || function () {};
    var internalSubscribeOptions = extend(subscribeOptions, {exclusive: true});
    var routingPatterns = Array.isArray(routingKey) ? routingKey : [routingKey];

    function attemptExclusiveSubscribe(id) {
      logger.debug("Attempting to connect to queue", id);
      conn.queue(queueName, queueOptions, function (queue) {
        routingPatterns.forEach(function (routingPattern) {
          queue.bind(behaviour.exchange, routingPattern);
        });
        queue.on("error", function (err) {
          if (err.code === 403) {
            logger.info("Someone else is using the queue, we'll try again", id);
            queueIsTakenCallback(err, id);
            setTimeout(attemptExclusiveSubscribe.bind(null, ++id), 5000);
          } else {
            logger.error("Queue error", err.stack || err, id);
          }
        });
        queue.subscribe(internalSubscribeOptions, function (message, headers, deliveryInfo, ack) {
          handler(message, headers, deliveryInfo, ack);
        }).addCallback(function () {
          onExclusiveCallback();
          logger.info("Exclusively subscribing to '" + queueName + "'. Other Ursula instances have to wait.", id);
        });
      });
    }
    attemptExclusiveSubscribe(1);
  }

  function subscribe(routingKey, queueName, handler, subscribeCallback) {
    var actualSubscribeCallback = subscribeCallback || function () {};
    conn.queue(queueName, queueOptions, function (queue) {
      queue.on("error", function (queueError) {
        return actualSubscribeCallback(queueError);
      });
      queue.once("basicConsumeOk", function () {return actualSubscribeCallback(); });
      queue.bind(behaviour.exchange, routingKey);
      queue.subscribe(subscribeOptions, function (message) {
        return handler(message);
      });
    });
  }

  function close(callback) {
    conn.disconnect(callback);
  }

  function handleError(error, callback, logger) {
    if (behaviour.dieOnError) {
      setTimeout(function () {
        process.exit(1);
      }, 3000);
    }
    if (!callback.hasBeenInvoked) {
      callback(new Error(error));
      callback.hasBeenInvoked = true;
    }
    if (logger) {
      logger.error("Amqp error" + error);
    }
  }

  function deleteQueue(queueName) {
    conn.queue(queueName, {noDeclare: true}, function (queue) {
      queue.destroy();
    });
  }
  
  return api;
}

module.exports = connect;
