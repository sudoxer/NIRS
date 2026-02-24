# School Journal

Проект состоит из двух частей:
- `backend/` — FastAPI + SQLAlchemy + Alembic.
- `frontend/` — статический HTML/CSS/JS, который обслуживается nginx и работает с API по `/api/...`.

## 1) Backend: запуск (Linux)

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python seed.py
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

API docs: `http://127.0.0.1:8000/docs`

## 2) Backend: запуск (Windows PowerShell)

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python seed.py
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## 3) Nginx + Frontend (Linux)

1. Скопируйте статику в каталог, который указан в `frontend/nginx.conf`:

```bash
sudo mkdir -p /var/www/school-journal
sudo cp -r frontend/static/* /var/www/school-journal/
```

2. Подключите конфиг:

```bash
sudo cp frontend/nginx.conf /etc/nginx/conf.d/school-journal.conf
sudo nginx -t
sudo systemctl restart nginx
```

Frontend будет доступен на `http://127.0.0.1:8080`.

## 4) Nginx + Frontend (Windows)

1. Установите nginx для Windows.
2. Скопируйте `frontend/static/*` в папку `html` nginx (или измените `root` в конфиге).
3. Добавьте серверный блок из `frontend/nginx.conf` в `conf/nginx.conf` (или include отдельного файла).
4. Запустите nginx:

```powershell
start nginx
```

Проверка конфига:

```powershell
nginx -t
```

## 5) Переменные окружения

В `backend/.env`:

```env
DATABASE_URL=sqlite:///./school_journal.db
TOKEN_TTL_HOURS=24
```

Можно переключить БД через `DATABASE_URL` на PostgreSQL/MySQL/Sybase при необходимости.

Пример для Sybase через ODBC DSN:

```env
DATABASE_URL=sybase+pyodbc://sa:Pa55w0rd@MySybaseDSN
```

Для Sybase должны быть установлены `pyodbc` и `sqlalchemy-sybase` (уже добавлены в `backend/requirements.txt`) и настроен системный ODBC DSN (`MySybaseDSN`).

## 6) Тестовые пользователи и заглушки (seed)

Скрипт `backend/seed.py` пересоздает БД и генерирует тестовый набор:
- классы: все комбинации `0..11` и `A..G` (всего 84 класса);
- ученики: по 10-15 на каждый класс;
- учителя: 96 записей с привязками предметов и `TeachingAssignment` по классам;
- предметы: 10 базовых школьных предметов.

Также создаются фиксированные логины для быстрого входа:
- `student / student123` (роль `student`)
- `teacher / teacher123` (роль `teacher`)
- `admin / admin123` (роль `vice_principal`)

Дополнительно создаются массовые тестовые аккаунты:
- `teacher_000 ... teacher_093` (пароль `test12345`)
- `student_<класс>_<номер>` (пароль `test12345`)

## 7) Основные API endpoints

- `POST /api/auth/login`
- `GET /api/me`
- Student:
  - `GET /api/student/subjects`
  - `GET /api/student/grades`
- Teacher:
  - `GET /api/teacher/classes` (для admin доступен выбор через `?teacher_id=...`)
  - `GET /api/teacher/classes/{class_id}/students` (опционально `?teacher_id=...`)
  - `GET /api/teacher/classes/{class_id}/grades?subject_id=...` (опционально `&teacher_id=...`)
  - `POST /api/teacher/grades` (опционально `?teacher_id=...`)
- Admin (`vice_principal`, `principal`):
  - `GET /api/admin/students`
  - `GET /api/admin/teachers`
  - `GET /api/admin/subjects`
  - `GET /api/admin/classes`
  - `GET /api/admin/grades` (filters: `student_id`, `class_id`, `subject_id`, `teacher_id`, `date_from`, `date_to`)


## Важно: почему был `Not Found` при Sign in

Если frontend открыт на `:8080`, а в nginx стоит `proxy_pass http://127.0.0.1:8000/;` (со слешем в конце),
nginx может переписать URI и отправить `/auth/login` вместо `/api/auth/login`.
В этом проекте backend ожидает путь именно с префиксом `/api/...`, поэтому в `frontend/nginx.conf` используется:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8000;
}
```

Тогда запрос с frontend на `/api/auth/login` (порт 8080) корректно проксируется на backend (порт 8000)
и принимается FastAPI.

## Единый запуск (как одно приложение)

1. Запустите backend на `8000` (см. разделы выше).
2. Запустите nginx с `frontend/nginx.conf` на `8080`.
3. Открывайте только `http://127.0.0.1:8080` — это единая точка входа.
   - Статика и UI отдает nginx.
   - Любые `/api/...` nginx отправляет в backend `127.0.0.1:8000`.


## 8) UI

- Добавлены вкладки (Student / Teacher / Admin) для удобной навигации.
- Teacher Dashboard работает в формате табеля: строки — ученики, столбцы — даты.
- Для admin в Teacher Dashboard есть выбор учителя, чтобы управлять журналом конкретного преподавателя.
- Student Dashboard показывает табель: строки — даты, столбцы — предметы.
