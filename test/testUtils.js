"use strict";

// eslint-ignore:  no-console

const request = require("request");
const URL = require("url").URL;
const assert = require("assert");
const impl = require("../");

const rabbitUrl = process.env.RABBIT_URL || "amqp://guest:guest@localhost";
const defaultBehaviour = { exchange: "e1", confirm: true, url: rabbitUrl };

function init(customBehaviour) {
  return impl(Object.assign({}, defaultBehaviour, customBehaviour));
}

function getRabbitConnections(callback) {
  request.get(
    `${adminUrl()}/api/connections`, (err, resp, connections) => {
      if (err) return callback(err);
      callback(null, JSON.parse(connections));
    });
}

function killRabbitConnections() {
  getRabbitConnections((err, connections) => {
    if (err) return assert(false, err);
    connections.forEach(killRabbitConnection);
  });
}

function killRabbitConnection(conn) {
  deleteResource(`${adminUrl()}/api/connections/${conn.name}`, assert.ifError);
}

function deleteRabbitQueue(queue, done) {
  deleteResource(`${adminUrl()}/api/queues/%2F/${queue}`, done);
}

function deleteResource(url, done) {
  request.del(url, (err, resp, body) => {
    if (err) return done(err);
    if (resp.statusCode === 404) return done();
    if (resp.statusCode >= 300) return done(`${resp.statusCode} ${body}`);
    done();
  });
}

function adminUrl() {
  const url = new URL(rabbitUrl);
  url.port = 15672;
  return url.href.replace("amqp://", "http://");
}

function shutdown(broker, done) {
  if (broker) {
    try {
      broker.removeAllListeners("error");
      broker.on("error", () => {});
      broker.shutdown((err) => {
        // eslint-disable-next-line no-console
        if (err) console.log("Ignoring shutdown error", err.message);
        done();
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log("Ignoring shutdown error", err.message);
      done();
    }
  } else {
    setImmediate(done);
  }
}

function waitForTruthy(fun, cb) {
  return fun() ? cb() : setTimeout(() => waitForTruthy(fun, cb), 5);
}


module.exports = {
  waitForTruthy,
  shutdown,
  deleteRabbitQueue,
  killRabbitConnections,
  rabbitUrl,
  init,
  getRabbitConnections,
  defaultBehaviour
};
