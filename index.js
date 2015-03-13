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

var bootstrappedConns = {};

function connect(connectionConfig, behaviour, callback) {
  if (behaviour.bootstrap && bootstrap(behaviour, callback)) {
    return;
  }
  return do_connect(connectionConfig, behaviour, callback);
}

function bootstrap(behaviour, callback) {
  var bootstrappedConn = bootstrappedConns[behaviour.bootstrap];
  if (bootstrappedConn && bootstrappedConn.api) {
    callback(null, bootstrappedConn.api);
    return true;
  }
  if (bootstrappedConn) {
    bootstrappedConn.once("bootstrapped", function (api) {
      callback(null, api);
    });
    return true;
  }
  return false;
}

function do_connect(connectionConfig, behaviour, callback) {

  var api = {
    subscribe: subscribe,
    publish: publish
  };

  var exchange = null;
  var conn = amqp.createConnection(connectionConfig);
  bootstrappedConns[behaviour.bootstrap] = conn;

  conn.on("error", function (connectionError) {
    handleError(connectionError);
  });
  conn.once("ready", function () {
    get_exchange(function (exch) {
      exchange = exch;
      conn.api = api;
      conn.emit("bootstrapped", api);
      return callback(null, api);
    });
  });

  function get_exchange(callback) {
    var exch = conn.exchange(behaviour.exchange, exchangeOptions, function () {
      setImmediate(function () {callback(exch)});
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
      queue.bind(behaviour.exchange, routingKey);

      queue.subscribe(subscribeOptions, function (message) {
        return handler(message);
      });
    });
  }

  function handleError(error) {
    if (behaviour.dieOnError) {
      setTimeout(function () {
        process.exit(1);
      }, 3000);
    }
    return callback(new Error(error));
  }

  return api;
}

module.exports = connect;
