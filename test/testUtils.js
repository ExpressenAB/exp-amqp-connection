"use strict";

// eslint-ignore:  no-console

const got = require("got");
const impl = require("../");

const rabbitUrl = process.env.RABBIT_URL;
const defaultBehaviour = { exchange: "e1", confirm: true, url: rabbitUrl, resubscribeOnError: false };

const request = got.extend({
  prefixUrl: process.env.RABBIT_MGT_URL,
  retry: 0,
  responseType: "json",
  timeout: {
    socket: 5000,
  },
});

function init(customBehaviour) {
  const broker = impl({...defaultBehaviour, ...customBehaviour});
  broker.on("error", () => {});
  return broker;
}

async function getRabbitConnections() {
  const resp = await request.get("api/connections");
  return resp.body;
}

async function killRabbitConnections() {
  const connections = await getRabbitConnections();
  return Promise.all(connections.map(killRabbitConnection));
}

function killRabbitConnection(conn) {
  return deleteResource(`api/connections/${conn.name}`);
}

function deleteRabbitExchange(exchange) {
  return deleteResource(`api/exchange/%2F/${exchange}`);
}

function deleteRabbitQueue(queue) {
  deleteResource(`api/queues/%2F/${queue}`);
}

async function deleteResource(url) {
  const resp = await request.delete(url, {throwHttpErrors: false});
  if (resp.statusCode === 404) return;
  if (resp.statusCode >= 500) throw new Error(resp.statusCode);
}

function shutdown(broker, done) {
  if (!broker?.shutdown) return done();

  broker.removeAllListeners("error");
  broker.on("error", () => {});
  broker.shutdown((err) => {
    if (err) {
      // eslint-disable-next-line no-console
      console.log("Ignoring shutdown error", err.message);
    }
    done();
  });
}

function waitForTruthy(fun, cb) {
  return fun() ? cb() : setTimeout(() => waitForTruthy(fun, cb), 5);
}

module.exports = {
  waitForTruthy,
  shutdown,
  deleteRabbitExchange,
  deleteRabbitQueue,
  killRabbitConnections,
  rabbitUrl,
  init,
  getRabbitConnections,
  defaultBehaviour
};
