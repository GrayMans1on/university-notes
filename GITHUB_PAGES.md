# Публикация университетских конспектов

Сайт: https://graymans1on.github.io/university-notes/

Исходные конспекты и данные находятся в `content/`, оформление и карта — в `assets/`, сборка и проверки — в `scripts/`.

GitHub Actions автоматически собирает и публикует изменения ветки `main`. В Settings → Pages источником должен быть GitHub Actions.

Локальная проверка из корня репозитория:

```sh
npm ci
node scripts/build-notes.mjs
python3 scripts/validate-site.py
python3 scripts/export-pages.py
```

`dist/` содержит обычную сборку. `pages-output/` содержит версию с путями `/university-notes/` для GitHub Pages. Обе папки создаются автоматически и не хранятся в репозитории. Выгрузки Markdown также ссылаются на новый адрес.

Методы оформления и проверки конспектов описаны в MAINTENANCE.md. Для этого репозитория публикация через GitHub Actions заменяет описанный там выпуск через Sites. Прежний сайт оставлен доступным отдельно.
