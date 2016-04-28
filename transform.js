"use strict";

var JSON_TYPE = "application/json";

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
  var messageStr = message.content.toString("utf8");
  return (message.properties.contentType === JSON_TYPE) ? JSON.parse(messageStr) : messageStr;
}

module.exports = {
  encode: encode,
  decode: decode
};
