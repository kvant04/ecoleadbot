# Деплой EcoLeadBot на ваш VPS (для новичка)

Цель: команда открывает **одну ссылку** — виджет работает, RAG отвечает на «Есть вопрос?» и «Подробнее».

Пример итоговой ссылки: `https://elb.ecolusspb.ru` или `http://123.45.67.89:8000` (временно, без HTTPS).

---

## Что понадобится

| Что | Зачем |
|-----|--------|
| VPS (Linux) | Ubuntu 22.04 / Debian 11+ — подойдёт |
| SSH-доступ | root или пользователь с sudo |
| Домен (желательно) | HTTPS и нормальная ссылка для команды |
| OpenAI API key | уже есть в `.env` |
| Vector Store ID | уже загружена KB |

---

## Шаг 1. Подключитесь к серверу

На своём компьютере (PowerShell):

```powershell
ssh root@ВАШ_IP_СЕРВЕРА
```

Введите пароль. Если первый раз — спросит «trust» — напишите `yes`.

---

## Шаг 2. Установите Git и склонируйте проект

На сервере:

```bash
apt update && apt install -y git
cd /opt
git clone https://github.com/kvant04/ecoleadbot.git
cd ecoleadbot
```

*(Если репозиторий приватный — используйте deploy key или загрузите архив через SFTP.)*

---

## Шаг 3. Создайте файл `.env`

```bash
cp .env.example .env
nano .env
```

Заполните минимум:

```
OPENAI_API_KEY=sk-...
OPENAI_VECTOR_STORE_ID=vs_...
OPENAI_MODEL=gpt-4.1-mini
```

Сохранить в nano: `Ctrl+O`, Enter, `Ctrl+X`.

> **Важно:** если OpenAI блокирует регион сервера — добавьте `HTTPS_PROXY=...` в `.env` (см. `.env.example`).

---

## Шаг 4. Запустите через Docker

```bash
chmod +x deploy/vps_install.sh
bash deploy/vps_install.sh
```

Проверка:

```bash
curl http://127.0.0.1:8000/api/health
```

Должно вернуть: `{"status":"ok"}`

---

## Шаг 5. Откройте порт для команды

### Вариант А — быстро (без домена)

На VPS откройте порт 8000 в файрволе:

```bash
ufw allow 8000/tcp
ufw enable
```

Ссылка для команды: **`http://ВАШ_IP:8000/`**

Минус: без HTTPS, некоторые браузеры могут ругаться.

### Вариант B — правильно (домен + HTTPS)

1. В DNS домена создайте A-запись: `elb.ecolusspb.ru` → IP сервера.
2. Установите nginx и certbot:

```bash
apt install -y nginx certbot python3-certbot-nginx
```

3. Создайте конфиг `/etc/nginx/sites-available/ecoleadbot`:

```nginx
server {
    listen 80;
    server_name elb.ecolusspb.ru;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

4. Включите сайт и получите SSL:

```bash
ln -s /etc/nginx/sites-available/ecoleadbot /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d elb.ecolusspb.ru
```

Ссылка для команды: **`https://elb.ecolusspb.ru/`**

---

## Шаг 6. Проверка RAG

1. Откройте ссылку в браузере.
2. Нажмите «Есть вопрос?» (или пройдите квиз до «Подробнее»).
3. Задайте вопрос, например: «Нужен ли паспорт отходов для офиса?»
4. Должен прийти ответ из базы знаний (не ошибка сети).

Если ошибка — на сервере смотрите логи:

```bash
cd /opt/ecoleadbot
docker compose logs -f
```

---

## Обновление после правок в коде

```bash
cd /opt/ecoleadbot
git pull
docker compose build
docker compose up -d
```

После правок KB на сервере **не обязательно** — Vector Store обновляется с вашего компьютера:

```bash
python scripts/upload_kb_to_openai_vector_store.py --force
```

---

## Деплой «я даю доступ — агент делает сам»

**Важно:** актуальный код на VPS обновляйте через **SSH** (`deploy/deploy.ps1`), не через устаревший `git pull`, если GitHub отстаёт.  
Статика SpaceWeb (`deploy/sweb/dist/`) — не source of truth; перед заливкой запускайте `deploy/pack_sweb_static.ps1` (см. `deploy/sweb/README.md`).

Деплой идёт **по SSH с вашего ПК** скриптом `deploy/deploy.ps1`.

### Что подготовить один раз

| # | Что | Кто |
|---|-----|-----|
| 1 | VPS (Ubuntu/Debian), Docker или право его поставить | вы |
| 2 | SSH: `host`, `user`, порт (22), **ключ** или пароль | вы |
| 3 | Файл `.env` на вашем ПК (OpenAI key + Vector Store ID) | вы кладёте на сервер сами |
| 4 | DNS A-запись `elb.ecolusspb.ru` → IP *(желательно)* | вы в панели домена |
| 5 | `deploy/deploy.config.env` — host/user/domain | агент или вы |

### Минимум доступов для агента (Cursor / терминал)

Пришлите **в чат или в `deploy/deploy.config.env`** (без секретов OpenAI):

```
ECOBOT_SSH_HOST=IP_или_хост
ECOBOT_SSH_USER=root
ECOBOT_SSH_PORT=22
ECOBOT_REMOTE_DIR=/opt/ecoleadbot
ECOBOT_DOMAIN=elb.ecolusspb.ru
```

**Пароль OpenAI и `.env` в чат не присылайте.**  
Один раз загрузите сами:

```powershell
scp -P 22 .env root@ВАШ_IP:/opt/ecoleadbot/.env
```

Для SSH без пароля в каждой сессии — добавьте **публичный ключ** агента/вашего ПК в `~/.ssh/authorized_keys` на VPS.

### Команды (агент выполнит сам)

**Первый деплой** (Docker + контейнер):

```powershell
cd "D:\ELB c ИИ RAG для выпускного проекта"
powershell -ExecutionPolicy Bypass -File deploy/deploy.ps1 -FirstInstall
```

**Обновление после правок** (как сейчас v1.5.6):

```powershell
powershell -ExecutionPolicy Bypass -File deploy/deploy.ps1
```

**HTTPS (nginx + certbot)** — после DNS:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/deploy.ps1 -SetupNginx
```

Проверка:

```powershell
curl http://ВАШ_IP:8000/api/health
curl https://elb.ecolusspb.ru/api/health
```

### Встраивание на ecolusspb.ru (шаг 2, после VPS)

Когда ссылка `https://elb.ecolusspb.ru/` работает, на основном сайте в шаблон:

```html
<script src="https://elb.ecolusspb.ru/app.js?v=15.0.6" defer></script>
```

*(или тот же хост, куда задеплоили)* — виджет сам создаёт кнопку и popup.

### Альтернатива: через GitHub

Если сделать `git push` всего v1.4 на `origin/main`, на VPS достаточно:

```bash
cd /opt/ecoleadbot && git pull && bash deploy/vps_update.sh
```

---

## Что нужно от вас, чтобы я помог довести до рабочей ссылки

Пришлите в чат (можно частично замазать):

1. **IP VPS** и **ОС** (Ubuntu/Debian?)
2. **Есть ли домен** для поддомена (например `elb.ecolusspb.ru`)?
3. **SSH:** логин (root/ubuntu) — пароль или ключ лучше **не** в чат; можно создать временного пользователя.
4. Подтверждение, что **`.env` с ключами OpenAI** вы положите на сервер сами (безопаснее).

После этого можно пройти установку по шагам вместе или вы выполните шаги 1–6 и пришлёте вывод `curl .../api/health` — проверим.

---

## Файлы проекта для v1.4

| Файл | Назначение |
|------|------------|
| `data/services_catalog_v1.4.json` | 32 услуги, вопросы, related |
| `data/mini_assessment_zones_v1.4.json` | объект → зоны мини-оценки |
| `docker-compose.yml` | запуск на VPS |
| `deploy/vps_install.sh` | скрипт установки |
