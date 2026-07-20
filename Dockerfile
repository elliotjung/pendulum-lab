# Reproducible environment for the full validation ladder.
#
# Bundles Node (for the TypeScript engine, unit tests, and report generators)
# and Python (for the independent SciPy/SymPy references) at pinned versions, so
# every README claim that needs an external check reproduces in one container —
# no "works on my machine" gap between the engine and its references.
#
#   docker build -t pendulum-lab .
#   docker run --rm pendulum-lab            # runs the default validation ladder
#   docker run --rm pendulum-lab npm test   # or any other script
FROM node:22.17.0-bookworm-slim@sha256:b04ce4ae4e95b522112c2e5c52f781471a5cbc3b594527bcddedee9bc48c03a0

# Python 3.11 ships with bookworm; add pip and a venv for the reference scripts.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps first (pinned) — cached unless requirements.txt changes.
COPY requirements.lock ./
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --require-hashes -r requirements.lock
ENV PATH="/opt/venv/bin:${PATH}"

# Node deps next (cached unless lockfile changes).
COPY package.json package-lock.json ./
RUN npm ci

# Project sources.
COPY --chown=node:node . .

# Validation and arbitrary caller-provided commands run without root. The venv
# is read-only to this user; generated reports remain writable under /app.
RUN chown -R node:node /app
USER node

# Default: the independent cross-checks plus the unit suite. Each script exits
# non-zero on a validation failure, so this doubles as a CI smoke gate.
CMD ["sh", "-c", "npm run validate:sympy && npm run validate:cross && npm test"]
