# syntax=docker/dockerfile:1
# The hosted web app. Configuration comes from the environment at run time (see .env.example);
# no .env file is read inside the container.
FROM node:24-slim AS build
WORKDIR /repo
RUN npm install -g pnpm@11.23.0
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @then/web build \
 && cp -R apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

FROM node:24-slim
ENV NODE_ENV=production \
    THEN_ENV_FILE=none \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
