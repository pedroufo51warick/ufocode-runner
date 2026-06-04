# syntax=docker/dockerfile:1
FROM node:20-alpine

RUN apk add --no-cache bash tini

WORKDIR /app

# Copia o template inicial (Vite + React + TS + Tailwind + shadcn mínimo)
COPY template/ /app/
RUN npm install --no-audit --no-fund --silent

# Copia o servidor de controle (porta 8081 interna, expõe /_runner via 8080)
WORKDIR /runner-server
COPY server/package.json /runner-server/package.json
RUN npm install --no-audit --no-fund --silent
COPY server/ /runner-server/

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PORT=8080 NODE_ENV=development
EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]