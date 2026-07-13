FROM pgvector/pgvector:pg16

COPY docker/postgres-init.sql /docker-entrypoint-initdb.d/00-init.sql
USER postgres
