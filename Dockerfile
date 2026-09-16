# ==========================================================================
#  Korean Beauty — образ для Docker и платформ (Railway, Render, Fly.io)
#
#  Сборка:  docker build -t korean-beauty .
#  Запуск:  docker run -d --name kb -p 3000:3000 \
#             -v kb-data:/data \
#             -e KB_PUBLIC_URL=https://koreanbeauty.uz \
#             korean-beauty
#
#  Том /data обязателен: в нём база и фото. Без тома при пересоздании
#  контейнера пропадут все товары и заказы.
# ==========================================================================

# Node 22 LTS: в нём есть встроенная SQLite (node:sqlite), нативная сборка не нужна
FROM node:22-slim

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    KB_DATA_DIR=/data \
    KB_BACKUP_DIR=/data/backups \
    # Прокси платформы и nginx на хосте приходят из внутренней сети.
    # Клиенты из интернета — нет, и подменить свой IP не смогут.
    KB_TRUST_PROXY=uniquelocal

WORKDIR /app

# Сначала только манифесты: слой с зависимостями кэшируется,
# и пересборка после правки кода проходит за секунды
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server ./server
COPY public ./public

# Не работаем от root: если в приложении найдут уязвимость,
# злоумышленник не получит полный контроль над контейнером
RUN mkdir -p /data && chown -R node:node /data
USER node

VOLUME ["/data"]
EXPOSE 3000

# Платформа сама перезапустит контейнер, если магазин перестал отвечать
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# exec-форма: сигнал SIGTERM доходит до Node напрямую,
# и магазин успевает корректно закрыть базу при остановке
CMD ["node", "--no-warnings", "server/index.js"]
