FROM oven/bun:latest
WORKDIR /app

ENV TZ=Asia/Seoul

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3000
CMD [ "bun", "start" ]