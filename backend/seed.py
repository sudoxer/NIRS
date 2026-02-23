from datetime import date

from sqlalchemy import select

from app.core.security import hash_password
from app.db import Base, SessionLocal, engine
from app.models import Class, Grade, Student, Subject, Teacher, TeacherSubject, TeachingAssignment, User, UserRole


def create_user(db, username: str, password: str, role: UserRole) -> User:
    existing = db.scalar(select(User).where(User.username == username))
    if existing:
        return existing
    user = User(username=username, password_hash=hash_password(password), role=role)
    db.add(user)
    db.flush()
    return user


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        class_5a = db.scalar(select(Class).where(Class.display_name == "5A"))
        if not class_5a:
            class_5a = Class(grade_level=5, letter="A", display_name="5A")
            db.add(class_5a)
            db.flush()

        math = db.scalar(select(Subject).where(Subject.name == "Mathematics"))
        if not math:
            math = Subject(name="Mathematics")
            db.add(math)
            db.flush()

        student_user = create_user(db, "student", "student123", UserRole.student)
        teacher_user = create_user(db, "teacher", "teacher123", UserRole.teacher)
        vp_user = create_user(db, "admin", "admin123", UserRole.vice_principal)

        student = db.scalar(select(Student).where(Student.user_id == student_user.id))
        if not student:
            student = Student(user_id=student_user.id, first_name="Ivan", last_name="Petrov", class_id=class_5a.id)
            db.add(student)
            db.flush()

        teacher = db.scalar(select(Teacher).where(Teacher.user_id == teacher_user.id))
        if not teacher:
            teacher = Teacher(user_id=teacher_user.id, first_name="Anna", last_name="Sidorova")
            db.add(teacher)
            db.flush()

        vp_teacher = db.scalar(select(Teacher).where(Teacher.user_id == vp_user.id))
        if not vp_teacher:
            vp_teacher = Teacher(user_id=vp_user.id, first_name="Olga", last_name="Smirnova")
            db.add(vp_teacher)
            db.flush()

        teacher_subject = db.scalar(
            select(TeacherSubject).where(TeacherSubject.teacher_id == teacher.id, TeacherSubject.subject_id == math.id)
        )
        if not teacher_subject:
            db.add(TeacherSubject(teacher_id=teacher.id, subject_id=math.id))

        assignment = db.scalar(
            select(TeachingAssignment).where(
                TeachingAssignment.teacher_id == teacher.id,
                TeachingAssignment.class_id == class_5a.id,
                TeachingAssignment.subject_id == math.id,
            )
        )
        if not assignment:
            db.add(TeachingAssignment(teacher_id=teacher.id, class_id=class_5a.id, subject_id=math.id))

        grade = db.scalar(select(Grade).where(Grade.student_id == student.id, Grade.subject_id == math.id))
        if not grade:
            db.add(
                Grade(
                    student_id=student.id,
                    class_id=class_5a.id,
                    subject_id=math.id,
                    teacher_id=teacher.id,
                    value=10,
                    date=date.today(),
                    comment="Initial seed grade",
                )
            )

        db.commit()
        print("Seed completed. Users: student/student123, teacher/teacher123, admin/admin123")
    finally:
        db.close()


if __name__ == "__main__":
    main()
