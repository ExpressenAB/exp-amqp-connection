FROM node:8
ADD package.json /app/package.json
RUN cd /app && npm i
ADD . /app

