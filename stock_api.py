"""Lotes y movimientos auditables; se invoca dentro de la transacción de sincronización."""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID, uuid4
from fastapi import HTTPException
from pydantic import BaseModel, Field
import functions


class ProductSettings(BaseModel):
    product_id: UUID
    expected_revision: int = Field(ge=1)
    sale_mode: Literal['package','fractional','unit']
    content_unit: Literal['g','ml','unit']
    package_content: Decimal = Field(gt=0,max_digits=18,decimal_places=6)


class InitialStock(BaseModel):
    product_id: UUID
    quantity: Decimal = Field(gt=0,max_digits=18,decimal_places=6)
    unit: Literal['g','ml','unit']
    location: str = Field(min_length=1,max_length=255)
    expires_on: date | None = None
    expiry_source: Literal['exact','estimated'] = 'exact'
    occurred_at: datetime
    event_timezone: str = Field(max_length=80)


class Movement(BaseModel):
    lot_id: UUID
    quantity: Decimal = Field(ge=0,max_digits=18,decimal_places=6)
    reason: Literal['consume','discard','adjust','open','reversal']
    direction: Literal['add','remove'] = 'remove'
    reverses_id: UUID | None = None
    occurred_at: datetime
    event_timezone: str = Field(max_length=80)
    note: str = Field(default='',max_length=500)


class Minimum(BaseModel):
    product_id: UUID
    quantity: Decimal = Field(ge=0,max_digits=18,decimal_places=6)
    expected_revision: int = Field(ge=0)


class StockTransfer(BaseModel):
    lot_id: UUID
    quantity: Decimal = Field(gt=0,max_digits=18,decimal_places=6)
    expected_balance: Decimal = Field(ge=0,max_digits=18,decimal_places=6)
    location: str = Field(min_length=1,max_length=255)
    occurred_at: datetime
    event_timezone: str = Field(max_length=80)

class StockCount(BaseModel):
    product_id: UUID
    location: str = Field(min_length=1,max_length=255)
    quantity: Decimal = Field(ge=0,max_digits=18,decimal_places=6)
    expected_balance: Decimal = Field(ge=0,max_digits=18,decimal_places=6)
    expires_on: date | None = None
    occurred_at: datetime
    event_timezone: str = Field(max_length=80)

MODELS={'settings':ProductSettings,'stock_initial':InitialStock,'stock_move':Movement,'minimum':Minimum,'stock_transfer':StockTransfer,'stock_count':StockCount}


def get_product(cursor, product_id):
    cursor.execute('SELECT * FROM catalog_products WHERE id=%s AND deleted_at IS NULL FOR UPDATE',(str(product_id),))
    product=cursor.fetchone()
    if not product: raise HTTPException(409,'Falta sincronizar el producto')
    return product


def require_units(product):
    if product['unit_status']!='confirmed' or not product['sale_mode']:
        raise HTTPException(409,'Confirmá unidad y modalidad del producto antes de cargar stock')


def utc(value):
    if value.tzinfo is None: raise HTTPException(422,'La fecha necesita zona horaria')
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def validate_settings(payload):
    if payload.sale_mode=='unit' and (payload.content_unit!='unit' or payload.package_content!=1):
        raise HTTPException(422,'La venta por unidad requiere contenido 1 y unidad física unidad')
    if payload.sale_mode=='fractional' and payload.content_unit=='unit':
        raise HTTPException(422,'Fraccionado requiere gramos o mililitros')
    if payload.sale_mode=='fractional' and payload.package_content!=1000:
        raise HTTPException(422,'Fraccionado usa referencia de 1000 g/ml para precio por kg/litro')


def add_lot(cursor,entity,product,quantity,unit,location,expires,source,when,zone,purchase_id=None):
    require_units(product)
    if product['content_unit']!=unit: raise HTTPException(409,'La unidad no coincide con el producto')
    if quantity<=0 or quantity>=Decimal('1000000000000'): raise HTTPException(422,'Cantidad de stock fuera de rango')
    cursor.execute('INSERT INTO stock_lots(id,product_id,purchase_id,unit,location,expires_on,expiry_source,created_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)',
                   (entity,product['id'],purchase_id,unit,location,expires,source,utc(when)))
    cursor.execute('INSERT INTO stock_movements(id,lot_id,quantity,reason,occurred_at,event_timezone) VALUES(%s,%s,%s,%s,%s,%s)',
                   (entity,entity,quantity,'purchase' if purchase_id else 'initial',utc(when),zone))


def apply_stock(cursor,kind,entity,payload):
    if kind=='settings':
        validate_settings(payload)
        product=get_product(cursor,payload.product_id)
        if product['revision']!=payload.expected_revision: raise HTTPException(409,'El producto cambió en otro dispositivo; sincronizá antes de editar')
        cursor.execute('SELECT id FROM stock_lots WHERE product_id=%s LIMIT 1',(product['id'],))
        if cursor.fetchone() and (product['content_unit']!=payload.content_unit or product['sale_mode']!=payload.sale_mode or product['package_content']!=payload.package_content):
            raise HTTPException(409,'Un producto con lotes conserva su unidad y presentación; registrá otra presentación como producto nuevo')
        cursor.execute("UPDATE catalog_products SET sale_mode=%s,content_unit=%s,package_content=%s,unit_status='confirmed',revision=revision+1 WHERE id=%s",
                       (payload.sale_mode,payload.content_unit,payload.package_content,product['id']))
        # Compatibilidad: precio por kg/litro para fraccionados; por envase para paquetes.
        presentation=Decimal(1) if payload.sale_mode!='package' else payload.package_content/(1000 if payload.content_unit!='unit' else 1)
        cursor.execute('UPDATE products SET presentation=%s WHERE id_product=%s',(presentation,product['legacy_product_id']))
    elif kind=='stock_initial':
        product=get_product(cursor,payload.product_id)
        add_lot(cursor,entity,product,payload.quantity,payload.unit,payload.location,payload.expires_on,payload.expiry_source,payload.occurred_at,payload.event_timezone)
    elif kind in ('stock_transfer','stock_count'):
        if kind=='stock_transfer':
            cursor.execute('SELECT * FROM stock_lots WHERE id=%s FOR UPDATE',(str(payload.lot_id),))
            lot=cursor.fetchone()
            if not lot: raise HTTPException(409,'Falta sincronizar el lote')
            product=get_product(cursor,lot['product_id'])
            if lot['location']==payload.location: raise HTTPException(422,'Elegí otra ubicación')
            lots=[lot]
        else:
            product=get_product(cursor,payload.product_id);require_units(product)
            cursor.execute('SELECT * FROM stock_lots WHERE product_id=%s AND location=%s ORDER BY expires_on IS NULL,expires_on,id FOR UPDATE',(product['id'],payload.location))
            lots=cursor.fetchall()
        balances=[]
        for lot in lots:
            cursor.execute('SELECT quantity FROM stock_movements WHERE lot_id=%s FOR UPDATE',(lot['id'],))
            balances.append(sum((r['quantity'] for r in cursor.fetchall()),Decimal(0)))
        current=sum(balances,Decimal(0))
        if current!=payload.expected_balance: raise HTTPException(409,'Las existencias cambiaron; sincronizá y revisá el recuento o traslado')
        if product['content_unit']=='unit' and payload.quantity!=int(payload.quantity): raise HTTPException(422,'Ingresá unidades enteras')
        if kind=='stock_transfer':
            if payload.quantity>current: raise HTTPException(409,'El traslado supera las existencias')
            lot=lots[0]
            add_lot(cursor,entity,product,payload.quantity,lot['unit'],payload.location,lot['expires_on'],lot['expiry_source'],payload.occurred_at,payload.event_timezone,lot['purchase_id'])
            cursor.execute("UPDATE stock_movements SET reason='adjust',note=%s WHERE id=%s",('Traslado: entrada',entity))
            changes=[(lot['id'],-payload.quantity)]
        else:
            difference=payload.quantity-current;changes=[]
            if difference>0:
                add_lot(cursor,entity,product,difference,product['content_unit'],payload.location,payload.expires_on,'exact',payload.occurred_at,payload.event_timezone)
                cursor.execute("UPDATE stock_movements SET reason='adjust',note=%s WHERE id=%s",('Inventario: diferencia positiva',entity))
            else:
                remaining=-difference
                for lot,balance in zip(lots,balances):
                    amount=min(balance,remaining)
                    if amount: changes.append((lot['id'],-amount));remaining-=amount
        for lot_id,quantity in changes:
            note='Traslado: salida' if kind=='stock_transfer' else 'Inventario: diferencia negativa'
            cursor.execute('INSERT INTO stock_movements(id,lot_id,quantity,reason,occurred_at,event_timezone,note) VALUES(%s,%s,%s,%s,%s,%s,%s)',(str(uuid4()),lot_id,quantity,'adjust',utc(payload.occurred_at),payload.event_timezone,note))
    elif kind=='minimum':
        product=get_product(cursor,payload.product_id); require_units(product)
        cursor.execute('SELECT revision FROM stock_preferences WHERE product_id=%s FOR UPDATE',(product['id'],))
        row=cursor.fetchone()
        if (row['revision'] if row else 0)!=payload.expected_revision: raise HTTPException(409,'El mínimo cambió en otro dispositivo')
        cursor.execute('INSERT INTO stock_preferences(product_id,minimum_quantity,revision) VALUES(%s,%s,1) ON DUPLICATE KEY UPDATE minimum_quantity=VALUES(minimum_quantity),revision=revision+1',(product['id'],payload.quantity))
    else:
        cursor.execute('SELECT * FROM stock_lots WHERE id=%s FOR UPDATE',(str(payload.lot_id),))
        lot=cursor.fetchone()
        if not lot: raise HTTPException(409,'Falta sincronizar el lote')
        cursor.execute('SELECT quantity FROM stock_movements WHERE lot_id=%s FOR UPDATE',(lot['id'],))
        balance=sum((r['quantity'] for r in cursor.fetchall()),Decimal(0))
        reverse=None
        quantity=payload.quantity
        if payload.reason=='reversal':
            if not payload.reverses_id: raise HTTPException(422,'Seleccioná el movimiento a revertir')
            cursor.execute('SELECT * FROM stock_movements WHERE id=%s AND lot_id=%s',(str(payload.reverses_id),lot['id']))
            old=cursor.fetchone()
            if old and str(old.get('note') or '').startswith(('Traslado:','Inventario:')): raise HTTPException(422,'Corregí con otro recuento o traslado')
            if not old or old['reason']=='reversal' or old['quantity']==0: raise HTTPException(422,'Movimiento no reversible')
            cursor.execute('SELECT id FROM stock_movements WHERE reverses_id=%s',(old['id'],))
            if cursor.fetchone(): raise HTTPException(409,'Ese movimiento ya fue revertido')
            quantity=-old['quantity']; reverse=old['id']
        elif payload.reason=='open': quantity=Decimal(0)
        else:
            if quantity<=0: raise HTTPException(422,'Ingresá una cantidad positiva')
            if payload.reason in ('consume','discard') or payload.direction=='remove': quantity=-quantity
        if balance+quantity<0: raise HTTPException(409,'El consumo supera las existencias del lote; sincronizá y revisá')
        if balance+quantity>=Decimal('1000000000000'): raise HTTPException(422,'Stock fuera de rango')
        cursor.execute('INSERT INTO stock_movements(id,lot_id,quantity,reason,reverses_id,occurred_at,event_timezone,note) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)',
                       (entity,lot['id'],quantity,payload.reason,reverse,utc(payload.occurred_at),payload.event_timezone,payload.note))


def stock_snapshot():
    c,db=functions.connect_to_database(True)
    try:
        db.start_transaction(consistent_snapshot=True)
        result={}
        for key,table in [('lots','stock_lots'),('movements','stock_movements'),('preferences','stock_preferences')]:
            c.execute('SELECT * FROM '+table)
            result[key]=c.fetchall()
        c.execute("SELECT operation_id FROM sync_receipts")
        result['confirmed_operations']=[r['operation_id'] for r in c.fetchall()]
        from migrate_foundation import encode
        import json
        return json.loads(json.dumps(result,default=encode))
    finally: functions.close_database_connection(db,c)
