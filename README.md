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

Можно переключить БД через `DATABASE_URL` на PostgreSQL/MySQL при необходимости.

## 6) Тестовые пользователи (seed)

Скрипт `backend/seed.py` создает:
- `student / student123` (роль `student`)
- `teacher / teacher123` (роль `teacher`)
- `admin / admin123` (роль `vice_principal`)

## 7) Основные API endpoints

- `POST /api/auth/login`
- `GET /api/me`
- Student:
  - `GET /api/student/subjects`
  - `GET /api/student/grades`
- Teacher:
  - `GET /api/teacher/classes`
  - `GET /api/teacher/classes/{class_id}/students`
  - `GET /api/teacher/classes/{class_id}/grades?subject_id=...`
  - `POST /api/teacher/grades`
- Admin (`vice_principal`, `principal`):
  - `GET /api/admin/students`
  - `GET /api/admin/teachers`
  - `GET /api/admin/subjects`
  - `GET /api/admin/classes`
  - `GET /api/admin/grades` (filters: `student_id`, `class_id`, `subject_id`, `teacher_id`, `date_from`, `date_to`)
