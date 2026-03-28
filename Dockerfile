FROM node:24-bookworm-slim AS frontend-builder

WORKDIR /frontend

COPY package.json vite.config.js index.html ./
COPY src ./src

RUN npm install && npm run build

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    STATE_DB_PATH=/data/state.db \
    WEBHOOK_PATH=/meta/webhook \
    ADMIN_BASE_PATH=/admin

WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py README.md .env.example ./
COPY --from=frontend-builder /frontend/frontend-dist ./frontend-dist

RUN mkdir -p /data && chown -R app:app /app /data

USER app

VOLUME ["/data"]

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3).read()"

CMD ["python", "app.py"]
