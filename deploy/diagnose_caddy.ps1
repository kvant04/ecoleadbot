# -*- coding: utf-8 -*-
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$config = Join-Path $Root "deploy\deploy.config.env"
Get-Content $config | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $p = $_ -split '=', 2
    if ($p.Count -eq 2) { Set-Item -Path ("Env:" + $p[0].Trim()) -Value $p[1].Trim() }
}
Import-Module Posh-SSH
$cred = New-Object PSCredential(
    $env:ECOBOT_SSH_USER,
    (ConvertTo-SecureString $env:ECOBOT_SSH_PASSWORD -AsPlainText -Force)
)
$s = New-SSHSession -ComputerName $env:ECOBOT_SSH_HOST -Credential $cred -AcceptKey
$cmds = @(
    'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"',
    'curl -s http://127.0.0.1:8000/api/health || echo LOCAL8000_FAIL',
    'docker ps --filter name=caddy --format "{{.Names}}"',
    'test -f /opt/n8n/Caddyfile && tail -25 /opt/n8n/Caddyfile || echo NO_CADDYFILE',
    'docker logs n8n-caddy-1 --tail 40 2>&1'
)
foreach ($c in $cmds) {
    Write-Host "=== $c ===" -ForegroundColor Cyan
    $r = Invoke-SSHCommand -SSHSession $s -Command $c -TimeOut 90
    if ($r.Output) { $r.Output | ForEach-Object { Write-Host $_ } }
    if ($r.Error) { $r.Error | ForEach-Object { Write-Host $_ -ForegroundColor Yellow } }
}
Remove-SSHSession -SSHSession $s | Out-Null
