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

$fixCmd = @'
set -e
CADDY_NET=$(docker inspect n8n-caddy-1 --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -1)
echo "Caddy network: $CADDY_NET"
docker network inspect "$CADDY_NET" --format '{{range .Containers}}{{.Name}} {{end}}'
if docker inspect ecoleadbot --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | grep -q "$CADDY_NET"; then
  echo "ecoleadbot already on $CADDY_NET"
else
  docker network connect "$CADDY_NET" ecoleadbot
  echo "Connected ecoleadbot to $CADDY_NET"
fi
# fallback in Caddyfile: host port if DNS name fails
CADDY="/opt/n8n/Caddyfile"
if grep -q 'reverse_proxy ecoleadbot:8000' "$CADDY"; then
  echo "Caddyfile already uses ecoleadbot:8000"
fi
docker exec n8n-caddy-1 wget -qO- http://ecoleadbot:8000/api/health || docker exec n8n-caddy-1 wget -qO- http://172.17.0.1:8000/api/health
docker restart n8n-caddy-1
sleep 4
curl -sk https://elb.ecolusspb.ru/api/health
'@

Write-Host "=== Fixing Caddy <-> ecoleadbot network ===" -ForegroundColor Cyan
$r = Invoke-SSHCommand -SSHSession $s -Command $fixCmd -TimeOut 120
if ($r.Output) { $r.Output | ForEach-Object { Write-Host $_ } }
if ($r.Error) { $r.Error | ForEach-Object { Write-Host $_ -ForegroundColor Yellow } }
Write-Host "Exit: $($r.ExitStatus)"
Remove-SSHSession -SSHSession $s | Out-Null
