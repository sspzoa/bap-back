FROM oven/bun:latest
WORKDIR /app

ENV TZ=Asia/Seoul

COPY package.json ./
RUN bun install

COPY . .

EXPOSE 3000
CMD [ "bun", "start" ]