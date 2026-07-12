FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .

# The production build imports route modules, which validate these settings.
# The screenshot Compose stack supplies isolated development-only values at
# runtime, so none of these image-build placeholders are deployed credentials.
ENV BETTER_AUTH_SECRET=build-only-secret-not-for-production \
    DATABASE_URL=postgres://blakfile_app:blakfile@postgres:5432/blakfile \
    DATABASE_MIGRATION_URL=postgres://blakfile:blakfile@postgres:5432/blakfile
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start"]
