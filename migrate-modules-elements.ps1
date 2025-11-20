# Script to replace els['id'] with _getEl('id') or _getById('id') in modules
# Dynamic elements use _getById (no caching), static use _getEl (cached)

$ErrorActionPreference = "Stop"

# Define dynamic elements (always fetch fresh, no caching)
$dynamicElements = @(
    'product-overlay',
    'product-overlay-body',
    'customer-overlay',
    'customer-overlay-body',
    'brand-suggestions',
    'supplier-suggestions',
    'category-suggestions'
)

# Modules to process
$modules = @(
    'app\modules\products.js',
    'app\modules\customers.js',
    'app\modules\pos.js',
    'app\modules\sales.js',
    'app\modules\reports.js'
)

foreach ($modulePath in $modules) {
    if (-not (Test-Path $modulePath)) {
        Write-Host "Skipping $modulePath - file not found" -ForegroundColor Yellow
        continue
    }
    
    Write-Host "Processing $modulePath..." -ForegroundColor Cyan
    
    # Read content
    $content = Get-Content $modulePath -Raw
    $originalContent = $content
    $replacements = 0
    
    # Replace dynamic elements with _getById
    foreach ($id in $dynamicElements) {
        # Match els['id'] or els["id"]
        $patterns = @(
            "els\['$id'\]",
            "els\[`"$id`"\]"
        )
        
        foreach ($pattern in $patterns) {
            $replacement = "_getById('$id')"
            if ($content -match $pattern) {
                $content = $content -replace $pattern, $replacement
                $count = ([regex]::Matches($originalContent, $pattern)).Count
                $replacements += $count
                Write-Host "  Replaced $count instance(s) of $pattern with $replacement" -ForegroundColor Green
            }
        }
    }
    
    # Replace all remaining els['...'] with _getEl('...')
    # Pattern: els['any-id'] or els["any-id"]
    $pattern1 = "els\['([^']+)'\]"
    $pattern2 = 'els\["([^"]+)"\]'
    
    $matches1 = [regex]::Matches($content, $pattern1)
    $matches2 = [regex]::Matches($content, $pattern2)
    
    foreach ($match in $matches1) {
        $id = $match.Groups[1].Value
        if ($dynamicElements -notcontains $id) {
            $oldText = $match.Value
            $newText = "_getEl('$id')"
            $content = $content -replace [regex]::Escape($oldText), $newText
            $replacements++
        }
    }
    
    foreach ($match in $matches2) {
        $id = $match.Groups[1].Value
        if ($dynamicElements -notcontains $id) {
            $oldText = $match.Value
            $newText = "_getEl('$id')"
            $content = $content -replace [regex]::Escape($oldText), $newText
            $replacements++
        }
    }
    
    if ($replacements -gt 0) {
        # Create backup
        $backupPath = $modulePath + ".backup"
        Copy-Item $modulePath $backupPath -Force
        Write-Host "  Backup created: $backupPath" -ForegroundColor Magenta
        
        # Write updated content
        Set-Content -Path $modulePath -Value $content -NoNewline
        Write-Host "  ✅ Updated $modulePath - $replacements total replacements" -ForegroundColor Green
    } else {
        Write-Host "  No changes needed for $modulePath" -ForegroundColor Gray
    }
}

Write-Host "`n✅ Migration complete!" -ForegroundColor Green
