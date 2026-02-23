import random
from datetime import date

from app.core.security import hash_password
from app.db import Base, SessionLocal, engine
from app.models import Class, Grade, Student, Subject, Teacher, TeacherSubject, TeachingAssignment, User, UserRole

LETTERS = ["A", "B", "C", "D", "E", "F", "G"]
SUBJECT_NAMES = [
    "Mathematics",
    "Russian Language",
    "Literature",
    "Physics",
    "Chemistry",
    "Biology",
    "History",
    "Geography",
    "English",
    "Computer Science",
]
FIRST_NAMES = [
    "Ivan", "Anna", "Petr", "Maria", "Dmitry", "Olga", "Sergey", "Elena", "Nikolay", "Svetlana",
    "Maksim", "Ekaterina", "Alexey", "Natalia", "Andrey", "Irina", "Vladimir", "Tatiana", "Kirill", "Yulia",
]
LAST_NAMES = [
    "Ivanov", "Petrov", "Sidorov", "Smirnov", "Kuznetsov", "Popov", "Vasiliev", "Sokolov", "Mikhailov", "Fedorov",
    "Morozov", "Volkov", "Lebedev", "Semenov", "Egorov", "Pavlov", "Karpov", "Nikolaev", "Orlov", "Belov",
]


PASSWORD_HASH_CACHE: dict[str, str] = {}


def get_password_hash(password: str) -> str:
    hashed = PASSWORD_HASH_CACHE.get(password)
    if hashed is None:
        hashed = hash_password(password)
        PASSWORD_HASH_CACHE[password] = hashed
    return hashed


def add_user(db, username: str, password: str, role: UserRole) -> User:
    user = User(username=username, password_hash=get_password_hash(password), role=role)
    db.add(user)
    db.flush()
    return user


def pick_name(rng: random.Random, index: int) -> tuple[str, str]:
    first = FIRST_NAMES[(index + rng.randint(0, 1000)) % len(FIRST_NAMES)]
    last = LAST_NAMES[(index * 3 + rng.randint(0, 1000)) % len(LAST_NAMES)]
    return first, last


def main() -> None:
    rng = random.Random(42)

    # Deterministic test fixture seed.
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # Classes 0-11 A-G
        classes: list[Class] = []
        for grade_level in range(12):
            for letter in LETTERS:
                class_obj = Class(grade_level=grade_level, letter=letter, display_name=f"{grade_level}{letter}")
                db.add(class_obj)
                classes.append(class_obj)
        db.flush()

        # Subjects
        subjects = [Subject(name=name) for name in SUBJECT_NAMES]
        db.add_all(subjects)
        db.flush()

        # Required demo users
        demo_student_user = add_user(db, "student", "student123", UserRole.student)
        demo_teacher_user = add_user(db, "teacher", "teacher123", UserRole.teacher)
        demo_admin_user = add_user(db, "admin", "admin123", UserRole.vice_principal)

        demo_teacher = Teacher(user_id=demo_teacher_user.id, first_name="Anna", last_name="Sidorova")
        admin_teacher = Teacher(user_id=demo_admin_user.id, first_name="Olga", last_name="Smirnova")
        db.add_all([demo_teacher, admin_teacher])
        db.flush()

        # Additional teachers (enough for full-school coverage)
        teacher_target = 96
        teachers: list[Teacher] = [demo_teacher, admin_teacher]
        for i in range(teacher_target - len(teachers)):
            fn, ln = pick_name(rng, i)
            user = add_user(db, f"teacher_{i:03d}", "test12345", UserRole.teacher)
            teacher = Teacher(user_id=user.id, first_name=fn, last_name=ln)
            db.add(teacher)
            teachers.append(teacher)
        db.flush()

        # Teacher -> subjects mapping (2-4 each)
        teacher_subject_rows: list[TeacherSubject] = []
        seen_ts: set[tuple[int, int]] = set()
        for idx, teacher in enumerate(teachers):
            subject_count = 2 + (idx % 3)
            for offset in range(subject_count):
                subject = subjects[(idx + offset) % len(subjects)]
                key = (teacher.id, subject.id)
                if key not in seen_ts:
                    seen_ts.add(key)
                    teacher_subject_rows.append(TeacherSubject(teacher_id=teacher.id, subject_id=subject.id))

        # Cover every class-subject by a teaching assignment
        assignment_rows: list[TeachingAssignment] = []
        for class_idx, class_obj in enumerate(classes):
            for subject_idx, subject in enumerate(subjects):
                teacher = teachers[(class_idx * len(subjects) + subject_idx) % len(teachers)]
                key = (teacher.id, subject.id)
                if key not in seen_ts:
                    seen_ts.add(key)
                    teacher_subject_rows.append(TeacherSubject(teacher_id=teacher.id, subject_id=subject.id))
                assignment_rows.append(
                    TeachingAssignment(teacher_id=teacher.id, class_id=class_obj.id, subject_id=subject.id)
                )

        db.add_all(teacher_subject_rows)
        db.add_all(assignment_rows)
        db.flush()

        # 10-15 students per class
        student_total = 0
        for class_idx, class_obj in enumerate(classes):
            student_count = rng.randint(10, 15)
            for n in range(student_count):
                fn, ln = pick_name(rng, class_idx * 100 + n)
                user = add_user(db, f"student_{class_obj.grade_level}{class_obj.letter.lower()}_{n:02d}", "test12345", UserRole.student)
                db.add(Student(user_id=user.id, first_name=fn, last_name=ln, class_id=class_obj.id))
                student_total += 1

        # Demo student in 5A
        class_5a = next(c for c in classes if c.display_name == "5A")
        demo_student = Student(user_id=demo_student_user.id, first_name="Ivan", last_name="Petrov", class_id=class_5a.id)
        db.add(demo_student)
        db.flush()

        # One demo grade for quick sanity checks
        math = next(s for s in subjects if s.name == "Mathematics")
        db.add(
            Grade(
                student_id=demo_student.id,
                class_id=class_5a.id,
                subject_id=math.id,
                teacher_id=demo_teacher.id,
                value=10,
                date=date.today(),
                comment="Initial seed grade",
            )
        )

        db.commit()
        print(
            "Seed completed: "
            f"classes={len(classes)}, subjects={len(subjects)}, teachers={len(teachers)}, students={student_total + 1}. "
            "Demo users: student/student123, teacher/teacher123, admin/admin123"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
