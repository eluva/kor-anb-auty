# Выкатка Korean Beauty в интернет

Пошаговая инструкция: от проверки на своём компьютере до работающего магазина.

| | **Vercel + Turso** (выбран) | **Render + Turso** | **VPS** |
|---|---|---|---|
| Цена | Бесплатно (Hobby) | Бесплатно | Около $5 в месяц |
| Правила | Hobby — только **некоммерческие** сайты. Магазин могут приостановить | Коммерция разрешена | Без ограничений |
| Засыпание | Нет | Через 15 минут без посетителей, нужен «будильник» | Нет |
| Сложность | Мышкой в браузере | Мышкой в браузере | Команды в терминале |
| Адрес | `….vercel.app` или свой домен | `….onrender.com` или свой домен | Нужен свой домен |

Код один и тот же для всех трёх путей. Начните с **Шага 0**, для Vercel и
Render затем пройдите **Шаги 1–3**.

---

## Шаг 0. Подготовка на своём компьютере

Команды выполняются в папке проекта, в терминале VS Code (PowerShell).

### 1. Проверьте готовность

```powershell
npm start            # в одном окне
npm run preflight    # в другом
```

Проверка скажет, что осталось сделать. Пункты с **✗** блокируют запуск.

### 2. Уберите демо-товары

В каталоге 40 товаров с выдуманными ценами — покупатели закажут то, чего нет.

```powershell
npm run demo:clear        # сначала посмотрите, что удалится
npm run demo:clear yes    # удалить
```

Удаляются **только** товары с картинками-заглушками. Ваши товары, заказы,
разделы, бренды, настройки и подключение Telegram остаются. Перед удалением
автоматически делается резервная копия.

> **Флаги пишите без дефисов:** `yes`, а не `-- --yes`. В PowerShell дефисы
> до команды не доходят, и она молча выполнится как предпросмотр.

### 3. Сверьте контакты

Админ-панель → **Настройки** → адрес и часы работы. Они заполнены примерными
значениями — впишите настоящие.

### 4. Сделайте резервную копию

```powershell
npm run backup
```

---

## Шаги 1–3. GitHub, Turso и перенос данных (для Vercel и Render)

> У этого магазина шаги 1–3 **уже выполнены**: код лежит в
> `github.com/eluva/kor-anb-auty`, данные перенесены в базу Turso
> `korean-beauty-eluva` (Токио).

### Шаг 1. Код на GitHub

1. Зарегистрируйтесь на **github.com**.
2. **New repository** → **Private** → **Create repository**.
   Не добавляйте README и .gitignore — они уже есть в проекте.
3. В папке проекта:

   ```powershell
   git remote add origin https://github.com/ВАШ-ЛОГИН/ИМЯ-РЕПОЗИТОРИЯ.git
   git push -u origin main
   ```

   При первом `git push` откроется окно входа в GitHub.

Данные покупателей (`data/`) и настройки (`.env`) в репозиторий не попадают —
это уже настроено в `.gitignore`.

### Шаг 2. База в Turso

1. Зарегистрируйтесь на **turso.tech** (удобно через GitHub).
2. **Create Database**, имя `korean-beauty`.
   Регион задаёт группа `default`. На бесплатном тарифе группа одна, и её регион
   не сменить. У этого магазина это Токио (`aws-ap-northeast-1`), и сервер
   поставлен рядом: на Vercel — `hnd1` в `vercel.json`, на Render — `singapore`
   в `render.yaml`. Если у вас другой регион, поменяйте их на ближайшие к базе.
3. На странице базы скопируйте **адрес** — вида
   `libsql://korean-beauty-ВАШ-ЛОГИН.aws-ap-northeast-1.turso.io`.
4. Создайте **токен** (Create Token): доступ **Read & Write**, срок **Never**.
   Скопируйте — он показывается один раз.

Адрес и токен — это ключ ко всем заказам. Не добавляйте их в код.

### Шаг 3. Перенос данных в Turso

**На своём компьютере.** Остановите магазин (Ctrl+C в окне `npm start`),
затем в PowerShell:

```powershell
$env:KB_DB_URL   = "libsql://korean-beauty-eluva.aws-ap-northeast-1.turso.io"
$env:KB_DB_TOKEN = "ваш-токен"

npm run db:push          # предпросмотр: что и куда перенесётся
npm run db:push yes      # перенос
npm run preflight        # проверка уже боевой базы
```

Перенос сверяет число записей в каждой таблице и пишет «Перенос завершён».
Пароль администратора остаётся прежним.

**После этого закройте окно терминала.** Переменные живут только в нём, и
`npm start` в этом окне работал бы уже с боевой базой.

С этого момента настоящая база магазина — Turso. Локальный `npm start` без
этих переменных открывает старую копию: товары, добавленные в ней, на сайт
не попадут. Добавляйте товары в админке на сайте.

---

## Путь А. Vercel + Turso

### Что важно знать заранее

- **Правила бесплатного тарифа.** Vercel Hobby разрешён только для
  некоммерческих сайтов, а продажа товаров прямо названа коммерческой.
  Vercel может приостановить магазин. Коммерция разрешена на тарифе Pro
  ($20 в месяц) — переключение без изменения кода.
- **Засыпания нет.** Сайт отвечает всегда. После долгого простоя первый запрос
  может занять на секунду-две больше.
- **Сервер — в Токио** (`hnd1` в `vercel.json`), рядом с базой.
- **Фото** грузятся по одному, до 4 МБ каждое: у Vercel предел 4,5 МБ на запрос.
  Админка сама уменьшает снимки, обычные фото с телефона проходят.

### А1. Проект на Vercel

1. Зарегистрируйтесь на **vercel.com** через GitHub.
2. **Add New… → Project** → найдите репозиторий `kor-anb-auty` → **Import**.
   Если его нет в списке, нажмите «Adjust GitHub App Permissions» и дайте
   Vercel доступ к нему.
3. **Framework Preset** — Vercel сам определит **Express**. Остальные настройки
   сборки не трогайте.
4. Раскройте **Environment Variables** и добавьте две:

   | Имя | Значение |
   |---|---|
   | `KB_DB_URL` | `libsql://korean-beauty-eluva.aws-ap-northeast-1.turso.io` |
   | `KB_DB_TOKEN` | токен базы из Turso |

5. **Deploy**. Сборка занимает около минуты.

### А2. Адрес сайта

1. Когда появится «Congratulations», откройте проект → вверху **Domains**:
   там адрес вида `kor-anb-auty.vercel.app`.
2. **Settings → Environment Variables** → добавьте `KB_PUBLIC_URL` со значением
   `https://ваш-адрес.vercel.app` (без слэша в конце).
3. **Deployments** → у последней выкатки меню **⋯** → **Redeploy**.
   Новые переменные применяются только к новой выкатке.

`KB_PUBLIC_URL` нужен для превью ссылок в Telegram и карты сайта.

### А3. Проверка

- `https://ваш-адрес.vercel.app/healthz` → `{"status":"ok",…}`.
- Главная открывается, товары на месте, вход в `/admin` — прежним паролем.

Если сайт отвечает «Магазин временно недоступен» — **Logs** проекта покажут
причину в строке `[init]`. Чаще всего это опечатка в адресе или токене базы:
исправьте в **Settings → Environment Variables** и сделайте **Redeploy**.

### А4. Свой домен (по желанию)

**Settings → Domains → Add** → впишите домен. Vercel покажет, какую запись
создать у регистратора, и сам выпустит HTTPS-сертификат. Затем поменяйте
`KB_PUBLIC_URL` на новый домен и сделайте **Redeploy**.

Переходите к разделу **«После запуска»**.

---

## Путь Б. Render + Turso

### Что важно знать заранее

- **Засыпание.** Бесплатный Render усыпляет сайт после 15 минут без посетителей,
  и первое открытие потом занимает около минуты. Это лечится «будильником» — шаг Б2.
- **Часы.** Render даёт 750 бесплатных часов в месяц на аккаунт — хватает ровно
  на **один** сайт круглосуточно. Второй бесплатный сервис в этом аккаунте
  не заводите: часы кончатся раньше конца месяца, и магазин отключится до 1-го числа.
- **Перезапуски.** Render может перезапустить бесплатный сервер в любой момент.
  Данные при этом не теряются: они в Turso.

### Б1. Сайт на Render

1. Зарегистрируйтесь на **render.com** через GitHub.
2. **New** → **Blueprint** → выберите репозиторий.
   Render прочитает `render.yaml`: бесплатный тариф, Сингапур, проверка здоровья.
3. Render попросит три значения: `KB_DB_URL` и `KB_DB_TOKEN` из шага 2,
   `KB_PUBLIC_URL` — `https://korean-beauty.onrender.com`.
4. **Apply**. Сборка занимает 2–3 минуты. В **Logs** должно появиться
   `База: Turso …` и `Прокси: cloudflare`.
5. Если Render дал другой адрес, исправьте `KB_PUBLIC_URL`:
   **Environment** → **Edit** → **Save Changes**.

### Б2. Будильник — чтобы сайт не засыпал

На **cron-job.org** (бесплатно) создайте задание: URL
`https://ваш-адрес.onrender.com/healthz`, **каждые 5 минут**, уведомление
на почту при сбоях.

### Б3. Свой домен (по желанию)

Render → сервис → **Settings** → **Custom Domains** → **Add**. Затем поменяйте
`KB_PUBLIC_URL` и адрес в будильнике на новый домен.

Переходите к разделу **«После запуска»**.

---

## Резервные копии (Vercel и Render)

Turso хранит данные надёжно, но от ошибочного удаления это не спасает.
Раз в неделю делайте копию к себе на компьютер:

```powershell
$env:KB_DB_URL   = "libsql://korean-beauty-eluva.aws-ap-northeast-1.turso.io"
$env:KB_DB_TOKEN = "ваш-токен"
npm run backup
```

Копия боевой базы ляжет в `data/backups/`. После этого закройте окно.

---

## Путь В. VPS на Ubuntu

Для VPS база Turso не нужна: данные хранятся на диске сервера.

Команды копируйте по одной. Там, где написано `ВАШ-ДОМЕН`, подставьте свой,
например `koreanbeauty.uz`.

**Какой сервер:** Ubuntu 24.04, 1 ГБ памяти, 1 ядро — с большим запасом.
Подойдёт любой провайдер: Hetzner, DigitalOcean, Timeweb и узбекские хостинги
с VPS на Ubuntu. **Домен:** зона `.uz` — у аккредитованных регистраторов
(список на cctld.uz), `.com` — у любого международного.

### В1. Направьте домен на сервер

В панели регистратора создайте две **A-записи** с IP-адресом сервера:

| Имя | Тип | Значение |
|---|---|---|
| `@` | A | IP сервера |
| `www` | A | IP сервера |

Записи расходятся от нескольких минут до пары часов. Пока ждёте — делайте
следующие шаги.

### В2. Подготовьте сервер

```bash
ssh root@IP-СЕРВЕРА
```

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs nginx certbot python3-certbot-nginx
node -v    # должно быть v22.x

useradd --system --create-home --home-dir /opt/korean-beauty --shell /usr/sbin/nologin kb
mkdir -p /var/lib/korean-beauty /var/backups/korean-beauty
chown kb:kb /var/lib/korean-beauty /var/backups/korean-beauty

ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

Магазин работает от отдельного пользователя `kb`, не от root. Файрвол
открывает только SSH и веб.

### В3. Загрузите код и данные

**На своём компьютере**, в папке проекта. Остановите магазин (Ctrl+C), затем:

```powershell
# Архивы кладём на уровень выше: в той же папке tar заархивирует сам себя
tar --exclude=node_modules --exclude=data --exclude=tools --exclude=.shots --exclude=.env --exclude=.git -czf ../kb-code.tar.gz .
tar -czf ../kb-data.tar.gz -C data shop.db
scp ../kb-code.tar.gz ../kb-data.tar.gz root@IP-СЕРВЕРА:/tmp/
```

**На сервере:**

```bash
tar -xzf /tmp/kb-code.tar.gz -C /opt/korean-beauty
tar -xzf /tmp/kb-data.tar.gz -C /var/lib/korean-beauty
chown -R kb:kb /opt/korean-beauty /var/lib/korean-beauty
cd /opt/korean-beauty && sudo -u kb npm ci --omit=dev
rm /tmp/kb-code.tar.gz /tmp/kb-data.tar.gz
```

### В4. Настройки

```bash
cp .env.example .env && nano .env
```

```ini
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
KB_PUBLIC_URL=https://ВАШ-ДОМЕН
KB_DATA_DIR=/var/lib/korean-beauty
KB_TRUST_PROXY=loopback
KB_BACKUP_DIR=/var/backups/korean-beauty
```

`KB_DB_URL` не указывайте — база будет файлом на диске сервера.
Сохранить в nano: **Ctrl+O**, Enter, выйти: **Ctrl+X**.

```bash
chown kb:kb .env && chmod 600 .env
```

### В5. Запустите магазин как службу

```bash
cp deploy/korean-beauty.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now korean-beauty
systemctl status korean-beauty      # должно быть active (running)
curl -s http://127.0.0.1:3000/healthz
```

Ответ `{"status":"ok",…}` — магазин работает. Служба поднимет его после
перезагрузки сервера и перезапустит при сбое.

### В6. nginx и HTTPS

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/korean-beauty
sed -i 's/koreanbeauty\.uz/ВАШ-ДОМЕН/g' /etc/nginx/sites-available/korean-beauty
ln -s /etc/nginx/sites-available/korean-beauty /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Когда домен уже указывает на сервер (`ping ВАШ-ДОМЕН` показывает IP сервера):

```bash
certbot --nginx --redirect -d ВАШ-ДОМЕН -d www.ВАШ-ДОМЕН
```

certbot спросит почту и сам настроит HTTPS. Сертификат продлевается автоматически.

### В7. Ежедневные резервные копии

```bash
cp deploy/korean-beauty-backup.service deploy/korean-beauty-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now korean-beauty-backup.timer
systemctl start korean-beauty-backup          # первая копия прямо сейчас
journalctl -u korean-beauty-backup -n 15      # итог
```

Копии делаются каждую ночь в 03:30, хранятся 14 последних. Копия на том же
сервере не спасёт, если откажет его диск, — раз в неделю скачивайте её к себе:

```powershell
scp root@IP-СЕРВЕРА:/var/backups/korean-beauty/shop-*.db ./
```

---

## После запуска: проверьте всё

Откройте магазин с **телефона через мобильный интернет**, не через Wi-Fi —
так вы увидите то же, что покупатели.

- [ ] Сайт открывается, в адресной строке замок.
- [ ] `/healthz` отвечает `{"status":"ok"}`.
- [ ] Вход в `/admin` работает с вашим паролем.
- [ ] **Тестовый заказ:** оформите заказ сами → уведомление пришло в Telegram →
      заказ виден в админке → удалите его.
- [ ] Загрузите фото товара в админке — оно появляется на сайте.
- [ ] **Превью:** отправьте себе в Telegram ссылку на главную и на товар.
      Должна появиться карточка с названием, ценой и картинкой. Устаревшее
      превью обновляет бот **@WebpageBot**.
- [ ] **Render:** через полчаса откройте сайт — он открывается сразу, без
      минутного ожидания. Значит, будильник работает.
- [ ] Адрес покупательниц определяется верно — см. ниже.
- [ ] Карту сайта `/sitemap.xml` отправьте в Яндекс.Вебмастер и Google Search Console.

### Проверка адресов покупательниц

Лимит «5 заказов за 10 минут» и защита входа считают по IP. Если сервер видит
вместо покупательниц адрес прокси, все они сливаются в одну — и лимит начинает
отклонять настоящие заказы.

1. Войдите в админку на сайте.
2. В той же вкладке откройте `https://ВАШ-САЙТ/api/admin/diagnostics/ip`.
3. Сравните `ip` с адресом, который показывает, например, **2ip.ru**.
   Совпадает, и `looksLikeProxy: false` — всё верно. Адрес с двоеточиями —
   это IPv6: сравнивайте с IPv6-адресом на том же сайте.
   На Vercel в поле `trustProxy` должно быть `vercel`, на Render — `cloudflare`.

Если не совпадает — пришлите ответ целиком разработчику.


---

## Обновление сайта

**Vercel и Render:** проверьте изменения у себя и загрузите их в GitHub:

```powershell
npm start
npm test
npm run test:browser
git add . ; git commit -m "что изменилось" ; git push
```

Платформа соберёт и выкатит новую версию сама. На Vercel неудачная сборка
не заменяет работающий сайт, а в **Deployments** любую прошлую версию можно
вернуть кнопкой **Promote** / **Instant Rollback**.

**VPS:**

```powershell
# у себя
tar --exclude=node_modules --exclude=data --exclude=tools --exclude=.shots --exclude=.env --exclude=.git -czf ../kb-code.tar.gz .
scp ../kb-code.tar.gz root@IP-СЕРВЕРА:/tmp/
```

```bash
# на сервере
systemctl start korean-beauty-backup          # копия перед обновлением
tar -xzf /tmp/kb-code.tar.gz -C /opt/korean-beauty
chown -R kb:kb /opt/korean-beauty
cd /opt/korean-beauty && sudo -u kb npm ci --omit=dev
systemctl restart korean-beauty
curl -s http://127.0.0.1:3000/healthz
```

`--exclude=.env` обязателен: иначе локальный `.env` затрёт серверный.

---

## Восстановление из резервной копии

**Vercel и Render (база Turso).** На своём компьютере, в PowerShell:

```powershell
$env:KB_DB_URL   = "libsql://…"
$env:KB_DB_TOKEN = "…"
npm run db:push yes replace from=data/backups/shop-ГГГГ-ММ-ДД_ЧЧ-ММ-СС.db
```

Перед заменой команда сама сделает копию текущего состояния боевой базы.
Сайт перевыкатывать не нужно.

**VPS:**

```bash
systemctl stop korean-beauty
cd /var/lib/korean-beauty
mv shop.db shop.db.broken                                      # на всякий случай
rm -f shop.db-wal shop.db-shm
cp /var/backups/korean-beauty/shop-ГГГГ-ММ-ДД_ЧЧ-ММ-СС.db shop.db
chown kb:kb shop.db
systemctl start korean-beauty
```

Фото хранятся в самой базе, отдельно их восстанавливать не нужно.

---

## Если что-то не работает

**Vercel: «Магазин временно недоступен».**
Проект → **Logs**, строка `[init]` — там причина. «не задан KB_DB_URL» — нет
переменной или она добавлена после выкатки (нужен **Redeploy**). «401» — не
подходит токен: создайте новый в Turso, замените в **Settings → Environment
Variables** и сделайте **Redeploy**.

**Vercel: проект приостановлен (paused).**
Vercel счёл сайт коммерческим — на Hobby это запрещено. Варианты: тариф Pro
($20 в месяц) или Путь Б (Render) — код и база те же, переезд занимает минут десять.

**Vercel: фото не загружается, «Фото слишком большое».**
Предел — 4 МБ на фото. Уменьшите снимок или сохраните его в JPG.

**Render: «Магазин не запустился» в логах.**
Строкой ниже написана причина. «не задан KB_DB_URL» — не указан адрес базы.
«401» — не подходит токен: создайте новый в Turso и замените в **Environment**.

**Render: сайт открывается около минуты.**
Сайт уснул — проверьте будильник на cron-job.org: включён ли он и какой ответ
получает (должен быть 200).

**Render: сайт отключён до конца месяца.**
Кончились бесплатные часы — в аккаунте работает ещё один бесплатный сервис.
Удалите лишний.

**Не могу войти в админку: «Слишком много попыток».**
Сработала защита от подбора пароля. Подождите пару минут.

**Забыл пароль администратора.**
Vercel или Render: у себя в PowerShell задайте `$env:KB_DB_URL` и `$env:KB_DB_TOKEN`
(как в шаге 3) и выполните `npm run password`.
VPS: `cd /opt/korean-beauty && sudo -u kb node --no-warnings server/password.js`.
Команда выведет новый пароль.

**Не приходят уведомления о заказах.**
Админ-панель → Настройки → Уведомления → «Отправить тест». Если ошибка —
отключите и подключите бота заново.

**VPS: сайт не открывается.**
`systemctl status korean-beauty` — работает ли магазин,
`journalctl -u korean-beauty -n 50` — последние ошибки,
`nginx -t` — нет ли ошибки в настройках nginx.

**VPS: certbot «Challenge failed».**
Домен ещё не указывает на сервер. Проверьте `ping ВАШ-ДОМЕН` и подождите.

**VPS: фото не загружаются, «413 Request Entity Too Large».**
В nginx не применился `client_max_body_size`. Проверьте, что включён файл
`/etc/nginx/sites-enabled/korean-beauty`, и выполните `systemctl reload nginx`.
