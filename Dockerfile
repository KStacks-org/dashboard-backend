# The KStacks Dashboard API. JSON only — the dashboard frontend is a separate
# image on a separate origin, which is why FRONTEND_URL must be set at runtime
# to that origin: it is the allow-origin of this API's credentialed CORS
# policy, and a wrong value fails every browser request the dashboard makes.

# ---------- Stage 1: build ----------
FROM node:24-alpine AS builder

# Prisma's query engine links against OpenSSL, which node:*-alpine does not
# ship. Needed here for `prisma generate`, and again in the runtime stage.
RUN apk add --no-cache openssl

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

# Must be the same path in both stages: pnpm links every package from the
# virtual store with absolute symlinks, so a node_modules tree built under
# /app resolves nothing once it is copied somewhere else.
WORKDIR /app

# Manifests first, so a source-only change reuses the cached install layer.
COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts

# prisma generate -> tsc -> tsc-alias (which rewrites the @/* path aliases the
# compiled ESM output would otherwise be unable to resolve). Generating the
# client here means the image never depends on a client built on a developer's
# machine, and it lands inside node_modules ready for the prune below.
RUN pnpm build

# Drop devDependencies in place. The generated Prisma client survives because
# @prisma/client is a production dependency, and so is the prisma CLI — which
# it must be anyway for `prisma migrate deploy` to be runnable from this image.
RUN pnpm prune --prod

# ---------- Stage 2: runtime ----------
FROM node:24-alpine AS runner

# openssl for the Prisma query engine; wget for the HEALTHCHECK below.
RUN apk add --no-cache openssl wget

# Non-root, with the uid/gid every other KStacks service image uses.
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup

# Identical to the builder's WORKDIR — see the note there.
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4100

COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist

# Schema and migrations ship with the image so `prisma migrate deploy` can be
# run from it as a release step of its own, ahead of this container serving
# traffic. Nothing on the startup path applies a migration.
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma

USER appuser

EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4100/health || exit 1

# dist/src, not dist — tsconfig's rootDir spans src, prisma/seed.ts and
# scripts, so the compiler keeps src/ as a directory inside outDir.
CMD ["node", "dist/src/server.js"]
