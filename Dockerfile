# StoreOps API — Node 20 LTS (spec §2.3 Step 1), multi-stage.
# Build stage compiles TypeScript; runtime stage carries only production deps and dist/.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
# Not `npm start`: its prestart hook runs tsc, which the runtime image does not ship.
CMD ["node", "dist/server.js"]
