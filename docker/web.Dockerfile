# Static build of the web client or admin panel served by nginx.
#   docker build -f docker/web.Dockerfile --build-arg APP=web -t cryptoarena-web .
FROM node:22.22-alpine AS build
RUN corepack enable
WORKDIR /repo
ARG APP=web
ARG VITE_GAME_URL=ws://localhost:2567
ARG VITE_SOLANA_NETWORK=devnet
ARG VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
ENV VITE_GAME_URL=$VITE_GAME_URL VITE_SOLANA_NETWORK=$VITE_SOLANA_NETWORK VITE_SOLANA_RPC_URL=$VITE_SOLANA_RPC_URL
COPY . .
RUN pnpm install --frozen-lockfile && pnpm exec prisma generate && pnpm --filter "@cryptoarena/${APP}" build

FROM nginx:1.29-alpine
ARG APP=web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/${APP}/dist /usr/share/nginx/html
