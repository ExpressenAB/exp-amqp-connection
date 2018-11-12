"use strict";

// Maintains a single connection with two channels (one for publish and one
// for subscribe) to an amqp server.

const amqp = require("amqplib/callback_api");
const url = require("url");
const EventEmitter = require("events");
const qs = require("querystring");
const async = require("async");

const savedConns = {};

function bootstrap(behaviour, callback) {
  if (getSavedConnection(behaviour, callback)) {
    return;
  }
  return connect(behaviour, callback);
}

function getSavedConnection(behaviour, callback) {
  const savedConn = savedConns[behaviour.configKey];
  // We have a connection ready, just use it!
  if (savedConn && savedConn.connection) {
    ensureSameBehaviourAndReuse(savedConn, behaviour, callback);
    return true;
  }

  // A saved connection is created but not yet ready, wait for it to finish
  if (savedConn) {
    savedConn.once("bootstrapped", (error, handle) => {
      if (error) return callback(error);
      ensureSameBehaviourAndReuse(handle, behaviour, callback);
    });
    return true;
  }

  // No saved connection is available
  return false;
}

function ensureSameBehaviourAndReuse(savedConnHandle, behaviour, callback) {
  if (savedConnHandle.behaviour !== behaviour) {
    const b1 = JSON.stringify(savedConnHandle.behaviour, null, 2);
    const b2 = JSON.stringify(behaviour, null, 2);
    const dupError = `Different amqp behaviours with same configKey detected: \n${b1}\n${b2}`;
    return callback(dupError);
  } else {
    return callback(null, savedConnHandle);
  }
}

function connect(behaviour, callback) {

  const urlObj = url.parse(behaviour.url);
  urlObj.search = qs.stringify(Object.assign({ heartbeat: behaviour.heartbeat }, qs.parse(urlObj.search)));
  const amqpUrl = url.format(urlObj);
  const pendingConn = new EventEmitter();
  savedConns[behaviour.configKey] = pendingConn;
  const opts = { clientProperties: { product: behaviour.productName } };
  amqp.connect(amqpUrl, opts, (connErr, conn) => {
    if (connErr) {
      savedConns[behaviour.configKey] = null;
      pendingConn.emit("bootstrapped", connErr);
      return callback(connErr);
    }
    const errorHandler = () => {
      savedConns[behaviour.configKey] = null;
    };
    conn.on("error", errorHandler);
    conn.on("close", errorHandler);

    const createPubChannel =
      behaviour.confirm ? conn.createConfirmChannel.bind(conn) : conn.createChannel.bind(conn);
    const createSubChannel = conn.createChannel.bind(conn);
    async.series([createPubChannel, createSubChannel], (channelErr, newChannels) => {
      if (channelErr) {
        savedConns[behaviour.configKey] = null;
        pendingConn.emit("bootstrapped", channelErr);
        return callback(channelErr);
      }
      const [pubChannel, subChannel] = newChannels;
      const handle = { connection: conn, pubChannel, subChannel, behaviour };
      savedConns[behaviour.configKey] = handle;
      pendingConn.emit("bootstrapped", null, handle);
      return callback(null, Object.assign({}, handle, { virgin: true }));
    });
  });
}

module.exports = bootstrap;
