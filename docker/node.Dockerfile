# Multi-stage image for the Node services (api, game-server, blockchain-service).
# Build:  docker build -f docker/node.Dockerfile --build-arg APP=api -t cryptoarena-api .
FROM node:22.22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY apps/api/package.json apps/api/
COPY apps/game-server/package.json apps/game-server/
COPY apps/blockchain-service/package.json apps/blockchain-service/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY packages ./packages
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG APP
COPY apps/${APP} apps/${APP}
COPY scripts ./scripts
COPY tsconfig.base.json ./
RUN pnpm exec prisma generate && pnpm --filter "@cryptoarena/${APP}" build

FROM base AS runtime
ARG APP
ENV NODE_ENV=production
WORKDIR /repo
# Third-party dependencies stay external to the bundle; workspace code is inlined by esbuild.
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/${APP}/node_modules ./apps/${APP}/node_modules
COPY --from=build /repo/apps/${APP}/dist ./apps/${APP}/dist
COPY --from=build /repo/apps/${APP}/package.json ./apps/${APP}/package.json
COPY --from=build /repo/prisma ./prisma
COPY --from=build /repo/prisma.config.ts ./prisma.config.ts
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/scripts/wait-for-db.mjs ./scripts/wait-for-db.mjs
USER node
WORKDIR /repo/apps/${APP}
CMD ["node", "--enable-source-maps", "dist/main.js"]
