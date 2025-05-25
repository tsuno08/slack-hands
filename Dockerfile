FROM node:24-alpine

RUN apk add --no-cache git

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

RUN pnpm install -g @openai/codex

COPY . .

RUN pnpm run build

RUN addgroup -g 1001 -S nodejs
RUN adduser -S slack-bot -u 1001
RUN chown -R slack-bot:nodejs /app
USER slack-bot

CMD ["pnpm", "start"]
