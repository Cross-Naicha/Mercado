"""Availability belongs to a product/branch pair, independently of any map."""
import hashlib
import json
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from maps_api import connection

router=APIRouter(prefix='/api/availability')

class AvailabilityUpdate(BaseModel):
    operation_id: UUID
    branch_id: UUID
    product_ids: list[UUID]=Field(min_length=1,max_length=10000)
    status: Literal['unknown','available','unavailable']
    expected_revisions: dict[str,int]=Field(default_factory=dict)

def ensure_tables(db):
    db.execute('CREATE TABLE IF NOT EXISTS product_availability (branch_id TEXT NOT NULL, product_id TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL, confirmed_at TEXT, PRIMARY KEY(branch_id,product_id))')
    db.execute('CREATE TABLE IF NOT EXISTS availability_receipts (operation_id TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT NOT NULL)')

def snapshot():
    with connection() as db:
        ensure_tables(db)
        # One-time inference for existing assignments; explicit records always win.
        for mapped in db.execute('SELECT branch_id,payload FROM grid_maps').fetchall():
            for product in json.loads(mapped['payload']).get('assignments',{}):
                db.execute("INSERT OR IGNORE INTO product_availability VALUES(?,?,'available',1,NULL)",(mapped['branch_id'],product))
        return {'records':[dict(row) for row in db.execute('SELECT * FROM product_availability')]}

router.get('')(snapshot)

@router.post('')
def update(body:AvailabilityUpdate):
    ids=[str(value) for value in body.product_ids]
    if len(set(ids))!=len(ids): raise HTTPException(422,'Hay productos repetidos')
    if any(not isinstance(n,int) or n<0 for n in body.expected_revisions.values()): raise HTTPException(422,'Revisión inválida')
    digest=hashlib.sha256(json.dumps(body.model_dump(mode='json'),sort_keys=True).encode()).hexdigest()
    with connection() as db:
        ensure_tables(db)
        db.execute('BEGIN IMMEDIATE')
        receipt=db.execute('SELECT * FROM availability_receipts WHERE operation_id=?',(str(body.operation_id),)).fetchone()
        if receipt:
            if receipt['digest']!=digest: raise HTTPException(409,'La operación ya se usó con otros datos')
            return json.loads(receipt['result'])
        branch=str(body.branch_id);result=[]
        for product in ids:
            old=db.execute('SELECT * FROM product_availability WHERE branch_id=? AND product_id=?',(branch,product)).fetchone()
            revision=old['revision'] if old else 0
            if revision!=body.expected_revisions.get(product,0): raise HTTPException(409,'La disponibilidad cambió en otro dispositivo; revisá el estado antes de confirmarlo de nuevo')
            stamp=datetime.now(timezone.utc).isoformat() if body.status!='unknown' else None
            record={'branch_id':branch,'product_id':product,'status':body.status,'revision':revision+1,'confirmed_at':stamp}
            db.execute('INSERT INTO product_availability VALUES(?,?,?,?,?) ON CONFLICT(branch_id,product_id) DO UPDATE SET status=excluded.status,revision=excluded.revision,confirmed_at=excluded.confirmed_at',(branch,product,body.status,revision+1,stamp));result.append(record)
        response={'records':result}
        db.execute('INSERT INTO availability_receipts VALUES(?,?,?)',(str(body.operation_id),digest,json.dumps(response)))
        return response
