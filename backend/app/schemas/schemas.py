from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models import UserRole


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str


class MeResponse(BaseModel):
    user_id: int
    username: str
    role: UserRole


class StudentSubjectOut(BaseModel):
    subject_id: int
    subject_name: str


class GradeOut(BaseModel):
    id: int
    student_id: int
    class_id: int
    subject_id: int
    subject_name: str
    teacher_id: int
    teacher_name: str
    value: int
    date: date
    comment: str | None
    created_at: datetime


class TeacherClassOut(BaseModel):
    class_id: int
    display_name: str
    subject_id: int
    subject_name: str


class StudentOut(BaseModel):
    id: int
    first_name: str
    last_name: str
    class_id: int


class CreateGradeIn(BaseModel):
    student_id: int
    class_id: int
    subject_id: int
    value: int = Field(ge=1, le=12)
    date: date
    comment: str | None = None


class TeacherOut(BaseModel):
    id: int
    first_name: str
    last_name: str
    user_id: int


class SubjectOut(BaseModel):
    id: int
    name: str


class ClassOut(BaseModel):
    id: int
    grade_level: int
    letter: str
    display_name: str
