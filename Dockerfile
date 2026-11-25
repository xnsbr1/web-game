FROM node:24-alpine
WORKDIR /app
COPY shooter.html signal.html ./
COPY account-server/ ./account-server/
ENV HOST=0.0.0.0 GAME_DB=/data/game.sqlite
RUN mkdir -p /data
CMD ["node","account-server/server.mjs"]
