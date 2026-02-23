# TASKS

## Backend
- [x] Создан FastAPI backend (`backend/app/main.py`).
- [x] Реализована токен-авторизация (`/api/auth/login`, Bearer token).
- [x] Добавлены role-based зависимости и ограничения доступа.
- [x] Реализованы student/teacher/admin endpoints из ТЗ.

## DB / SQLAlchemy
- [x] Реализованы модели: `User`, `Student`, `Teacher`, `Class`, `Subject`, `TeacherSubject`, `TeachingAssignment`, `Grade`, `Token`.
- [x] Поддержка SQLite по умолчанию + переключение через `DATABASE_URL`.
- [x] Подготовлена структура Alembic (`backend/alembic`, `backend/alembic.ini`).

## Seed
- [x] Добавлен `backend/seed.py` для заполнения тестовыми данными и пользователями.

## Frontend
- [x] Добавлена страница логина.
- [x] Реализованы role-based экраны для student / teacher / vice_principal/principal.
- [x] Добавлены запросы к API через `/api/...`.

## Nginx
- [x] Создан `frontend/nginx.conf`.
- [x] Настроен `root` на статику.
- [x] Настроен proxy `/api/` -> `http://127.0.0.1:8000/`.

## Docs
- [x] Обновлен `README.md` с инструкциями для Windows/Linux.
- [x] Добавлены `backend/requirements.txt` и `backend/.env.example`.
