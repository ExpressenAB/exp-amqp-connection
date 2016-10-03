FROM node:4
ADD package.json /app/package.json
RUN cd /app && npm i
ADD . /app

