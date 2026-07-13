FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .

RUN BLAKFILE_BUILD=1 npm run build
RUN chown -R node:node /app

ENV NODE_ENV=production
EXPOSE 3000
USER node

CMD ["npm", "run", "start"]
