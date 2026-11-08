"""Small, persistent sync diagnostics shared by the phone and PC views."""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel, Field


DATABASE = Path(__file__).resolve().parent / 'data' / 'sync_diagnostics.sqlite3'
router = APIRouter(prefix='/api/sync/diagnostics')


class PendingEntry(BaseModel):
    operation_id: UUID
    entity_id: UUID
    product_id: UUID | None = None
    kind: str = Field(min_length=1, max_length=60)
    title: str = Field(max_length=255)
    state: Literal['error', 'waiting', 'blocked', 'ready']
    error: str | None = Field(default=None, max_length=1000)
    error_status: int | None = Field(default=None, ge=400, le=599)
    blocked_by: list[UUID] = Field(default_factory=list, max_length=100)
    values: dict[str, str] = Field(default_factory=dict, max_length=3)


class PendingReport(BaseModel):
    device_id: UUID
    entries: list[PendingEntry] = Field(max_length=200)


@contextmanager
def connection():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATABASE, timeout=10)
    db.row_factory = sqlite3.Row
    try:
        db.execute('''CREATE TABLE IF NOT EXISTS failures (
            operation_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, product_id TEXT,
            kind TEXT NOT NULL, status INTEGER NOT NULL, detail TEXT NOT NULL,
            attempts INTEGER NOT NULL, last_seen TEXT NOT NULL)''')
        db.execute('''CREATE TABLE IF NOT EXISTS phone_pending (
            device_id TEXT NOT NULL, operation_id TEXT NOT NULL, entity_id TEXT NOT NULL,
            product_id TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, state TEXT NOT NULL,
            error TEXT, error_status INTEGER, blocked_by TEXT NOT NULL, values_json TEXT NOT NULL DEFAULT '{}',
            last_seen TEXT NOT NULL, PRIMARY KEY (device_id, operation_id))''')
        columns={row['name'] for row in db.execute('PRAGMA table_info(phone_pending)')}
        if 'values_json' not in columns:
            db.execute("ALTER TABLE phone_pending ADD COLUMN values_json TEXT NOT NULL DEFAULT '{}'")
        with db:
            yield db
    finally:
        db.close()


def record_failure(operation, status, detail):
    payload = operation.payload
    product_id = payload.get('product_id')
    if operation.kind == 'product':
        product_id = operation.entity_id
    now = datetime.now(timezone.utc).isoformat()
    with connection() as db:
        db.execute('''INSERT INTO failures
            (operation_id, entity_id, product_id, kind, status, detail, attempts, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            ON CONFLICT(operation_id) DO UPDATE SET status=excluded.status,
            detail=excluded.detail, attempts=attempts+1, last_seen=excluded.last_seen''',
            (str(operation.operation_id), str(operation.entity_id), str(product_id) if product_id else None,
             operation.kind, status, str(detail)[:1000], now))


def clear_failure(operation_id):
    with connection() as db:
        db.execute('DELETE FROM failures WHERE operation_id=?', (str(operation_id),))


@router.post('')
def save_pending(report: PendingReport):
    now = datetime.now(timezone.utc).isoformat()
    device_id = str(report.device_id)
    with connection() as db:
        db.execute('DELETE FROM phone_pending WHERE device_id=?', (device_id,))
        db.executemany('''INSERT INTO phone_pending
            (device_id, operation_id, entity_id, product_id, kind, title, state,
             error, error_status, blocked_by, values_json, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', [
            (device_id, str(item.operation_id), str(item.entity_id),
             str(item.product_id) if item.product_id else None, item.kind, item.title,
             item.state, item.error, item.error_status,
             json.dumps([str(value) for value in item.blocked_by]), json.dumps(item.values), now)
            for item in report.entries
        ])
    return {'received': len(report.entries)}


@router.get('')
def snapshot():
    with connection() as db:
        pending = [dict(row) for row in db.execute('SELECT * FROM phone_pending ORDER BY last_seen DESC, device_id, operation_id')]
        failures = [dict(row) for row in db.execute('SELECT * FROM failures ORDER BY last_seen DESC LIMIT 100')]
    for item in pending:
        item['blocked_by'] = json.loads(item['blocked_by'])
        item['values'] = json.loads(item.pop('values_json'))
    return {'pending': pending, 'failures': failures}
