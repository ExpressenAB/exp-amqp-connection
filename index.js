"use strict";
var amqp = require("amqplib/callback_api");
var EventEmitter = require("events");
var _ = require("lodash");

var JSON_TYPE = "application/json";

var savedConns = {};

function connect(url, behaviour, callback) {
  if (behaviour.reuse && attemptReuse(behaviour.reuse, callback)) {
    return;
  }
  return doConnect(url, behaviour, callback);
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

function doConnect(url, behaviour, callback) {
  var api = _.assign(new EventEmitter(), {
    subscribe: subscribe,
    publish: publish,
    ack: ack,
    nack: nack,
    deleteQueue: deleteQueue,
    close: close
  });

  var channel = null;
  var conn = null;
  var reuse = new EventEmitter();
  if (behaviour.reuse) {
    savedConns[behaviour.reuse] = reuse;
  }

  // TODO: enable heartbeats
  amqp.connect(url, function (connErr, newConnection) {
    if (connErr) return callback(connErr);
    conn = newConnection;
    var onChannel = function (channelErr, newChannel) {
      if (channelErr) return callback(channelErr);
      channel = newChannel;
      channel.prefetch(behaviour.prefetch);
      if (behaviour.exchange) {
        channel.assertExchange(behaviour.exchange, "topic");
      }
      channel.on("close", function (why) {
        savedConns[behaviour.reuse] = null;
        api.emit("close", why);
      });
      channel.on("error", function (amqpError) {
        savedConns[behaviour.reuse] = null;
        api.emit("error", amqpError);
      });
      reuse.emit("bootstrapped", api);
      reuse.api = api;
      return callback(null, api);
    };
    if (behaviour.confirmMode) {
      conn.createConfirmChannel(onChannel);
    } else {
      conn.createChannel(onChannel);
    }
  });

  function publish(routingKey, message, pubCallback) {
    var encodedMsg = encode(message);
    channel.publish(behaviour.exchange, routingKey, encodedMsg.buffer, encodedMsg.props);
    if (behaviour.confirmMode) {
      channel.waitForConfirms(pubCallback || function () {});
    }
  }

  function subscribe(routingKeyOrKeys, queueName, handler, subCallback) {
    subCallback = subCallback || function () {};
    var routingKeys = Array.isArray(routingKeyOrKeys) ? routingKeyOrKeys : [routingKeyOrKeys];

    channel.assertQueue(queueName, {}, function (queueErr) {
      if (queueErr) return subCallback(queueErr);
      routingKeys.forEach(function (key) {
        channel.bindQueue(queueName, behaviour.exchange, key, {}, function (bindErr) {
          if (bindErr) return subCallback(bindErr);
        });
      });
      var amqpHandler = function (message) {
        handler(decode(message), message);
      };
      var consumeOpts = {noAck: !behaviour.ack};
      channel.consume(queueName, amqpHandler, consumeOpts, subCallback);
    });
  }

  function ack(msg) {
    channel.ack(msg);
  }

  function nack(msg) {
    channel.nack(msg);
  }

  function close(closeCallback) {
    if (channel) {
      channel.close();
    }
    if (conn) {
      conn.close(closeCallback);
    } else {
      closeCallback();
    }
  }

  function deleteQueue(queueName) {
    channel.deleteQueue(queueName);
  }

  function encode(body) {
    if (typeof body === "string") {
      return {buffer: new Buffer(body, "utf8")};
    } else if (body instanceof Buffer) {
      return {buffer: body};
    } else {
      return {
        props: {contentType: "application/json"},
        buffer: new Buffer(JSON.stringify(body), "utf8")
      };
    }
  }

  function decode(message) {
    if (!message) api.emit("error", "Subscription cancelled");
    var messageStr = message.content.toString("utf8");
    return (message.properties.contentType === JSON_TYPE) ? JSON.parse(messageStr) : messageStr;
  }

  return api;
}

module.exports = connect;
