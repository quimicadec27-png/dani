# Stage 1: Build TypeScript
FROM node:20-alpine AS builder
WORKDIR /app

COPY ["agente quimica dec/package*.json", "./"]
COPY ["agente quimica dec/tsconfig.json", "./"]
RUN npm install

COPY ["agente quimica dec/src", "./src"]
RUN npm run build

# Stage 2: Produccion
FROM node:20-alpine
WORKDIR /app

COPY ["agente quimica dec/package*.json", "./"]
RUN npm install --only=production

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/index.js"]