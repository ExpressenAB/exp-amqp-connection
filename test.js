"use strict";
/* eslint-disable */
var behaviour = {
  url: "amqp://api:api@epitest.rabbitmq.service.consul.xpr.dex.nu",
  exchange: "foobar",
  ack: false
};
var amqp = require(".")(behaviour);

amqp.on("error", function(err) {
  console.log("ERROR EVENT", err);

});
/*
amqp.subscribe("a", "myq", function(m, x, f) {
  f.ack();
  console.log("Got message", m);
});
*/

amqp.subscribeTmp("a", function(m, x, f) {
  // f.ack();
  console.log("Got message 2", m);
});


amqp.on("subscribed", function(info) {
  console.log("SUB UP", info);
});

var i = 0;
setInterval(function() {
  i = i + 1;
  amqp.publish("a", "" + i, function(err) {
    //console.log("SENT", err);
  });
}, 1000);
