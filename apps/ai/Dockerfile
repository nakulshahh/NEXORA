# syntax=docker/dockerfile:1
# Build context: the repository root (the lessons are the knowledge base).   docker build -f apps/ai/Dockerfile -t nexora-ai .
FROM python:3.12-slim AS build
WORKDIR /src
COPY apps/ai /src/apps/ai
# A real (non-editable) install: this is the layout that once lost the SQL migrations, now covered by a test.
RUN python -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir ./apps/ai

FROM python:3.12-slim AS runtime
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 APP_ENV=production EMBEDDER=hashing PORT=8000 \
    LESSONS_DIR=/app/lessons SOURCES_DIR=/app/sources
RUN useradd --system --uid 10001 nexora
WORKDIR /app
COPY --from=build /opt/venv /opt/venv
COPY packages/content/lessons /app/lessons
COPY apps/ai/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN mkdir -p /app/sources && chmod +x /app/docker-entrypoint.sh
USER nexora
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request as u,sys; sys.exit(0 if u.urlopen('http://127.0.0.1:'+os.environ['PORT']+'/readyz', timeout=2).status==200 else 1)"
ENTRYPOINT ["/app/docker-entrypoint.sh"]
