# ER-диаграмма базы данных проекта NIRS

Ниже — текстовое описание сущностей и связей в БД, чтобы по нему можно было вручную нарисовать ER-диаграмму.

## 1) Сущности (таблицы)

### `users`
**Назначение:** учетные записи для аутентификации и авторизации.

**Поля:**
- `id` (PK)
- `username` (UNIQUE, NOT NULL)
- `password_hash` (NOT NULL)
- `user_role` (enum: `student`, `teacher`, `vice_principal`, `principal`; NOT NULL)

---

### `tokens`
**Назначение:** хранение токенов сессий/доступа.

**Поля:**
- `id` (PK)
- `user_id` (FK → `users.id`, NOT NULL)
- `token` (UNIQUE, NOT NULL)
- `expires_at` (NOT NULL)
- `created_at` (NOT NULL)

---

### `classes`
**Назначение:** школьные классы (например, 7А, 11Б).

**Поля:**
- `id` (PK)
- `grade_level` (NOT NULL)
- `letter` (NOT NULL)
- `display_name` (UNIQUE, NOT NULL)

**Ограничения:**
- UNIQUE (`grade_level`, `letter`) — уникальность комбинации «параллель + буква».

---

### `students`
**Назначение:** профиль ученика.

**Поля:**
- `id` (PK)
- `user_id` (FK → `users.id`, UNIQUE, NOT NULL)
- `first_name` (NOT NULL)
- `last_name` (NOT NULL)
- `class_id` (FK → `classes.id`, NOT NULL)

---

### `teachers`
**Назначение:** профиль учителя.

**Поля:**
- `id` (PK)
- `user_id` (FK → `users.id`, UNIQUE, NOT NULL)
- `first_name` (NOT NULL)
- `last_name` (NOT NULL)

---

### `subjects`
**Назначение:** справочник предметов.

**Поля:**
- `id` (PK)
- `name` (UNIQUE, NOT NULL)

---

### `teacher_subjects`
**Назначение:** M:N-связь «учитель ↔ предмет» (какие предметы может вести учитель).

**Поля:**
- `id` (PK)
- `teacher_id` (FK → `teachers.id`, NOT NULL)
- `subject_id` (FK → `subjects.id`, NOT NULL)

**Ограничения:**
- UNIQUE (`teacher_id`, `subject_id`) — одна и та же пара не дублируется.

---

### `teaching_assignments`
**Назначение:** назначение «какой учитель ведет какой предмет в каком классе».

**Поля:**
- `id` (PK)
- `teacher_id` (FK → `teachers.id`, NOT NULL)
- `class_id` (FK → `classes.id`, NOT NULL)
- `subject_id` (FK → `subjects.id`, NOT NULL)

**Ограничения:**
- UNIQUE (`teacher_id`, `class_id`, `subject_id`) — уникальная тройка назначения.

---

### `grades`
**Назначение:** оценки учеников.

**Поля:**
- `id` (PK)
- `student_id` (FK → `students.id`, NOT NULL)
- `class_id` (FK → `classes.id`, NOT NULL)
- `subject_id` (FK → `subjects.id`, NOT NULL)
- `teacher_id` (FK → `teachers.id`, NOT NULL)
- `value` (NOT NULL)
- `date` (NOT NULL)
- `comment` (NULL)
- `created_at` (NOT NULL)

---

## 2) Связи и кардинальности

1. **`users` 1 — 0..1 `students`**  
   Один пользователь может иметь один профиль ученика (или не иметь).  
   `students.user_id` уникален.

2. **`users` 1 — 0..1 `teachers`**  
   Один пользователь может иметь один профиль учителя (или не иметь).  
   `teachers.user_id` уникален.

3. **`users` 1 — N `tokens`**  
   У одного пользователя может быть много токенов.

4. **`classes` 1 — N `students`**  
   В одном классе много учеников, каждый ученик принадлежит одному классу.

5. **`teachers` M — N `subjects` через `teacher_subjects`**  
   Один учитель может вести несколько предметов, и один предмет могут вести несколько учителей.

6. **Тройная связь назначений через `teaching_assignments`:**
   - `teachers` 1 — N `teaching_assignments`
   - `classes` 1 — N `teaching_assignments`
   - `subjects` 1 — N `teaching_assignments`

   Смысл: каждая запись фиксирует конкретное назначение «учитель + класс + предмет».

7. **`grades` как факт-таблица (журнал оценок):**
   - `students` 1 — N `grades`
   - `classes` 1 — N `grades`
   - `subjects` 1 — N `grades`
   - `teachers` 1 — N `grades`

   Каждая оценка относится к одному ученику, одному классу, одному предмету и одному учителю.

---

## 3) Рекомендации для визуального рисования ER

Чтобы схема читалась проще, можно расположить блоки так:

- **Центр домена:** `grades`
- **Справочники рядом:** `students`, `teachers`, `classes`, `subjects`
- **Авторизация отдельным блоком:** `users` и `tokens`
- **Связующие таблицы:** `teacher_subjects`, `teaching_assignments` между `teachers/classes/subjects`

Подпиши связи кардинальностями (`1`, `0..1`, `N`) и отдельно пометь уникальные ограничения:
- `users.username`
- `tokens.token`
- `classes.display_name`
- `subjects.name`
- `students.user_id`
- `teachers.user_id`
- `classes(grade_level, letter)`
- `teacher_subjects(teacher_id, subject_id)`
- `teaching_assignments(teacher_id, class_id, subject_id)`

---

## 4) Важная техническая деталь (удаление)

Во многих FK используется `ON DELETE CASCADE` (кроме случая специфичной БД Sybase, где каскад может быть отключен конфигурацией). Это влияет на поведение удаления и стоит отметить в ER-диаграмме как комментарий к внешним ключам.
