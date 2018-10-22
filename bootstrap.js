"use strict";

var amqp = require("amqplib/callback_api");
var url = require("url");
var EventEmitter = require("events");
var qs = require("querystring");

var savedConns = {};

function connect(behaviour, listener, callback) {
  if (behaviour.reuse && attemptReuse(behaviour.reuse, callback)) {
    return;
  }
  return doConnect(behaviour, listener, callback);
}

function attemptReuse(key, callback) {
  var savedConn = savedConns[key];
  if (savedConn && savedConn.connection) {
    callback(null, savedConn.connection, savedConn.channel);
    return true;
  }
  if (savedConn) {
    savedConn.once("bootstrapped", function (error, handle) {
      if (error) return callback(error);
      callback(null, handle.connection, handle.channel);
    });
    return true;
  }
  return false;
}

function doConnect(behaviour, listener, callback) {
  var urlObj = url.parse(behaviour.url);
  urlObj.search = qs.stringify(Object.assign({heartbeat: behaviour.heartbeat}, qs.parse(urlObj.search)));
  var amqpUrl = url.format(urlObj);
  var reuse = new EventEmitter();
  if (behaviour.reuse) {
    savedConns[behaviour.reuse] = reuse;
  }
  var opts = {clientProperties: {product: behaviour.productName}};
  amqp.connect(amqpUrl, opts, function (connErr, newConnection) {
    if (connErr) {
      savedConns[behaviour.reuse] = null;
      reuse.emit("bootstrapped", connErr);
      listener.emit("error", connErr);
      return callback(connErr);
    }
    var errorHandler = function (error) {
      listener.emit("error", error);
      savedConns[behaviour.reuse] = null;
    };
    newConnection.on("error", errorHandler);
    newConnection.on("close", errorHandler);
    var onChannel = function (channelErr, newChannel) {
      if (channelErr) return callback(channelErr);
      if (behaviour.exchange) {
        newChannel.assertExchange(behaviour.exchange, behaviour.exchangeType, behaviour.exchangeOptions);
      }
      var handle = {connection: newConnection, channel: newChannel};
      savedConns[behaviour.reuse] = handle;
      reuse.emit("bootstrapped", null, handle);
      listener.emit("connected");
      return callback(null, newConnection, newChannel);
    };
    if (behaviour.confirm) {
      newConnection.createConfirmChannel(onChannel);
    } else {
      newConnection.createChannel(onChannel);
    }
  });
}

module.exports = connect;
