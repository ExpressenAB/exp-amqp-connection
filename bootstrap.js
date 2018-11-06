"use strict";

var amqp = require("amqplib/callback_api");
var url = require("url");
var EventEmitter = require("events");
var qs = require("querystring");
var async = require("async");

var savedConn;

function bootstrap(behaviour, callback) {
  if (getSavedConnection(callback)) {
    return;
  }
  return doConnect(behaviour, callback);
}

function getSavedConnection(callback) {
  // We have a connection ready, just use it!
  if (savedConn && savedConn.connection) {
    callback(null, savedConn);
    return true;
  }

  // A saved connection is created but not yet ready, wait for it to finish
  if (savedConn) {
    savedConn.once("bootstrapped", function(error, handle) {
      if (error) return callback(error);
      callback(null, handle);
    });
    return true;
  }

  // No saved connection is available
  return false;
}

function doConnect(behaviour, callback) {

  var urlObj = url.parse(behaviour.url);
  urlObj.search = qs.stringify(Object.assign({ heartbeat: behaviour.heartbeat }, qs.parse(urlObj.search)));
  var amqpUrl = url.format(urlObj);
  var pendingConn = new EventEmitter();
  savedConn = pendingConn;
  var opts = { clientProperties: { product: behaviour.productName } };
  amqp.connect(amqpUrl, opts, function(connErr, conn) {
    if (connErr) {
      savedConn = null;
      pendingConn.emit("bootstrapped", connErr);
      return callback(connErr);
    }
    var errorHandler = function() {
      savedConn = null;
    };
    conn.on("error", errorHandler);
    conn.on("close", errorHandler);

    var createPubChannel =
      behaviour.confirm ? conn.createConfirmChannel.bind(conn) : conn.createChannel.bind(conn);
    var createSubChannel = conn.createChannel.bind(conn);
    async.series([createPubChannel, createSubChannel], function(channelErr, newChannels) {
      if (channelErr) {
        savedConn = null;
        pendingConn.emit("bootstrapped", channelErr);
        return callback(channelErr);
      }
      var pubChannel = newChannels[0];
      var subChannel = newChannels[1];
      pubChannel.assertExchange(behaviour.exchange, "topic");
      var handle = { connection: conn, pubChannel: pubChannel, subChannel: subChannel };
      savedConn = handle;
      pendingConn.emit("bootstrapped", null, handle);
      return callback(null, Object.assign({}, handle, { virgin: true }));
    });
  });
}

module.exports = bootstrap;
