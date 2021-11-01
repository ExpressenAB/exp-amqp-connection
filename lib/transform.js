"use strict";

const JSON_TYPE = "application/json";

function encode(body, meta) {

  const message = {
    props: meta,
    buffer: {}
  };

  if (typeof body === "string") {
    message.buffer = Buffer.from(body, "utf8");
  } else if (body instanceof Buffer) {
    message.buffer = body;
  } else {
    if (!message.props) message.props = {};
    message.props.contentType = "application/json";
    message.buffer = Buffer.from(JSON.stringify(body), "utf8");
  }

  return message;
}

function decode(message) {
  const props = message.properties || {};
  const messageStr = message.content.toString("utf8");

  return (props.contentType === JSON_TYPE) ? JSON.parse(messageStr) : messageStr;
}

module.exports = {
  encode: encode,
  decode: decode
};
