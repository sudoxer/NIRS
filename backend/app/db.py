from importlib.util import find_spec

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings


def _validate_database_dependencies(database_url: str) -> None:
    drivername = make_url(database_url).drivername
    if drivername == "sybase+pyodbc":
        missing_packages = []
        if find_spec("pyodbc") is None:
            missing_packages.append("pyodbc")
        if find_spec("sqlalchemy_sybase") is None:
            missing_packages.append("sqlalchemy-sybase")

        if missing_packages:
            raise RuntimeError(
                "DATABASE_URL uses 'sybase+pyodbc', but required packages are not installed: "
                f"{', '.join(missing_packages)}. "
                "Install dependencies from backend/requirements.txt and verify your ODBC DSN."
            )


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
_validate_database_dependencies(settings.database_url)
engine = create_engine(settings.database_url, future=True, echo=False, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
