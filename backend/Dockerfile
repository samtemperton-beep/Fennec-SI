FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY tsconfig.json ./
COPY src ./src
RUN npm install -g ts-node typescript
EXPOSE 4000
CMD ["ts-node", "src/index.ts"]
