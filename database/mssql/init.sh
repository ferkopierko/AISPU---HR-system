#!/bin/bash
# Inicializácia lokálneho SQL Servera (náhrada Azure SQL pri vývoji a v Dockeri).
# Spúšťa ho služba mssql-init v docker-compose.yml: vytvorí databázu,
# nasadí rovnakú schému ako v Azure (database/azure-sql/schema.sql) a testovacie dáta.
set -e
SQLCMD="/opt/mssql-tools18/bin/sqlcmd -C -S mssql -U sa -P $MSSQL_SA_PASSWORD -b"

echo "Čakám na SQL Server…"
for i in $(seq 1 60); do
  $SQLCMD -Q "SELECT 1" > /dev/null 2>&1 && break
  sleep 2
done

$SQLCMD -Q "IF DB_ID(N'$DB_NAME') IS NULL CREATE DATABASE [$DB_NAME];"

# Pri reštarte sa existujúca databáza ešte chvíľu obnovuje, aj keď server už odpovedá.
for i in $(seq 1 30); do
  $SQLCMD -d "$DB_NAME" -Q "SELECT 1" > /dev/null 2>&1 && break
  sleep 2
done
$SQLCMD -d "$DB_NAME" -i /scripts/azure-sql/schema.sql
$SQLCMD -d "$DB_NAME" -i /scripts/mssql/seed.sql
echo "Databáza $DB_NAME je pripravená."
