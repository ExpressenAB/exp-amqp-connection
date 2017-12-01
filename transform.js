"use strict";

var JSON_TYPE = "application/json";

function encode(body, meta) {

  var message = {
    props: meta,
    buffer: {}
  };

  if (typeof body === "string") {
    message.buffer = new Buffer(body, "utf8");
  } else if (body instanceof Buffer) {
    message.buffer = body;
  } else {
    if (!message.props) message.props = {};
    message.props.contentType = "application/json";
    message.buffer = new Buffer(JSON.stringify(body), "utf8");
  }

  return message;
}

function decode(message) {
  var messageStr = message.content.toString("utf8");
  if (!message.properties) {
    return messageStr;
  }
  return (message.properties.contentType === JSON_TYPE) ? JSON.parse(messageStr) : messageStr;
}

module.exports = {
  encode: encode,
  decode: decode
};
