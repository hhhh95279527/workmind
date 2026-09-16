# server/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json tsconfig*.json ./
RUN npm install --legacy-peer-deps

COPY src/ ./src/

# 编译 TypeScript（devDependencies 里包含 typescript）
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:3000/health/live || exit 1

CMD ["node", "dist/main.js"]
