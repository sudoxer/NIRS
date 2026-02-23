from datetime import date, datetime, timedelta

from fastapi import Depends, FastAPI, HTTPException, Query, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import generate_token, verify_password
from app.db import Base, engine, get_db
from app.dependencies import get_current_user, require_roles
from app.models import Class, Grade, Student, Subject, Teacher, TeachingAssignment, Token, User, UserRole
from app.schemas.schemas import (
    ClassOut,
    CreateGradeIn,
    GradeOut,
    LoginRequest,
    LoginResponse,
    MeResponse,
    StudentOut,
    StudentSubjectOut,
    SubjectOut,
    TeacherClassOut,
    TeacherOut,
)

app = FastAPI(title="School Journal API")


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)


def _resolve_teacher_for_dashboard(db: Session, current_user: User, teacher_id: int | None) -> Teacher:
    if current_user.role == UserRole.teacher:
        teacher = db.scalar(select(Teacher).where(Teacher.user_id == current_user.id))
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher profile not found")
        return teacher

    if current_user.role in (UserRole.vice_principal, UserRole.principal):
        if teacher_id is not None:
            teacher = db.get(Teacher, teacher_id)
            if not teacher:
                raise HTTPException(status_code=404, detail="Selected teacher not found")
            return teacher

        own_teacher = db.scalar(select(Teacher).where(Teacher.user_id == current_user.id))
        if own_teacher:
            return own_teacher

        first_teacher = db.scalar(select(Teacher).order_by(Teacher.id))
        if not first_teacher:
            raise HTTPException(status_code=404, detail="No teachers in system")
        return first_teacher

    raise HTTPException(status_code=403, detail="Insufficient permissions")


@app.post("/api/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token_value = generate_token()
    token_obj = Token(
        user_id=user.id,
        token=token_value,
        expires_at=datetime.utcnow() + timedelta(hours=settings.token_ttl_hours),
    )
    db.add(token_obj)
    db.commit()
    return LoginResponse(token=token_value)


@app.get("/api/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    first_name = None
    last_name = None

    if current_user.role == UserRole.student:
        student = db.scalar(select(Student).where(Student.user_id == current_user.id))
        if student:
            first_name = student.first_name
            last_name = student.last_name
    elif current_user.role in (UserRole.teacher, UserRole.vice_principal, UserRole.principal):
        teacher = db.scalar(select(Teacher).where(Teacher.user_id == current_user.id))
        if teacher:
            first_name = teacher.first_name
            last_name = teacher.last_name

    return MeResponse(
        user_id=current_user.id,
        username=current_user.username,
        role=current_user.role,
        first_name=first_name,
        last_name=last_name,
    )


@app.get("/api/student/subjects", response_model=list[StudentSubjectOut])
def student_subjects(current_user: User = Depends(require_roles(UserRole.student)), db: Session = Depends(get_db)):
    student = db.scalar(select(Student).where(Student.user_id == current_user.id))
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    stmt = (
        select(Subject.id, Subject.name)
        .join(TeachingAssignment, TeachingAssignment.subject_id == Subject.id)
        .where(TeachingAssignment.class_id == student.class_id)
        .distinct()
    )
    return [StudentSubjectOut(subject_id=sid, subject_name=name) for sid, name in db.execute(stmt).all()]


@app.get("/api/student/grades", response_model=list[GradeOut])
def student_grades(current_user: User = Depends(require_roles(UserRole.student)), db: Session = Depends(get_db)):
    student = db.scalar(select(Student).where(Student.user_id == current_user.id))
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")
    return _grade_query(db, filters=[Grade.student_id == student.id])


@app.get("/api/teacher/classes", response_model=list[TeacherClassOut])
def teacher_classes(
    teacher_id: int | None = Query(default=None),
    current_user: User = Depends(require_roles(UserRole.teacher, UserRole.vice_principal, UserRole.principal)),
    db: Session = Depends(get_db),
):
    teacher = _resolve_teacher_for_dashboard(db, current_user, teacher_id)

    stmt = (
        select(Class.id, Class.display_name, Subject.id, Subject.name)
        .join(TeachingAssignment, TeachingAssignment.class_id == Class.id)
        .join(Subject, Subject.id == TeachingAssignment.subject_id)
        .where(TeachingAssignment.teacher_id == teacher.id)
        .order_by(Class.display_name, Subject.name)
    )
    return [
        TeacherClassOut(class_id=class_id, display_name=display_name, subject_id=subject_id, subject_name=subject_name)
        for class_id, display_name, subject_id, subject_name in db.execute(stmt).all()
    ]


@app.get("/api/teacher/classes/{class_id}/students", response_model=list[StudentOut])
def teacher_class_students(
    class_id: int,
    teacher_id: int | None = Query(default=None),
    current_user: User = Depends(require_roles(UserRole.teacher, UserRole.vice_principal, UserRole.principal)),
    db: Session = Depends(get_db),
):
    teacher = _resolve_teacher_for_dashboard(db, current_user, teacher_id)

    assignment = db.scalar(
        select(TeachingAssignment).where(and_(TeachingAssignment.teacher_id == teacher.id, TeachingAssignment.class_id == class_id))
    )
    if not assignment and current_user.role == UserRole.teacher:
        raise HTTPException(status_code=403, detail="No access to this class")

    students = db.scalars(select(Student).where(Student.class_id == class_id).order_by(Student.last_name, Student.first_name)).all()
    return [StudentOut(id=s.id, first_name=s.first_name, last_name=s.last_name, class_id=s.class_id) for s in students]


@app.get("/api/teacher/classes/{class_id}/grades", response_model=list[GradeOut])
def teacher_class_grades(
    class_id: int,
    subject_id: int = Query(...),
    teacher_id: int | None = Query(default=None),
    current_user: User = Depends(require_roles(UserRole.teacher, UserRole.vice_principal, UserRole.principal)),
    db: Session = Depends(get_db),
):
    teacher = _resolve_teacher_for_dashboard(db, current_user, teacher_id)

    assignment = db.scalar(
        select(TeachingAssignment).where(
            and_(
                TeachingAssignment.teacher_id == teacher.id,
                TeachingAssignment.class_id == class_id,
                TeachingAssignment.subject_id == subject_id,
            )
        )
    )
    if not assignment and current_user.role == UserRole.teacher:
        raise HTTPException(status_code=403, detail="No access to this class and subject")

    filters = [Grade.class_id == class_id, Grade.subject_id == subject_id]
    if current_user.role == UserRole.teacher or teacher_id is not None:
        filters.append(Grade.teacher_id == teacher.id)
    return _grade_query(db, filters=filters)


@app.post("/api/teacher/grades", response_model=GradeOut)
def add_grade(
    payload: CreateGradeIn,
    teacher_id: int | None = Query(default=None),
    current_user: User = Depends(require_roles(UserRole.teacher, UserRole.vice_principal, UserRole.principal)),
    db: Session = Depends(get_db),
):
    teacher = _resolve_teacher_for_dashboard(db, current_user, teacher_id)

    assignment = db.scalar(
        select(TeachingAssignment).where(
            and_(
                TeachingAssignment.teacher_id == teacher.id,
                TeachingAssignment.class_id == payload.class_id,
                TeachingAssignment.subject_id == payload.subject_id,
            )
        )
    )
    if not assignment and current_user.role == UserRole.teacher:
        raise HTTPException(status_code=403, detail="No teaching assignment for this class and subject")

    student = db.get(Student, payload.student_id)
    if not student or student.class_id != payload.class_id:
        raise HTTPException(status_code=400, detail="Student does not belong to class")

    grade = Grade(
        student_id=payload.student_id,
        class_id=payload.class_id,
        subject_id=payload.subject_id,
        teacher_id=teacher.id,
        value=payload.value,
        date=payload.date,
        comment=payload.comment,
    )
    db.add(grade)
    db.commit()

    results = _grade_query(db, filters=[Grade.id == grade.id])
    return results[0]


@app.get("/api/admin/students", response_model=list[StudentOut])
def admin_students(current_user: User = Depends(require_roles(UserRole.vice_principal, UserRole.principal)), db: Session = Depends(get_db)):
    students = db.scalars(select(Student).order_by(Student.last_name, Student.first_name)).all()
    return [StudentOut(id=s.id, first_name=s.first_name, last_name=s.last_name, class_id=s.class_id) for s in students]


@app.get("/api/admin/teachers", response_model=list[TeacherOut])
def admin_teachers(current_user: User = Depends(require_roles(UserRole.vice_principal, UserRole.principal)), db: Session = Depends(get_db)):
    teachers = db.scalars(select(Teacher).order_by(Teacher.last_name, Teacher.first_name)).all()
    return [TeacherOut(id=t.id, first_name=t.first_name, last_name=t.last_name, user_id=t.user_id) for t in teachers]


@app.get("/api/admin/subjects", response_model=list[SubjectOut])
def admin_subjects(current_user: User = Depends(require_roles(UserRole.vice_principal, UserRole.principal)), db: Session = Depends(get_db)):
    subjects = db.scalars(select(Subject).order_by(Subject.name)).all()
    return [SubjectOut(id=s.id, name=s.name) for s in subjects]


@app.get("/api/admin/classes", response_model=list[ClassOut])
def admin_classes(current_user: User = Depends(require_roles(UserRole.vice_principal, UserRole.principal)), db: Session = Depends(get_db)):
    classes = db.scalars(select(Class).order_by(Class.grade_level, Class.letter)).all()
    return [ClassOut(id=c.id, grade_level=c.grade_level, letter=c.letter, display_name=c.display_name) for c in classes]


@app.get("/api/admin/grades", response_model=list[GradeOut])
def admin_grades(
    student_id: int | None = None,
    class_id: int | None = None,
    subject_id: int | None = None,
    teacher_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    current_user: User = Depends(require_roles(UserRole.vice_principal, UserRole.principal)),
    db: Session = Depends(get_db),
):
    filters = []
    if student_id:
        filters.append(Grade.student_id == student_id)
    if class_id:
        filters.append(Grade.class_id == class_id)
    if subject_id:
        filters.append(Grade.subject_id == subject_id)
    if teacher_id:
        filters.append(Grade.teacher_id == teacher_id)
    if date_from:
        filters.append(Grade.date >= date_from)
    if date_to:
        filters.append(Grade.date <= date_to)
    return _grade_query(db, filters=filters)


def _grade_query(db: Session, filters: list):
    stmt = (
        select(
            Grade.id,
            Grade.student_id,
            Grade.class_id,
            Grade.subject_id,
            Subject.name,
            Grade.teacher_id,
            Teacher.first_name,
            Teacher.last_name,
            Grade.value,
            Grade.date,
            Grade.comment,
            Grade.created_at,
        )
        .join(Subject, Subject.id == Grade.subject_id)
        .join(Teacher, Teacher.id == Grade.teacher_id)
        .order_by(Grade.date, Grade.student_id)
    )
    if filters:
        stmt = stmt.where(and_(*filters))

    rows = db.execute(stmt).all()
    return [
        GradeOut(
            id=row[0],
            student_id=row[1],
            class_id=row[2],
            subject_id=row[3],
            subject_name=row[4],
            teacher_id=row[5],
            teacher_name=f"{row[6]} {row[7]}",
            value=row[8],
            date=row[9],
            comment=row[10],
            created_at=row[11],
        )
        for row in rows
    ]
