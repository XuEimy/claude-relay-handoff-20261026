FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4174 DATABASE_PATH=/app/data/kelaodeyun.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/lib ./lib
COPY --from=build /app/server.mjs /app/package.json ./
RUN mkdir /app/data && chown -R node:node /app
USER node
EXPOSE 4174
VOLUME /app/data
CMD ["node", "server.mjs"]
