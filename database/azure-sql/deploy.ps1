# Nasadi schema.sql do Azure SQL Database.
# Prihlasovacie udaje cita z .env v koreni projektu.
# Pouzitie (z korena projektu):  powershell -File database\azure-sql\deploy.ps1
#
# Pozn.: subor je zamerne iba ASCII - Windows PowerShell 5.1 cita UTF-8 bez BOM
# ako ANSI a diakritika by rozbila parsovanie.

$root = Resolve-Path "$PSScriptRoot\..\.."
$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) { throw ".env neexistuje - skopiruj .env.example a dopln hodnoty." }

$cfg = @{}
Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -match '^\s*([A-Z_]+)=(.*)$' } | ForEach-Object {
    $cfg[$Matches[1]] = $Matches[2].Trim()
}
if (-not $cfg.AZURE_SQL_PASSWORD) { throw "AZURE_SQL_PASSWORD v .env je prazdne." }

# sqlcmd cita heslo z premennej SQLCMDPASSWORD, takze sa neobjavi v prikazovom riadku
$env:SQLCMDPASSWORD = $cfg.AZURE_SQL_PASSWORD
$server = "tcp:$($cfg.AZURE_SQL_HOST),$($cfg.AZURE_SQL_PORT)"
try {
    sqlcmd -S $server -d $cfg.AZURE_SQL_DATABASE -U $cfg.AZURE_SQL_USER -N -b -i "$PSScriptRoot\schema.sql"
    if ($LASTEXITCODE -ne 0) { throw "Nasadenie zlyhalo (exit $LASTEXITCODE)." }

    sqlcmd -S $server -d $cfg.AZURE_SQL_DATABASE -U $cfg.AZURE_SQL_USER -N -b -Q "SELECT name FROM sys.tables ORDER BY name"
}
finally {
    Remove-Item Env:SQLCMDPASSWORD -ErrorAction SilentlyContinue
}
