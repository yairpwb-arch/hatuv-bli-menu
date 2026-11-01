# Full backup of the Supabase database (schema + data) before running migrations.
# Run from the project folder:   powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1
# Needs pg_dump 17 (the database is Postgres 17):  winget install PostgreSQL.PostgreSQL.17
# The database password: Supabase > Project Settings > Database (reset it there if unknown).
# It's asked for here and never saved.

$ErrorActionPreference = 'Stop'

$pgDump = 'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe'
if (-not (Test-Path $pgDump)) {
  Write-Host 'pg_dump 17 not found. Install it first:  winget install PostgreSQL.PostgreSQL.17' -ForegroundColor Red
  exit 1
}

$secure = Read-Host 'Supabase database password' -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

New-Item -ItemType Directory -Force backups | Out-Null
$file = "backups\backup-$(Get-Date -Format 'yyyy-MM-dd-HHmm').sql"

# Session pooler (IPv4, supports pg_dump). public = the app's tables,
# auth = the users, storage = file records (photos, avatars).
& $pgDump `
  --host aws-1-ap-northeast-1.pooler.supabase.com --port 5432 `
  --username postgres.bwndknbkchspvottwyho --dbname postgres `
  --schema public --schema auth --schema storage `
  --no-owner --no-privileges `
  --file $file

$code = $LASTEXITCODE
Remove-Item Env:PGPASSWORD
if ($code -ne 0) {
  Write-Host 'Backup failed (see the error above).' -ForegroundColor Red
  exit $code
}

$size = [math]::Round((Get-Item $file).Length / 1MB, 2)
$tables = (Select-String -Path $file -Pattern '^CREATE TABLE public\.' | Measure-Object).Count
Write-Host "Saved $file  ($size MB, $tables tables in public)" -ForegroundColor Green
