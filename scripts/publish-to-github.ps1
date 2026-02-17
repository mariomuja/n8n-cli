# Push n8n-cli to https://github.com/mariomuja/n8n-cli
# Run from anywhere: .\n8n-cli\scripts\publish-to-github.ps1
# Uses git subtree to push n8n/n8n-cli directly (no staging folder).

$repo = "https://github.com/mariomuja/n8n-cli.git"
$prefix = "n8n/n8n-cli"

$root = git rev-parse --show-toplevel 2>$null
if (-not $root) {
    Write-Host "Not in a git repo." -ForegroundColor Red
    exit 1
}

Push-Location $root
try {
    git subtree push --prefix=$prefix $repo main
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nPushed to $repo" -ForegroundColor Green
    }
} finally {
    Pop-Location
}
