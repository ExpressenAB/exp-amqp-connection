"use strict";
var amqp = require("amqp");

var exchangeOptions = {
  durable: true,
  autoDelete: false,
  confirm: true
};
var queueOptions = {
  autoDelete: true
};
var subscribeOptions = {};

function connect(connectionConfig, behaviourConfig, callback) {
  var exchange;
  var conn = amqp.createConnection(connectionConfig);
  var broker = {
    subscribe: subscribe,
    publish: publish
  };

  conn.on("error", function (connectionError) {
    handleError(connectionError);
  });
  conn.once("ready", function () {
    get_exchange(function (exch) {
      exchange = exch;
      callback(null, broker);
    });
  });

  function get_exchange(callback) {
    conn.exchange(behaviourConfig.exchange, exchangeOptions, function (exchange) {
      callback(exchange);
    });
  }

  function publish(routingKey, message, publishCallback) {
    return exchange.publish(routingKey, message, {}, publishCallback);
  }

  function subscribe(routingKey, queueName, handler) {
    conn.queue(queueName, queueOptions, function (queue) {
      queue.on("error", function (queueError) {
        return handleError(queueError);
      });
      queue.bind(behaviourConfig.exchange, routingKey);
      queue.subscribe(subscribeOptions, function (message) {
        return handler(message);
      });
    });
  }

  function handleError(error) {
    if (behaviourConfig.dieOnError) {
      setTimeout(function () {
        process.exit(1);
      }, 3000);
    }
    return callback(error);
  }

  return broker;
}

module.exports = connect;
