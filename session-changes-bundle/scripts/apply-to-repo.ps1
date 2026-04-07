param(
    [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundleDir = Split-Path -Parent $scriptDir
$patchRoot = Join-Path $bundleDir "patch-root"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Split-Path -Parent $bundleDir
}

if (-not (Test-Path $patchRoot)) {
    Write-Error "未找到 patch-root：$patchRoot"
}

Write-Host "RepoRoot: $RepoRoot"
Write-Host "Patch:    $patchRoot"

Get-ChildItem -Path $patchRoot -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($patchRoot.Length).TrimStart('\', '/')
    $dest = Join-Path $RepoRoot $rel
    $destDir = Split-Path $dest -Parent
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    Copy-Item $_.FullName $dest -Force
    Write-Host "  + $rel"
}

$toRemove = @(
    "backend\routes\admin\config.js",
    "backend\services\ConfigService.js",
    "admin-ui\src\views\system-config\index.vue"
)
foreach ($rel in $toRemove) {
    $p = Join-Path $RepoRoot $rel
    if (Test-Path $p) {
        Remove-Item $p -Force
        Write-Host "  (removed) $rel"
    }
}

Write-Host ""
Write-Host "下一步：在 MySQL 执行 session-changes-bundle\scripts\run-sql-migrations.sql"
Write-Host "然后重启后端、按需重新构建 admin-ui / 上传小程序。"
