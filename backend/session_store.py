import json
import sqlite3
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "sessions.db"

SessionMode = Literal["Simulator", "Manual", "Replay"]


class SessionCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    session_name: str = Field(min_length=1, max_length=80)
    mode: SessionMode
    scenario: str = Field(min_length=1, max_length=500)
    customer_message: str = Field(default="", max_length=5000)

    persona: str = Field(default="Frustrated customer", min_length=1, max_length=100)
    difficulty: Literal["Easy", "Medium", "Hard"] = "Medium"
    conversation_history: list[dict[str, str]] = Field(default_factory=list)
    retrieved_chunks: list[dict] = Field(default_factory=list)


class SessionUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    session_name: str | None = Field(default=None, min_length=1, max_length=80)
    mode: SessionMode | None = None
    scenario: str | None = Field(default=None, min_length=1, max_length=500)
    customer_message: str | None = Field(default=None, max_length=5000)

    persona: str | None = Field(default=None, min_length=1, max_length=100)
    difficulty: Literal["Easy", "Medium", "Hard"] | None = None
    conversation_history: list[dict[str, str]] | None = None
    retrieved_chunks: list[dict] | None = None
    last_answer: str | None = Field(default=None, max_length=12000)


def connect():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with connect() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                session_name TEXT NOT NULL,
                mode TEXT NOT NULL,
                scenario TEXT NOT NULL,
                customer_message TEXT NOT NULL DEFAULT '',
                last_answer TEXT NOT NULL DEFAULT '',
                retrieved_chunks TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        # Add new columns safely if the database already exists.
        existing_columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(sessions)"
            ).fetchall()
        }

        migrations = {
            "persona": (
                "ALTER TABLE sessions ADD COLUMN "
                "persona TEXT NOT NULL DEFAULT 'Frustrated customer'"
            ),
            "difficulty": (
                "ALTER TABLE sessions ADD COLUMN "
                "difficulty TEXT NOT NULL DEFAULT 'Medium'"
            ),
            "conversation_history": (
                "ALTER TABLE sessions ADD COLUMN "
                "conversation_history TEXT NOT NULL DEFAULT '[]'"
            ),
        }

        for column, statement in migrations.items():
            if column not in existing_columns:
                connection.execute(statement)


def serialize(row):
    if row is None:
        return None

    item = dict(row)

    for field in ("retrieved_chunks", "conversation_history"):
        if field in item:
            try:
                item[field] = json.loads(item[field] or "[]")
            except (json.JSONDecodeError, TypeError):
                item[field] = []

    return item


def create_session(data: SessionCreate):
    session_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()

    with connect() as connection:
        connection.execute(
            """
            INSERT INTO sessions (
                id, session_name, mode, scenario, customer_message,
                last_answer, retrieved_chunks, created_at, updated_at,
                persona, difficulty, conversation_history
            )
            VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                data.session_name,
                data.mode,
                data.scenario,
                data.customer_message,
                json.dumps(data.retrieved_chunks),
                now,
                now,
                data.persona,
                data.difficulty,
                json.dumps(data.conversation_history),
            ),
        )

        row = connection.execute(
            "SELECT * FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()

    return serialize(row)


def list_sessions():
    with connect() as connection:
        rows = connection.execute(
            "SELECT * FROM sessions ORDER BY updated_at DESC"
        ).fetchall()

    return [serialize(row) for row in rows]


def get_session(session_id: str):
    with connect() as connection:
        row = connection.execute(
            "SELECT * FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()

    return serialize(row)


def update_session(session_id: str, data: SessionUpdate):
    changes = data.model_dump(exclude_unset=True)

    if not changes:
        return get_session(session_id)

    json_fields = {"retrieved_chunks", "conversation_history"}

    for field in json_fields.intersection(changes):
        if changes[field] is not None:
            changes[field] = json.dumps(changes[field])

    changes["updated_at"] = datetime.now(timezone.utc).isoformat()

    allowed_columns = {
        "session_name",
        "mode",
        "scenario",
        "customer_message",
        "last_answer",
        "retrieved_chunks",
        "updated_at",
        "persona",
        "difficulty",
        "conversation_history",
    }

    if not set(changes).issubset(allowed_columns):
        raise ValueError("Invalid session fields.")

    assignments = ", ".join(
        f"{column} = ?" for column in changes
    )
    values = list(changes.values()) + [session_id]

    with connect() as connection:
        cursor = connection.execute(
            f"UPDATE sessions SET {assignments} WHERE id = ?",
            values,
        )

        if cursor.rowcount == 0:
            return None

        row = connection.execute(
            "SELECT * FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()

    return serialize(row)


initialize_database()