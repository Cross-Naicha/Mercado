import json
from decimal import Decimal
from typing import Literal
from uuid import UUID
from fastapi import HTTPException
from pydantic import BaseModel,Field
import functions


class Barcode(BaseModel):
    product_id: UUID
    code: str = Field(min_length=1,max_length=80,pattern=r'^[0-9A-Za-z._-]+$')


class Branch(BaseModel):
    name: str = Field(min_length=1,max_length=255)
    address: str = Field(min_length=1,max_length=500)
    expected_revision: int = Field(ge=0)


class Node(BaseModel):
    id: str = Field(min_length=1,max_length=80)
    label: str = Field(min_length=1,max_length=120)


class Edge(BaseModel):
    source: str
    target: str
    distance: Decimal = Field(gt=0,le=100000)


class StoreMap(BaseModel):
    branch_id: UUID
    nodes: list[Node] = Field(min_length=2,max_length=200)
    edges: list[Edge] = Field(min_length=1,max_length=500)
    entrance: str
    checkout: str


class Location(BaseModel):
    branch_id: UUID
    product_id: UUID
    aisle: str = Field(min_length=1,max_length=80)
    aisle_order: int = Field(ge=0,le=10000)
    shelf: str = Field(default='',max_length=120)
    reference: str = Field(default='',max_length=255)
    node_id: str | None = Field(default=None,max_length=80)
    cold: bool = False
    confirmed_on: str = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')


class Group(BaseModel):
    name: str = Field(min_length=1,max_length=120)
    product_ids: list[UUID] = Field(min_length=2,max_length=100)


class Photo(BaseModel):
    product_id: UUID
    signature: list[int] = Field(min_length=192,max_length=192)
    thumbnail: str = Field(max_length=150000,pattern=r'^data:image/webp;base64,')


class Document(BaseModel):
    kind: Literal['map','location','group','photo']
    owner_id: UUID
    expected_revision: int = Field(ge=0)
    data: dict


MODELS={'barcode':Barcode,'branch':Branch,'shopping_document':Document}
DOCUMENTS={'map':StoreMap,'location':Location,'group':Group,'photo':Photo}


def require_product(c,id):
    c.execute('SELECT id FROM catalog_products WHERE id=%s AND deleted_at IS NULL',(str(id),))
    if not c.fetchone(): raise HTTPException(409,'Falta sincronizar el producto')


def apply_shopping(c,kind,entity,payload):
    if kind=='barcode':
        require_product(c,payload.product_id)
        c.execute('SELECT product_id FROM product_barcodes WHERE code=%s FOR UPDATE',(payload.code,))
        old=c.fetchone()
        if old and old['product_id']!=str(payload.product_id): raise HTTPException(409,'El código ya está asociado a otro producto')
        if not old: c.execute('INSERT INTO product_barcodes(code,product_id) VALUES(%s,%s)',(payload.code,str(payload.product_id)))
        return
    if kind=='branch':
        c.execute('SELECT revision FROM store_branches WHERE id=%s FOR UPDATE',(entity,))
        old=c.fetchone()
        if (old['revision'] if old else 0)!=payload.expected_revision: raise HTTPException(409,'La sucursal cambió en otro dispositivo')
        if old: c.execute('UPDATE store_branches SET name=%s,address=%s,location_confirmed=TRUE,revision=revision+1 WHERE id=%s',(payload.name,payload.address,entity))
        else: c.execute('INSERT INTO store_branches(id,name,address,location_confirmed) VALUES(%s,%s,%s,TRUE)',(entity,payload.name,payload.address))
        return
    data=DOCUMENTS[payload.kind](**payload.data)
    owner=str(payload.owner_id)
    if payload.kind in ('map','location'):
        if owner!=str(data.branch_id): raise HTTPException(422,'La sucursal no coincide')
        c.execute('SELECT id FROM store_branches WHERE id=%s AND deleted_at IS NULL',(owner,))
        if not c.fetchone(): raise HTTPException(409,'Falta sincronizar la sucursal')
    if payload.kind=='map':
        ids={n.id for n in data.nodes}
        if len(ids)!=len(data.nodes) or data.entrance not in ids or data.checkout not in ids: raise HTTPException(422,'Nodos/entrada/cajas inválidos')
        if any(e.source not in ids or e.target not in ids or e.source==e.target for e in data.edges): raise HTTPException(422,'Conexiones inválidas')
        if entity!=owner: raise HTTPException(422,'El mapa usa el identificador de su sucursal')
    if payload.kind in ('location','photo'):
        require_product(c,data.product_id)
    if payload.kind=='location':
        from datetime import date
        try: date.fromisoformat(data.confirmed_on)
        except ValueError: raise HTTPException(422,'Fecha de confirmación inválida')
        if data.node_id:
            c.execute("SELECT payload FROM shopping_documents WHERE id=%s AND kind='map'",(owner,))
            mapped=c.fetchone()
            if not mapped or data.node_id not in {node['id'] for node in json.loads(mapped['payload'])['nodes']}: raise HTTPException(422,'El punto no existe en el mapa')
    if payload.kind=='photo':
        if owner!=str(data.product_id) or any(n<0 or n>255 for n in data.signature): raise HTTPException(422,'Referencia de imagen inválida')
    if payload.kind=='group':
        if len(set(data.product_ids))!=len(data.product_ids): raise HTTPException(422,'Hay productos repetidos en el grupo')
        for id in data.product_ids: require_product(c,id)
    c.execute('SELECT revision,kind,owner_id FROM shopping_documents WHERE id=%s FOR UPDATE',(entity,))
    old=c.fetchone()
    if (old['revision'] if old else 0)!=payload.expected_revision: raise HTTPException(409,'La información cambió; sincronizá antes de editar')
    if old and (old['kind']!=payload.kind or old['owner_id']!=owner): raise HTTPException(409,'El registro pertenece a otra entidad')
    encoded=json.dumps(data.model_dump(mode='json'))
    if old: c.execute('UPDATE shopping_documents SET payload=%s,revision=revision+1 WHERE id=%s',(encoded,entity))
    else: c.execute('INSERT INTO shopping_documents(id,kind,owner_id,payload) VALUES(%s,%s,%s,%s)',(entity,payload.kind,owner,encoded))


def shopping_snapshot():
    c,db=functions.connect_to_database(True)
    try:
        db.start_transaction(consistent_snapshot=True)
        c.execute('SELECT * FROM product_barcodes'); codes=c.fetchall()
        c.execute('SELECT * FROM store_branches WHERE deleted_at IS NULL'); branches=c.fetchall()
        c.execute('SELECT * FROM shopping_documents'); documents=c.fetchall()
        for row in documents: row['payload']=json.loads(row['payload'])
        c.execute('SELECT operation_id FROM sync_receipts'); confirmed=[r['operation_id'] for r in c.fetchall()]
        from migrate_foundation import encode
        return json.loads(json.dumps({'barcodes':codes,'branches':branches,'documents':documents,'confirmed_operations':confirmed},default=encode))
    finally: functions.close_database_connection(db,c)
