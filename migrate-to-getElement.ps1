# Migration script to replace els['id'] with getElement('id') in core.js
# Usage: .\migrate-to-getElement.ps1

$ErrorActionPreference = "Stop"

$filePath = Join-Path $PSScriptRoot "app\core.js"

Write-Host "Reading core.js..." -ForegroundColor Cyan
$content = Get-Content -Path $filePath -Raw

# Track changes
$changeCount = 0

# Create backup first
$backupPath = Join-Path $PSScriptRoot "app\core.js.backup"
Copy-Item -Path $filePath -Destination $backupPath -Force
Write-Host "Backup created at: $backupPath" -ForegroundColor Green

# Pattern 1: els['element-id'] (single quotes)
$pattern1 = "els\['([^']+)'\]"
$content = [regex]::Replace($content, $pattern1, {
    param($match)
    $script:changeCount++
    "getElement('$($match.Groups[1].Value)')"
})

# Pattern 2: els["element-id"] (double quotes) 
$pattern2 = 'els\["([^"]+)"\]'
$content = [regex]::Replace($content, $pattern2, {
    param($match)
    $script:changeCount++
    "getElement('$($match.Groups[1].Value)')"
})

Write-Host "`nMigration complete!" -ForegroundColor Green
Write-Host "Total replacements made: $changeCount" -ForegroundColor Yellow

# Write migrated content
Set-Content -Path $filePath -Value $content -NoNewline

Write-Host "Updated file: $filePath" -ForegroundColor Green
Write-Host "`n✅ Migration successful!" -ForegroundColor Green
Write-Host "⚠️  Please review the changes and test thoroughly." -ForegroundColor Yellow
Write-Host "💡 You can restore from backup if needed: $backupPath" -ForegroundColor Cyan
