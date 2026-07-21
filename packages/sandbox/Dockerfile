# Invigil sandbox image: python + harness, nothing else.
# Build:  docker build -t invigil-sandbox packages/sandbox
# The runner invokes:
#   docker run --rm -i --network none --cpus 1 --memory 512m --pids-limit 128 \
#     --read-only --user 65534:65534 invigil-sandbox
FROM python:3.12-slim
COPY harness.py /harness.py
USER 65534:65534
ENTRYPOINT ["python", "/harness.py"]
