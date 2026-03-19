# Database Export Script
# Exports Supabase database to SQL file with timestamp
# Usage: .\scripts\export-db.ps1 [-Compress] [-Path <backup-path>]

param(
    [switch]$Compress,
    [string]$Path = "backups"
)

# Error handling
$ErrorActionPreference = "Stop"

# Create backups directory if it doesn't exist
if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
    Write-Host "Created backup directory: $Path" -ForegroundColor Green
}

# Generate timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd__HH-mm"
$sqlFile = Join-Path $Path "db-backup-$timestamp.sql"
$finalFile = $sqlFile

Write-Host "Starting database export..." -ForegroundColor Cyan
Write-Host "Output file: $sqlFile" -ForegroundColor Gray

try {
    # Check if supabase CLI is available
    $supabaseVersion = supabase --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Supabase CLI not found. Please install it: https://supabase.com/docs/guides/cli"
    }

    # Export database using Supabase CLI
    Write-Host "Running: supabase db dump..." -ForegroundColor Yellow
    
    # Check if we're in a Supabase project directory
    if (-not (Test-Path "supabase\config.toml")) {
        Write-Warning "supabase/config.toml not found. Make sure you're in the project root."
        Write-Host "Attempting to export anyway..." -ForegroundColor Yellow
    }

    # Run the dump command
    supabase db dump -f $sqlFile
    
    if ($LASTEXITCODE -ne 0) {
        throw "Database dump failed with exit code $LASTEXITCODE"
    }

    # Check if file was created and has content
    if (-not (Test-Path $sqlFile)) {
        throw "Backup file was not created: $sqlFile"
    }

    $fileSize = (Get-Item $sqlFile).Length
    if ($fileSize -eq 0) {
        throw "Backup file is empty: $sqlFile"
    }

    Write-Host "Database export completed successfully!" -ForegroundColor Green
    Write-Host "File size: $([math]::Round($fileSize / 1MB, 2)) MB" -ForegroundColor Gray

    # Compress if requested
    if ($Compress) {
        Write-Host "Compressing backup..." -ForegroundColor Yellow
        $gzFile = "$sqlFile.gz"
        
        # Use .NET compression (available on Windows PowerShell)
        $inputFile = Get-Item $sqlFile
        $outputFile = New-Object System.IO.FileStream($gzFile, [System.IO.FileMode]::Create)
        $gzipStream = New-Object System.IO.Compression.GZipStream($outputFile, [System.IO.Compression.CompressionMode]::Compress)
        $inputFile.OpenRead().CopyTo($gzipStream)
        $gzipStream.Close()
        $outputFile.Close()

        $compressedSize = (Get-Item $gzFile).Length
        $compressionRatio = [math]::Round((1 - ($compressedSize / $fileSize)) * 100, 1)
        
        Write-Host "Compression completed!" -ForegroundColor Green
        Write-Host "Compressed size: $([math]::Round($compressedSize / 1MB, 2)) MB ($compressionRatio% reduction)" -ForegroundColor Gray
        
        # Remove original file
        Remove-Item $sqlFile
        $finalFile = $gzFile
    }

    Write-Host "`nBackup saved to: $finalFile" -ForegroundColor Green

    # Optional: Send to Sentry (if Sentry CLI is configured)
    # Uncomment if you want to track backup events
    # if (Get-Command sentry-cli -ErrorAction SilentlyContinue) {
    #     Write-Host "Logging backup event to Sentry..." -ForegroundColor Yellow
    #     sentry-cli send-event -m "Database backup completed" -t "backup" -e "info" --extra "file=$finalFile" --extra "size=$fileSize"
    # }

} catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Stack trace: $($_.ScriptStackTrace)" -ForegroundColor Gray
    
    # Clean up partial file if it exists
    if (Test-Path $sqlFile) {
        Remove-Item $sqlFile -ErrorAction SilentlyContinue
    }
    
    exit 1
}

Write-Host "`nExport script completed successfully!" -ForegroundColor Green
