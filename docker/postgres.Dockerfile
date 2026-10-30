# Postgres 17 (the version Neon runs for this project) with pgTAP and pg_prove,
# for the database tests locally and in CI.
FROM postgres:17
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-17-pgtap libtap-parser-sourcehandler-pgtap-perl \
  && rm -rf /var/lib/apt/lists/*
