"use strict";

// Maintains a single connection with two channels (one for publish and one
// for subscribe) to an amqp server.

const amqp = require("amqplib/callback_api");
const url = require("url");
const EventEmitter = require("events");
const qs = require("querystring");
const async = require("async");

let savedConn;

function bootstrap(behaviour, callback) {
  if (getSavedConnection(callback)) {
    return;
  }
  return connect(behaviour, callback);
}

function getSavedConnection(callback) {
  // We have a connection ready, just use it!
  if (savedConn && savedConn.connection) {
    callback(null, savedConn);
    return true;
  }

  // A saved connection is created but not yet ready, wait for it to finish
  if (savedConn) {
    savedConn.once("bootstrapped", (error, handle) => {
      if (error) return callback(error);
      callback(null, handle);
    });
    return true;
  }

  // No saved connection is available
  return false;
}

function connect(behaviour, callback) {

  const urlObj = url.parse(behaviour.url);
  urlObj.search = qs.stringify(Object.assign({ heartbeat: behaviour.heartbeat }, qs.parse(urlObj.search)));
  const amqpUrl = url.format(urlObj);
  const pendingConn = new EventEmitter();
  savedConn = pendingConn;
  const opts = { clientProperties: { product: behaviour.productName } };
  amqp.connect(amqpUrl, opts, (connErr, conn) => {
    if (connErr) {
      savedConn = null;
      pendingConn.emit("bootstrapped", connErr);
      return callback(connErr);
    }
    const errorHandler = () => {
      savedConn = null;
    };
    conn.on("error", errorHandler);
    conn.on("close", errorHandler);

    const createPubChannel =
      behaviour.confirm ? conn.createConfirmChannel.bind(conn) : conn.createChannel.bind(conn);
    const createSubChannel = conn.createChannel.bind(conn);
    async.series([createPubChannel, createSubChannel], (channelErr, newChannels) => {
      if (channelErr) {
        savedConn = null;
        pendingConn.emit("bootstrapped", channelErr);
        return callback(channelErr);
      }
      const [pubChannel, subChannel] = newChannels;
      const handle = { connection: conn, pubChannel, subChannel };
      savedConn = handle;
      pendingConn.emit("bootstrapped", null, handle);
      return callback(null, Object.assign({}, handle, { virgin: true }));
    });
  });
}

module.exports = bootstrap;
