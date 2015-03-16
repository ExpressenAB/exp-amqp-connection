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
    publish: publish,
    close: close
  };

  var exchange = null;
  var conn = amqp.createConnection(connectionConfig);

  if (behaviour.reuse) {
    savedConns[behaviour.reuse] = conn;
  }

  conn.on("error", function (connectionError) {
    handleError(connectionError);
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
      setImmediate(function () {callback(exch)});
    });
  }

  function publish(routingKey, message, publishCallback) {
    return exchange.publish(routingKey, message, {}, publishCallback);
  }

  function subscribe(routingKey, queueName, handler, subscribeCallback) {
    conn.queue(queueName, queueOptions, function (queue) {
      queue.on("error", function (queueError) {
        return subscribeCallback && subscribeCallback(queueError);
      });
      subscribeCallback && queue.on("basicConsumeOk", subscribeCallback);
      queue.on("queueBindOk", function () {
        queue.subscribe(subscribeOptions, function (message) {
          return handler(message);
        });
      });
      queue.bind(behaviour.exchange, routingKey);
    });
  }

  function close(callback) {
    conn.disconnect(callback);
  }

  function handleError(error) {
    if (behaviour.dieOnError) {
      setTimeout(function () {
        process.exit(1);
      }, 3000);
    }
    // TODO: this is not a good way to report errors, as this is the connection
    // callback that should only be called once. Use eventEmitter instead?
    return callback(new Error(error));
  }

  return api;
}

module.exports = connect;
