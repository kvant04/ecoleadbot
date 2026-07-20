# Build ZIP for SpaceWeb -> EcoLeadBot folder (elb.ecolusspb.ru)
# Run from repo root:
#   powershell -ExecutionPolicy Bypass -File deploy/pack_sweb_static.ps1
#
# Source of truth = repo root (app.js, index.html, data/, kb/).
# deploy/sweb/dist/ is a generated snapshot — do not edit by hand.
# See deploy/sweb/README.md

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$OutDir = Join-Path $Root "deploy\sweb\dist"
$ZipPath = Join-Path $Root "deploy\sweb\ecoleadbot-sweb.zip"

if (Test-Path $OutDir) { Remove-Item -Recurse -Force $OutDir }
New-Item -ItemType Directory -Path $OutDir | Out-Null

$items = @(
    @{ Src = "index.html"; Dst = "index.html" },
    @{ Src = "app.js"; Dst = "app.js" },
    @{ Src = "styles.css"; Dst = "styles.css" },
    @{ Src = "deploy\sweb\elb-config.js"; Dst = "elb-config.js" },
    @{ Src = "assets"; Dst = "assets" },
    @{ Src = "data\services_catalog_v1.4.json"; Dst = "data\services_catalog_v1.4.json" },
    @{ Src = "data\mini_assessment_zones_v1.4.json"; Dst = "data\mini_assessment_zones_v1.4.json" },
    @{ Src = "data\qual_question_labels_ru.json"; Dst = "data\qual_question_labels_ru.json" },
    @{ Src = "kb\mini_assessment"; Dst = "kb\mini_assessment" }
)

foreach ($item in $items) {
    $srcPath = Join-Path $Root $item.Src
    $dstPath = Join-Path $OutDir $item.Dst
    if (-not (Test-Path $srcPath)) {
        Write-Warning "Skip missing: $($item.Src)"
        continue
    }
    $dstParent = Split-Path -Parent $dstPath
    if ($dstParent -and -not (Test-Path $dstParent)) {
        New-Item -ItemType Directory -Path $dstParent -Force | Out-Null
    }
    if (Test-Path $srcPath -PathType Container) {
        Copy-Item -Path $srcPath -Destination $dstPath -Recurse -Force
    } else {
        Copy-Item -Path $srcPath -Destination $dstPath -Force
    }
}

if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Compress-Archive -Path (Join-Path $OutDir "*") -DestinationPath $ZipPath -Force

Write-Host "Done."
Write-Host "Folder: $OutDir"
Write-Host "ZIP:    $ZipPath"
Write-Host "Upload to SpaceWeb file manager -> site EcoLeadBot"
