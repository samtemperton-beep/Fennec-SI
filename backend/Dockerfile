FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN ./node_modules/.bin/tsc

EXPOSE 4000

CMD ["node", "dist/index.js"]
