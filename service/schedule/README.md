# Сервис записи расписания

Статус: код и тесты подготовлены. Внешний Worker пока не развёрнут; assets/schedule-service.json содержит пустой URL, поэтому клиент сохраняет прежний способ записи через токен. Сам факт успешной сборки не означает, что сервер доступен.

## Что делает сервис

POST /changes принимает `{code, kind, sha, event}`. kind — permanent или once; sha — SHA исходного журнала. Короткий код сравнивается со значением ADMIN_CODE. Это разрешённая владельцем простая проверка; код в клиенте известен и не является защищённой авторизацией.

Worker получает временный installation token GitHub App, ограниченный university-notes и Contents: write. Он читает базу и оба журнала на одном коммите main, проверяет событие общей проверкой расписания и создаёт коммит, меняющий ровно один журнал. Обновление main допускается только fast-forward: параллельный коммит вызывает 409, без перезаписи чужой работы. Старые события сохраняются; revoke — отдельное событие. Повтор той же операции с тем же ID не создаёт дубль. ID с другим содержимым вызывает конфликт.

Токены GitHub и ключ App не передаются клиенту. Ответ содержит подтверждённый коммит, SHA и актуальный журнал. Ошибка сети не считается успешным сохранением. D1, другая база, AI API и постоянные копии учебных материалов не нужны.

## Настройка аккаунтов один раз

1. В Cloudflare нужен аккаунт с включённым workers.dev. Для CI создать API token с разрешением редактирования Workers этого аккаунта и определить Account ID.
2. Зарегистрировать GitHub App, отключив ненужные webhooks, с Repository permissions → Contents: Read and write. Установить её только в GrayMans1on/university-notes. Записать App ID и Installation ID, скачать закрытый ключ.
3. Преобразовать ключ App в PKCS8 вне репозитория:

```sh
openssl pkcs8 -topk8 -nocrypt -in app-private.pem -out app-pkcs8.pem
```

4. В GitHub repository Actions secrets записать CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SCHEDULE_ADMIN_CODE (текущий код CSU2410), SCHEDULE_GITHUB_APP_ID, SCHEDULE_GITHUB_INSTALLATION_ID, SCHEDULE_GITHUB_APP_PRIVATE_KEY (содержимое app-pkcs8.pem). Закрытые ключи не добавлять в Git, клиентский JSON или APK.
5. Запустить Actions → Schedule service → Run workflow с deploy=true. На обычный push выполняются только тесты и сухая сборка; развёртывание автоматически не запускается. Workflow прекращается до deploy при отсутствии любого секрета.
6. Проверить реальный URL Worker и `/health`. ready означает наличие четырёх настроек, а не проверенную запись в GitHub. Для рабочего сохранения App должна действительно иметь доступ к репозиторию. Не создавать выдуманные изменения расписания ради проверки.
7. Только после настройки указать точный адрес `https://university-notes-schedule.<account>.workers.dev/changes` в assets/schedule-service.json и опубликовать его через Pages. До этого URL остаётся пустым. В Android для сервиса нужен APK 1.1.1; сайт работает без обновления APK. Сетевая политика Android соблюдается.

Локально без публикации:

```sh
npm ci
node --test worker.test.mjs
npm run check
```

Ручной deploy вместо Actions выполняется текущим Wrangler после входа владельца: `npm exec -- wrangler login`, `npm exec -- wrangler deploy`, затем `npm exec -- wrangler secret put ADMIN_CODE` и аналогично GITHUB_APP_ID, GITHUB_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY. Ключи вводятся в секреты, не в аргументы команд.

Официальная документация: [JWT GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app), [Git references](https://docs.github.com/en/rest/git/refs), [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
