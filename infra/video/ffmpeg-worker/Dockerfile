FROM python:3.12-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 bqvideo \
    && useradd --uid 10001 --gid bqvideo --create-home --shell /usr/sbin/nologin bqvideo

WORKDIR /app
COPY --chown=bqvideo:bqvideo transcode.py runner.py /app/
USER 10001:10001

ENTRYPOINT ["python", "/app/runner.py"]
