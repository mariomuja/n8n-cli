# Push n8n-cli to https://github.com/mariomuja/n8n-cli
# Run from n8n root: .\n8n-cli\scripts\publish-to-github.ps1

$src = Join-Path $PSScriptRoot ".."
$dest = Join-Path (Split-Path $src -Parent) "n8n-cli-publish"
$repo = "https://github.com/mariomuja/n8n-cli.git"

# Sync source to publish folder (exclude node_modules, dist)
robocopy $src $dest /E /XD node_modules dist .git /NFL /NDL /NJH /NJS | Out-Null

Push-Location $dest
try {
    if (-not (Test-Path ".git")) {
        git init
        git remote add origin $repo
    }
    git add .
    $status = git status --short
    if (-not $status) {
        Write-Host "No changes to commit." -ForegroundColor Yellow
        exit 0
    }
    git status --short
    $msg = Read-Host "Commit message (or Enter for 'Update n8n-cli')"
    if ([string]::IsNullOrWhiteSpace($msg)) { $msg = "Update n8n-cli" }
    git commit -m $msg
    git branch -M main 2>$null
    git push -u origin main
    Write-Host "`nPushed to $repo" -ForegroundColor Green
} finally {
    Pop-Location
}
