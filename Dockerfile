FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY --chown=node:node . .

RUN BLAKFILE_BUILD=1 npm run build

ENV NODE_ENV=production
EXPOSE 3000
USER node

CMD ["npm", "run", "start"]
