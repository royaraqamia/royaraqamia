# syntax=docker/dockerfile:1

# The origin image is built in GitHub Actions, not on the VPS: the 2 GB box
# cannot hold this repo's `next build` (the Render build machine needed a 6 GB
# old-generation heap). The VPS only pulls and runs the result.
FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    RENDER=1 \
    NODE_OPTIONS=--max-old-space-size=6144

# The version script calls `git rev-parse` at build time, so the build image
# needs git even though the runtime image does not.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates python3 make g++ git \
    && rm -rf /var/lib/apt/lists/*

COPY .npmrc package.json package-lock.json ./
RUN npm ci

COPY . .

# Inlined into the client bundle by Next, so these have to exist at build time.
ARG NEXT_PUBLIC_SITE_URL
ARG PUBLIC_ORIGIN
ARG NEXT_PUBLIC_WHATSAPP_PHONE
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY

ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    PUBLIC_ORIGIN=${PUBLIC_ORIGIN} \
    NEXT_PUBLIC_WHATSAPP_PHONE=${NEXT_PUBLIC_WHATSAPP_PHONE} \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY} \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=${NEXT_PUBLIC_VAPID_PUBLIC_KEY}

# Prerendered routes read through the admin client. The key is a build secret,
# never a build arg: BuildKit keeps it out of the image history.
RUN --mount=type=secret,id=supabase_service_role_key \
    export SUPABASE_SERVICE_ROLE_KEY="$(cat /run/secrets/supabase_service_role_key)" \
    && npm run build:render

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NODE_OPTIONS=--max-old-space-size=1024

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.js ./next.config.js
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/data ./data
# The assistant's specialist roster and vector index are read from disk at
# request time (ADR-0174); a container without them silently answers with
# fewer skills rather than failing, so they are copied explicitly.
COPY --from=build /app/.opencode/skills/agency ./.opencode/skills/agency

RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=60s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/manifest.json').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
