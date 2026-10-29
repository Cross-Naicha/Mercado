"""Shared grid maps, with optimistic revisions to protect concurrent edits."""
import json
import re
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

router=APIRouter(prefix='/api/maps')
DATABASE=Path(__file__).resolve().parent/'data'/'maps.sqlite3'

class Region(BaseModel):
    id: str=Field(min_length=1,max_length=100)
    name: str=Field(min_length=1,max_length=60)
    color: Literal['#0f7a66','#449b52','#216348','#79b86b','#368b80','#a0c785']='#0f7a66'
    orientation: Literal['horizontal','vertical']='horizontal'
    entry: Literal['first','last']='first'
    cells: list[int]=Field(max_length=16384)

class Placement(BaseModel):
    cell: int=Field(ge=0,le=16383)
    order: int=Field(ge=0,le=100000)

class GridMap(BaseModel):
    version: Literal[2]
    rows: int=Field(ge=1,le=128)
    cols: int=Field(ge=1,le=128)
    precision: Literal[1,2,4,8]
    nextLetters: dict[str,int]=Field(default_factory=dict)
    nextZone: int=Field(default=1,ge=1,le=9007199254740991)
    cells: list[Literal[0,1]]=Field(max_length=16384)
    shelves: list[Region]=Field(default_factory=list,max_length=16384)
    assignments: dict[str,str]=Field(default_factory=dict)
    placements: dict[str,Placement]=Field(default_factory=dict)

    @model_validator(mode='after')
    def valid_grid(self):
        if any(not re.fullmatch(r'[A-ZÑ]',letter) or number<1 or number>9007199254740991 for letter,number in self.nextLetters.items()): raise ValueError('Numeración de zonas inválida')
        if len(self.cells)!=self.rows*self.cols: raise ValueError('Dimensiones del mapa inválidas')
        ids=set();occupied=set()
        for region in self.shelves:
            if not region.name.strip() or region.id in ids: raise ValueError('Zona inválida o repetida')
            ids.add(region.id)
            for cell in region.cells:
                if cell<0 or cell>=len(self.cells) or self.cells[cell]!=1 or cell in occupied: raise ValueError('Celdas de zona inválidas o superpuestas')
                occupied.add(cell)
        if len(self.assignments)>100000 or any(not product or len(product)>100 or zone not in ids for product,zone in self.assignments.items()): raise ValueError('Asignación de productos inválida')
        zones={region.id:set(region.cells) for region in self.shelves}
        if len(self.placements)>100000 or any(product not in self.assignments or place.cell not in zones[self.assignments[product]] for product,place in self.placements.items()): raise ValueError("El cuadrado debe pertenecer a la region del producto")
        return self

class Update(BaseModel):
    expected_revision: int=Field(ge=0)
    map: GridMap

@contextmanager
def connection():
    DATABASE.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(DATABASE,timeout=10)
    db.row_factory=sqlite3.Row
    db.execute('CREATE TABLE IF NOT EXISTS grid_maps (branch_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL)')
    try:
        with db:
            yield db
    finally:
        db.close()

@router.get('')
def snapshot():
    with connection() as db:
        return {'features':['placements','region_entry'],'maps':[{'branch_id':r['branch_id'],'revision':r['revision'],'map':json.loads(r['payload'])} for r in db.execute('SELECT * FROM grid_maps')]}

@router.put('/{branch_id}')
def update(branch_id:UUID,body:Update):
    encoded=json.dumps(body.map.model_dump(),sort_keys=True,separators=(',',':'),ensure_ascii=False)
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        old=db.execute('SELECT revision,payload FROM grid_maps WHERE branch_id=?',(str(branch_id),)).fetchone()
        revision=old['revision'] if old else 0
        # A lost response may be retried without incrementing the revision again.
        if old and old['payload']==encoded: return {'revision':revision}
        if revision!=body.expected_revision: raise HTTPException(409,'El mapa cambió en otro dispositivo')
        revision+=1
        db.execute('INSERT INTO grid_maps(branch_id,revision,payload) VALUES(?,?,?) ON CONFLICT(branch_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload',(str(branch_id),revision,encoded))
        return {'revision':revision}

