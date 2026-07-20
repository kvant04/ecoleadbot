# EcoLeadBot — deploy from Windows to VPS via SSH
# Run from repo root:
#   powershell -ExecutionPolicy Bypass -File deploy/deploy.ps1
#   powershell -ExecutionPolicy Bypass -File deploy/deploy.ps1 -PromptPassword
#   powershell -ExecutionPolicy Bypass -File deploy/deploy.ps1 -FirstInstall -IncludeEnv
#
# Password (pick one):
#   ECOBOT_SSH_PASSWORD in deploy/deploy.config.env  (gitignored)
#   -PromptPassword  (interactive, not stored)
#   -SshPassword "..."  (avoid — visible in shell history)

param(
    [string]$SshHost = $env:ECOBOT_SSH_HOST,
    [string]$SshUser = $env:ECOBOT_SSH_USER,
    [int]$SshPort = $(if ($env:ECOBOT_SSH_PORT) { [int]$env:ECOBOT_SSH_PORT } else { 22 }),
    [string]$RemoteDir = $(if ($env:ECOBOT_REMOTE_DIR) { $env:ECOBOT_REMOTE_DIR } else { "/opt/ecoleadbot" }),
    [string]$SshPassword = $env:ECOBOT_SSH_PASSWORD,
    [switch]$PromptPassword,
    [switch]$FirstInstall,
    [switch]$IncludeEnv
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ConfigFile = Join-Path $Root "deploy\deploy.config.env"

if (Test-Path $ConfigFile) {
    Get-Content $ConfigFile | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
        $parts = $_ -split '=', 2
        if ($parts.Count -eq 2) {
            $name = $parts[0].Trim()
            $value = $parts[1].Trim()
            if (-not (Get-Item "Env:$name" -ErrorAction SilentlyContinue)) {
                Set-Item -Path "Env:$name" -Value $value
            }
        }
    }
    if (-not $SshHost) { $SshHost = $env:ECOBOT_SSH_HOST }
    if (-not $SshUser) { $SshUser = $env:ECOBOT_SSH_USER }
    if ($env:ECOBOT_SSH_PORT) { $SshPort = [int]$env:ECOBOT_SSH_PORT }
    if ($env:ECOBOT_REMOTE_DIR) { $RemoteDir = $env:ECOBOT_REMOTE_DIR }
    if (-not $SshPassword) { $SshPassword = $env:ECOBOT_SSH_PASSWORD }
}

if (-not $SshHost -or -not $SshUser) {
    Write-Host "Set ECOBOT_SSH_HOST and ECOBOT_SSH_USER in deploy/deploy.config.env" -ForegroundColor Yellow
    exit 1
}

if ($PromptPassword -and -not $SshPassword) {
    $secure = Read-Host "SSH password for ${SshUser}@${SshHost}" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $SshPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

$UsePasswordAuth = -not [string]::IsNullOrWhiteSpace($SshPassword)
$sshTarget = "${SshUser}@${SshHost}"
$sshArgs = @("-p", "$SshPort", "-o", "StrictHostKeyChecking=accept-new")
$scpArgs = @("-P", "$SshPort", "-o", "StrictHostKeyChecking=accept-new")

function Ensure-PoshSshModule {
    if (-not (Get-PackageProvider -Name NuGet -ErrorAction SilentlyContinue)) {
        Write-Host "Installing NuGet provider (one-time)..." -ForegroundColor DarkGray
        Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null
    }
    if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
        Write-Host "Installing Posh-SSH (one-time, for password auth)..." -ForegroundColor DarkGray
        $prevPolicy = Get-PSRepository -Name PSGallery -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty InstallationPolicy -ErrorAction SilentlyContinue
        if ($prevPolicy -eq "Untrusted") {
            Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
        }
        Install-Module -Name Posh-SSH -Scope CurrentUser -Force -AllowClobber -ErrorAction Stop
    }
    Import-Module Posh-SSH -ErrorAction Stop
}

function New-SshCredential {
    param([string]$User, [string]$PlainPassword)
    $secure = ConvertTo-SecureString $PlainPassword -AsPlainText -Force
    return New-Object System.Management.Automation.PSCredential($User, $secure)
}

function Invoke-EcoRemoteSsh {
    param([string]$Command)
    if ($UsePasswordAuth) {
        Ensure-PoshSshModule
        $cred = New-SshCredential -User $SshUser -PlainPassword $SshPassword
        $session = New-SSHSession -ComputerName $SshHost -Port $SshPort -Credential $cred -AcceptKey -ErrorAction Stop
        try {
            $result = Invoke-SSHCommand -SSHSession $session -Command $Command -TimeOut 900
            if ($result.Error -and $result.ExitStatus -ne 0) {
                if ($result.Output) { $result.Output | ForEach-Object { Write-Host $_ } }
                Write-Host $result.Error -ForegroundColor Red
            } elseif ($result.Output) {
                $result.Output | ForEach-Object { Write-Host $_ }
            }
            return [int]$result.ExitStatus
        } finally {
            Remove-SSHSession -SSHSession $session | Out-Null
        }
    }

    & ssh @sshArgs $sshTarget $Command
    return $LASTEXITCODE
}

function Invoke-EcoRemoteScp {
    param([string]$LocalPath, [string]$RemotePath)
    if ($UsePasswordAuth) {
        Ensure-PoshSshModule
        $cred = New-SshCredential -User $SshUser -PlainPassword $SshPassword
        $remoteDir = ($RemotePath -replace '/[^/]+$','')
        if (-not $remoteDir) { $remoteDir = "/tmp" }
        if (-not $remoteDir.EndsWith("/")) { $remoteDir += "/" }
        # Set-SCPItem загружает в каталог; имя файла берётся с локальной машины.
        Set-SCPItem -ComputerName $SshHost -Port $SshPort -Credential $cred -Path $LocalPath -Destination $remoteDir -AcceptKey -ErrorAction Stop
        $localName = Split-Path -Leaf $LocalPath
        $remoteName = Split-Path -Leaf $RemotePath
        if ($localName -ne $remoteName) {
            $renameExit = Invoke-EcoRemoteSsh -Command ("mv '" + $remoteDir + $localName + "' '" + $RemotePath + "'")
            if ($renameExit -ne 0) { throw "scp rename on server failed" }
        }
        return 0
    }

    & scp @scpArgs $LocalPath ("${sshTarget}:${RemotePath}")
    return $LASTEXITCODE
}

Write-Host "=== EcoLeadBot deploy -> ${sshTarget}:${RemoteDir} ===" -ForegroundColor Cyan
if ($UsePasswordAuth) {
    Write-Host "Auth: password (Posh-SSH)" -ForegroundColor DarkGray
} else {
    Write-Host "Auth: OpenSSH key or interactive password prompt" -ForegroundColor DarkGray
}

# Rebuild app.js from widget/src before packaging.
$buildScript = Join-Path $Root "scripts\build_widget.py"
if (Test-Path $buildScript) {
    Write-Host "Building app.js from widget/src ..." -ForegroundColor DarkGray
    & py $buildScript
    if ($LASTEXITCODE -ne 0) { throw "scripts/build_widget.py failed" }
}

# Load project .env into process (for webhook secret injection only; .env is not uploaded unless -IncludeEnv).
$envLocal = Join-Path $Root ".env"
if (Test-Path $envLocal) {
    Get-Content $envLocal | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
        $parts = $_ -split '=', 2
        if ($parts.Count -eq 2) {
            $name = $parts[0].Trim()
            $value = $parts[1].Trim().Trim('"').Trim("'")
            if (-not (Get-Item "Env:$name" -ErrorAction SilentlyContinue)) {
                Set-Item -Path "Env:$name" -Value $value
            }
        }
    }
}

$staging = Join-Path $env:TEMP ("ecoleadbot_deploy_" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $staging | Out-Null

try {
    $includeItems = @(
        "app.js", "index.html", "styles.css",
        "server.py", "rag_service.py", "requirements.txt",
        "Dockerfile", "docker-compose.yml", ".dockerignore",
        "deploy", "data", "assets", "kb", "prompts"
    )

    foreach ($item in $includeItems) {
        $src = Join-Path $Root $item
        if (Test-Path $src) {
            Copy-Item -Path $src -Destination (Join-Path $staging $item) -Recurse -Force
        }
    }

    # Server-only site config with webhook secret (never committed).
    $webhookSecret = $env:ECOLEADBOT_WEBHOOK_SECRET
    $webhookUrl = $(if ($env:ECOLEADBOT_WEBHOOK_URL) { $env:ECOLEADBOT_WEBHOOK_URL } else { "https://n8n.ecolusspb.ru/webhook/ecoleadbot" })
    $elbConfig = @"
window.ECOLEADBOT_SITE_CONFIG = {
  webhookUrl: "$webhookUrl",
  webhookSecret: "$webhookSecret",
  ragApiUrl: ""
};
"@
    Set-Content -Path (Join-Path $staging "elb-config.js") -Value $elbConfig -Encoding UTF8
    if ($webhookSecret) {
        Write-Host "Included elb-config.js with webhookSecret (server only)" -ForegroundColor DarkGray
    } else {
        Write-Host "WARN: ECOLEADBOT_WEBHOOK_SECRET empty — n8n Header Auth may reject leads" -ForegroundColor Yellow
    }

    # Shell scripts must use LF on Linux VPS (Windows CRLF breaks bash).
    Get-ChildItem -Path (Join-Path $staging "deploy") -Filter "*.sh" -File -ErrorAction SilentlyContinue | ForEach-Object {
        $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
        $text = [System.Text.Encoding]::UTF8.GetString($bytes).Replace("`r`n", "`n").Replace("`r", "`n")
        [System.IO.File]::WriteAllBytes($_.FullName, [System.Text.Encoding]::UTF8.GetBytes($text))
    }

    if (Test-Path (Join-Path $Root ".env.example")) {
        Copy-Item (Join-Path $Root ".env.example") (Join-Path $staging ".env.example")
    }

    if ($IncludeEnv) {
        $envLocal = Join-Path $Root ".env"
        if (-not (Test-Path $envLocal)) {
            throw ".env not found in project root. Create it or run without -IncludeEnv"
        }
        Copy-Item $envLocal (Join-Path $staging ".env")
        Write-Host "Included .env in archive (stays on server only)" -ForegroundColor DarkGray
    }

    $archive = Join-Path $env:TEMP "ecoleadbot_deploy.tar.gz"
    if (Test-Path $archive) { Remove-Item -Force $archive }
    & tar -czf $archive -C $staging .

    if (-not (Test-Path $archive)) {
        throw "Failed to create archive (need tar on Windows 10+)"
    }

    Write-Host ("Archive: {0} MB" -f [math]::Round((Get-Item $archive).Length / 1MB, 2))

    $mkdirExit = Invoke-EcoRemoteSsh -Command ("mkdir -p " + $RemoteDir)
    if ($mkdirExit -ne 0) { throw "ssh mkdir failed" }

    $scpExit = Invoke-EcoRemoteScp -LocalPath $archive -RemotePath "/tmp/ecoleadbot_deploy.tar.gz"
    if ($scpExit -ne 0) { throw "scp failed (check password / network)" }

    if ($FirstInstall) {
        $remoteCmd = "set -e; mkdir -p '$RemoteDir'; cd '$RemoteDir'; tar -xzf /tmp/ecoleadbot_deploy.tar.gz; rm -f /tmp/ecoleadbot_deploy.tar.gz; chmod +x deploy/vps_install.sh deploy/vps_update.sh 2>/dev/null || true; if [ ! -f .env ]; then cp .env.example .env; echo 'NO_ENV'; exit 2; fi; bash deploy/vps_install.sh"
    } else {
        $remoteCmd = "set -e; mkdir -p '$RemoteDir'; cd '$RemoteDir'; tar -xzf /tmp/ecoleadbot_deploy.tar.gz; rm -f /tmp/ecoleadbot_deploy.tar.gz; chmod +x deploy/vps_install.sh deploy/vps_update.sh 2>/dev/null || true; if [ ! -f .env ]; then echo 'NO_ENV'; exit 2; fi; bash deploy/vps_update.sh"
    }

    $exitCode = Invoke-EcoRemoteSsh -Command $remoteCmd

    if ($exitCode -eq 2) {
        Write-Host ""
        Write-Host "Code uploaded but .env missing on server." -ForegroundColor Yellow
        Write-Host "Run again with -IncludeEnv OR create .env on server: nano $RemoteDir/.env"
        exit 2
    }

    if ($exitCode -ne 0) {
        throw ("Remote script failed with exit code " + $exitCode)
    }

    Write-Host ""
    Write-Host "=== Deploy OK ===" -ForegroundColor Green
    Write-Host ("Check: curl http://{0}:8000/api/health" -f $SshHost)
    Write-Host ("Check: curl https://{0}/api/health" -f $(if ($env:ECOBOT_DOMAIN) { $env:ECOBOT_DOMAIN } else { "elb.ecolusspb.ru" }))
}
finally {
    if (Test-Path $staging) { Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue }
    $SshPassword = $null
}
