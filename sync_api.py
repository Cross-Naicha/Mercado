"""Operaciones transaccionales e idempotentes para clientes sin conexión."""
import hashlib
import json
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pydantic import BaseModel, Field
import functions
from migrate_foundation import stable_id
from stock_api import MODELS, apply_stock, get_product, add_lot, validate_settings, ProductSettings, require_units
from shopping_api import MODELS as SHOPPING_MODELS, apply_shopping


class StorageLocation(BaseModel):
    location: str = Field(min_length=1,max_length=255)
    detail: str = Field(default='',max_length=255)
    role: Literal['daily','reserve'] = 'daily'

class ProductData(BaseModel):
    flavor: str = Field(default="",max_length=255)
    storage_location: str = Field(default="",max_length=255)
    storage_detail: str = Field(default="",max_length=255)
    storage_locations: list[StorageLocation] | None = Field(default=None,max_length=20)
    category: str | None = Field(default=None,max_length=255)
    unit_content: Decimal | None = Field(default=None,gt=0,max_digits=18,decimal_places=6)
    unit_content_unit: Literal['g','ml'] | None = None
    display_label: str | None = Field(default=None, max_length=255)
    product: str = Field(min_length=1, max_length=255)
    brand: str = Field(max_length=255)
    ptype: str | None = Field(default=None, max_length=255)
    psubtype: str | None = Field(default=None, max_length=255)
    presentation: Decimal = Field(gt=0, max_digits=18, decimal_places=6)
    sale_mode: Literal['package','fractional','unit'] | None = None
    content_unit: Literal['g','ml','unit'] | None = None
    package_content: Decimal | None = Field(default=None,gt=0,max_digits=18,decimal_places=6)
    barcode: str | None = Field(default=None,min_length=1,max_length=80,pattern=r'^[0-9A-Za-z._-]+$')


class ProductEdit(BaseModel):
    flavor: str = Field(default="",max_length=255)
    storage_location: str = Field(default="",max_length=255)
    storage_detail: str = Field(default="",max_length=255)
    storage_locations: list[StorageLocation] | None = Field(default=None,max_length=20)
    unit_content: Decimal | None = Field(default=None,gt=0,max_digits=18,decimal_places=6)
    unit_content_unit: Literal['g','ml'] | None = None
    display_label: str | None = Field(default=None, max_length=255)
    product_id: UUID
    expected_revision: int = Field(ge=1)
    product: str = Field(min_length=1, max_length=255)
    brand: str = Field(max_length=255)
    ptype: str | None = Field(default=None, max_length=255)
    psubtype: str | None = Field(default=None, max_length=255)
    category: str | None = Field(default=None, max_length=255)
    sale_mode: Literal['package','fractional','unit'] | None = None
    content_unit: Literal['g','ml','unit'] | None = None
    package_content: Decimal | None = Field(default=None,gt=0,max_digits=18,decimal_places=6)


class ProductDelete(BaseModel):
    product_id: UUID
    expected_revision: int = Field(ge=1)


class OccasionalPurchase(BaseModel):
    description: str = Field(default='',max_length=255)
    total_paid: Decimal = Field(gt=0,max_digits=18,decimal_places=2)
    cart_id: UUID
    occurred_at: datetime
    event_timezone: str = Field(max_length=80)

class PurchaseData(BaseModel):
    cart_id: UUID | None = None
    quantity_from_total: bool = False
    promotion_description: str | None = Field(default=None,max_length=500)
    product_id: UUID
    quantity: Decimal = Field(gt=0, max_digits=18, decimal_places=6)
    price: Decimal = Field(ge=0, max_digits=18, decimal_places=4)
    total_paid: Decimal | None = Field(default=None, ge=0, max_digits=18, decimal_places=4)
    is_promotion: bool
    market: str = Field(min_length=1, max_length=255)
    occurred_at: datetime
    event_timezone: str = Field(max_length=80)
    add_to_stock: bool = False
    stock_quantity: Decimal | None = Field(default=None,gt=0,max_digits=18,decimal_places=6)
    stock_unit: Literal['g','ml','unit'] | None = None
    product_revision: int | None = None
    location: str = Field(default='Despensa',min_length=1,max_length=255)
    expires_on: date | None = None
    expiry_source: Literal['exact','estimated'] = 'exact'
    branch_id: UUID | None = None


class ShelfPriceData(BaseModel):
    amount_paid: Decimal | None = Field(default=None,gt=0,max_digits=18,decimal_places=4)
    observation_id: UUID | None = None
    expected_received_at: datetime | None = None
    product_id: UUID
    price: Decimal | None = Field(default=None,ge=0,max_digits=18,decimal_places=4)
    price_basis: Literal['package','kg','l','unit'] = 'package'
    promotion: Literal['none','offer','2x1','3x2','4x3','2_50%','2_80%','special'] = 'none'
    special_quantity: int | None = Field(default=None,gt=0,le=1000000)
    special_total: Decimal | None = Field(default=None,ge=0,max_digits=18,decimal_places=2)
    promotion_description: str | None = Field(default=None,max_length=500)
    market: str = Field(min_length=1,max_length=255)
    branch_id: UUID | None = None
    occurred_at: datetime
    event_timezone: str = Field(max_length=80)

PROMOTIONS={'none':(1,1,1),'offer':(1,1,1),'2x1':(2,1,1),'3x2':(3,2,1),'4x3':(4,3,1),'2_50%':(2,3,2),'2_80%':(2,6,5)}

class Operation(BaseModel):
    operation_id: UUID
    entity_id: UUID
    kind: Literal['product', 'product_edit','product_delete','shelf_price','purchase','occasional_purchase','settings','stock_initial','stock_move','stock_transfer','stock_count','minimum','barcode','branch','shopping_document']
    payload: dict


def apply_operation(operation: Operation):
    payload = ({'product':ProductData,'product_edit':ProductEdit,'product_delete':ProductDelete,'shelf_price':ShelfPriceData,'purchase':PurchaseData,'occasional_purchase':OccasionalPurchase,**MODELS,**SHOPPING_MODELS}[operation.kind])(**operation.payload)
    if operation.kind=='product_edit':
        payload.product=payload.product.strip()
        if not payload.product: raise HTTPException(422,'Ingresá el nombre del producto')
    if operation.kind in ('product','product_edit'):
        if bool(payload.unit_content is not None)!=bool(payload.unit_content_unit is not None): raise HTTPException(422,'Completá el contenido y la medida de cada unidad')
        if payload.unit_content is not None and (payload.sale_mode!='package' or payload.content_unit!='unit' or payload.package_content is None or payload.package_content<2 or payload.package_content!=int(payload.package_content)):
            raise HTTPException(422,'El contenido por unidad requiere un paquete de varias unidades')
    if hasattr(payload,'occurred_at'):
        if payload.occurred_at.tzinfo is None: raise HTTPException(422,'La fecha necesita zona horaria')
        try: ZoneInfo(payload.event_timezone)
        except (ValueError,KeyError): raise HTTPException(422,'Zona horaria inválida')
    if operation.kind == 'purchase':
        if payload.occurred_at.tzinfo is None:
            raise HTTPException(422, 'La fecha necesita zona horaria')
        try:
            event_date = payload.occurred_at.astimezone(ZoneInfo(payload.event_timezone)).date()
        except (ValueError, KeyError):
            raise HTTPException(422, 'Zona horaria inválida')
        if payload.quantity * payload.price >= Decimal('100000000000000'):
            raise HTTPException(422, 'Importe demasiado grande')
        tolerance=payload.quantity * Decimal('0.00005') + Decimal('0.00005')
        if payload.quantity_from_total: tolerance+=payload.price*Decimal('0.0000005')
        if payload.total_paid is not None and abs(payload.total_paid - payload.quantity * payload.price) > tolerance:
            raise HTTPException(422, 'El total y el precio medio no coinciden')
    canonical = operation.model_dump(mode='json')
    digest = hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    cursor, connection = functions.connect_to_database(True)
    lock = 'sync:' + str(operation.operation_id)
    acquired = False
    try:
        cursor.execute('SELECT GET_LOCK(%s, 5) AS acquired', (lock,))
        acquired = cursor.fetchone()['acquired'] == 1
        if not acquired:
            raise HTTPException(503, 'Operación ocupada; reintentar')
        connection.commit()
        connection.start_transaction()
        cursor.execute('SELECT payload_hash,result_json FROM sync_receipts WHERE operation_id=%s', (str(operation.operation_id),))
        receipt = cursor.fetchone()
        if receipt:
            if receipt['payload_hash'] != digest:
                raise HTTPException(409, 'El identificador ya se utilizó con otros datos')
            connection.rollback()
            return json.loads(receipt['result_json'])
        entity = str(operation.entity_id)
        if operation.kind == 'product':
            cursor.execute('SELECT id FROM catalog_products WHERE id=%s', (entity,))
            if cursor.fetchone():
                raise HTTPException(409, 'El producto ya existe con otra operación')
            cursor.execute('INSERT INTO products (product,brand,ptype,psubtype,presentation) VALUES (%s,%s,%s,%s,%s)',
                           (payload.product, payload.brand, payload.ptype, payload.psubtype, payload.presentation))
            legacy_id = cursor.lastrowid
            cursor.execute('UPDATE products SET pclass=%s WHERE id_product=%s',(payload.category,legacy_id))
            cursor.execute('INSERT INTO catalog_products (id,legacy_product_id,name,brand,product_type,product_subtype,legacy_presentation) VALUES (%s,%s,%s,%s,%s,%s,%s)',
                           (entity, legacy_id, payload.product, payload.brand, payload.ptype, payload.psubtype, payload.presentation))
            cursor.execute('UPDATE catalog_products SET display_label=%s WHERE id=%s',((payload.display_label or '').strip() or None,entity))
            cursor.execute('UPDATE catalog_products SET category=%s,unit_content=%s,unit_content_unit=%s WHERE id=%s',(payload.category,payload.unit_content,payload.unit_content_unit,entity))
            cursor.execute('UPDATE catalog_products SET flavor=%s WHERE id=%s',(payload.flavor.strip(),entity))
            cursor.execute('UPDATE catalog_products SET storage_location=%s,storage_detail=%s WHERE id=%s',(payload.storage_location.strip(),payload.storage_detail.strip(),entity))
            if payload.sale_mode:
                settings=ProductSettings(product_id=entity,expected_revision=1,sale_mode=payload.sale_mode,content_unit=payload.content_unit,package_content=payload.package_content)
                validate_settings(settings)
                cursor.execute("UPDATE catalog_products SET sale_mode=%s,content_unit=%s,package_content=%s,unit_status='confirmed' WHERE id=%s",(payload.sale_mode,payload.content_unit,payload.package_content,entity))
            if payload.barcode:
                cursor.execute('SELECT product_id FROM product_barcodes WHERE code=%s FOR UPDATE',(payload.barcode,))
                if cursor.fetchone(): raise HTTPException(409,'El código ya está asociado a otro producto')
                cursor.execute('INSERT INTO product_barcodes(code,product_id) VALUES(%s,%s)',(payload.barcode,entity))
        elif operation.kind=='product_delete':
            product=get_product(cursor,payload.product_id)
            legacy_id=product['legacy_product_id']
            if product['revision']!=payload.expected_revision:
                raise HTTPException(409,'El producto cambió; revisá sus datos antes de borrarlo')
            cursor.execute('SELECT m.quantity FROM stock_movements m JOIN stock_lots l ON l.id=m.lot_id WHERE l.product_id=%s FOR UPDATE',(str(payload.product_id),))
            if sum((r['quantity'] for r in cursor.fetchall()),Decimal(0))>0:
                raise HTTPException(409,'El producto todavía tiene stock; resolvé sus existencias antes de borrarlo')
            cursor.execute('UPDATE catalog_products SET deleted_at=UTC_TIMESTAMP(),revision=revision+1 WHERE id=%s',(str(payload.product_id),))
        elif operation.kind=='product_edit':
            product=get_product(cursor,payload.product_id)
            if product['revision']!=payload.expected_revision:
                raise HTTPException(409,'El producto cambió en otro dispositivo; revisá la edición antes de sincronizar')
            legacy_id=product['legacy_product_id']
            if payload.sale_mode:
                settings=ProductSettings(product_id=payload.product_id,expected_revision=payload.expected_revision,sale_mode=payload.sale_mode,content_unit=payload.content_unit,package_content=payload.package_content)
                apply_stock(cursor,'settings',entity,settings)
            cursor.execute('UPDATE products SET product=%s,brand=%s,ptype=%s,psubtype=%s,pclass=%s WHERE id_product=%s',
                           (payload.product,payload.brand,payload.ptype,payload.psubtype,payload.category,legacy_id))
            cursor.execute('UPDATE catalog_products SET name=%s,brand=%s,product_type=%s,product_subtype=%s,category=%s,revision=revision+%s WHERE id=%s',
                           (payload.product,payload.brand,payload.ptype,payload.psubtype,payload.category,0 if payload.sale_mode else 1,str(payload.product_id)))
            cursor.execute('UPDATE catalog_products SET display_label=%s WHERE id=%s',((payload.display_label or '').strip() or None,str(payload.product_id)))
            if 'flavor' in operation.payload:
                cursor.execute('UPDATE catalog_products SET flavor=%s WHERE id=%s',(payload.flavor.strip(),str(payload.product_id)))
            if payload.storage_locations is not None:
                cursor.execute('UPDATE catalog_products SET storage_locations=%s WHERE id=%s',(json.dumps([item.model_dump() for item in payload.storage_locations],ensure_ascii=False),str(payload.product_id)))
            elif 'storage_location' in operation.payload or 'storage_detail' in operation.payload:
                cursor.execute('SELECT storage_locations FROM catalog_products WHERE id=%s',(str(payload.product_id),))
                stored=cursor.fetchone()['storage_locations']
                locations=json.loads(stored) if isinstance(stored,str) else (stored or [])
                if payload.storage_location.strip():
                    first={'location':payload.storage_location.strip(),'detail':payload.storage_detail.strip(),'role':locations[0]['role'] if locations else 'daily'}
                    locations=[first]+locations[1:]
                elif locations: locations=locations[1:]
                cursor.execute('UPDATE catalog_products SET storage_locations=%s WHERE id=%s',(json.dumps(locations,ensure_ascii=False),str(payload.product_id)))
            if 'storage_detail' in operation.payload:
                cursor.execute('UPDATE catalog_products SET storage_detail=%s WHERE id=%s',(payload.storage_detail.strip(),str(payload.product_id)))
            if 'storage_location' in operation.payload:
                cursor.execute('UPDATE catalog_products SET storage_location=%s WHERE id=%s',(payload.storage_location.strip(),str(payload.product_id)))
            if 'unit_content' in operation.payload:
                cursor.execute('UPDATE catalog_products SET unit_content=%s,unit_content_unit=%s WHERE id=%s',(payload.unit_content,payload.unit_content_unit,str(payload.product_id)))
        elif operation.kind=='shelf_price':
            product=get_product(cursor,payload.product_id)
            expected='package' if not product['sale_mode'] or product['sale_mode']=='package' else 'unit' if product['sale_mode']=='unit' else 'kg' if product['content_unit']=='g' else 'l'
            if payload.price_basis!=expected: raise HTTPException(409,'La unidad del precio cambió; revisá el producto')
            if payload.price_basis!='package' and payload.promotion not in ('none','offer') and not (payload.price_basis=='unit' and payload.promotion=='special'): raise HTTPException(422,'Las promociones se registran por envase o por unidades en ofertas especiales')
            branch=str(payload.branch_id) if payload.branch_id else stable_id('branch',payload.market)
            if payload.branch_id:
                cursor.execute('SELECT id FROM store_branches WHERE id=%s AND deleted_at IS NULL',(branch,))
                if not cursor.fetchone(): raise HTTPException(409,'Falta sincronizar la sucursal')
            else:
                cursor.execute('INSERT INTO store_branches(id,name,legacy_market) VALUES(%s,%s,%s) ON DUPLICATE KEY UPDATE id=id',(branch,payload.market,payload.market))
            if payload.promotion=='special':
                if payload.special_quantity is None or payload.special_total is None or not (payload.promotion_description or '').strip():
                    raise HTTPException(422,'La promoción especial necesita cantidad, total y descripción')
                units=payload.special_quantity;total=payload.special_total
            else:
                if payload.price is None: raise HTTPException(422,'Indicá el precio de lista')
                units,numerator,denominator=PROMOTIONS[payload.promotion]
                total=(payload.price*numerator/denominator).quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)
            if total>=Decimal('100000000000000'): raise HTTPException(422,'Importe demasiado grande')
            quantity=units*(1000 if payload.price_basis in ('kg','l') else 1)
            if payload.amount_paid is not None:
                if payload.price_basis not in ('kg','l') or payload.price is None or payload.price<=0:
                    raise HTTPException(422,'El importe pagado requiere un fraccionado con precio por kg/litro positivo')
                quantity=(payload.amount_paid*1000/payload.price).quantize(Decimal('0.000001'),rounding=ROUND_HALF_UP)
                if quantity<=0 or quantity>=Decimal('1000000000000'): raise HTTPException(422,'La cantidad calculada está fuera de rango')
                total=payload.amount_paid
            basis={'kg':'g','l':'ml'}.get(payload.price_basis,payload.price_basis)
            values=(branch,payload.occurred_at.astimezone(timezone.utc).replace(tzinfo=None),payload.event_timezone,quantity,basis,total,payload.promotion_description.strip() if payload.promotion=='special' else None if payload.promotion=='none' else payload.promotion,None if payload.promotion=='special' else payload.price,payload.promotion,payload.amount_paid)
            if payload.observation_id:
                cursor.execute('SELECT product_id,received_at FROM price_observations WHERE id=%s FOR UPDATE',(str(payload.observation_id),))
                old=cursor.fetchone()
                if not old or old['product_id']!=str(payload.product_id): raise HTTPException(409,'No se encontró la observación de este producto')
                if payload.expected_received_at and old['received_at']!=payload.expected_received_at.replace(tzinfo=None): raise HTTPException(409,'La observación cambió; volvé a abrir su edición')
                cursor.execute('UPDATE price_observations SET branch_id=%s,occurred_at=%s,event_timezone=%s,quantity=%s,quantity_basis=%s,total_price=%s,promotion_description=%s,list_price=%s,promotion_code=%s,amount_paid=%s,received_at=UTC_TIMESTAMP(6) WHERE id=%s',values+(str(payload.observation_id),))
            else:
                cursor.execute('INSERT INTO price_observations(id,product_id,branch_id,occurred_at,event_timezone,quantity,quantity_basis,total_price,promotion_description,list_price,promotion_code,amount_paid) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',(entity,str(payload.product_id))+values)
            legacy_id=None
        elif operation.kind=='occasional_purchase':
            cursor.execute('INSERT INTO occasional_purchases(id,cart_id,description,total_paid,occurred_at,event_timezone) VALUES(%s,%s,%s,%s,%s,%s)',
                           (entity,str(payload.cart_id),payload.description.strip(),payload.total_paid,payload.occurred_at.astimezone(timezone.utc).replace(tzinfo=None),payload.event_timezone))
            legacy_id=None
        elif operation.kind=='purchase':
            product = get_product(cursor,payload.product_id)
            if payload.quantity_from_total:
                if product['sale_mode']!='fractional' or payload.price<=0 or payload.total_paid is None or payload.total_paid<=0:
                    raise HTTPException(422,'La cantidad calculada requiere un fraccionado con precio e importe positivos')
                expected_quantity=(payload.total_paid/payload.price).quantize(Decimal('0.000001'),rounding=ROUND_HALF_UP)
                if payload.quantity!=expected_quantity: raise HTTPException(422,'La cantidad no coincide con el importe y el precio por kg/litro')
            cursor.execute('SELECT id FROM purchases WHERE id=%s', (entity,))
            if cursor.fetchone():
                raise HTTPException(409, 'La compra ya existe con otra operación')
            branch = str(payload.branch_id) if payload.branch_id else stable_id('branch', payload.market)
            if payload.branch_id:
                cursor.execute('SELECT id FROM store_branches WHERE id=%s AND deleted_at IS NULL',(branch,))
                if not cursor.fetchone(): raise HTTPException(409,'Falta sincronizar la sucursal')
            else:
                cursor.execute('INSERT INTO store_branches (id,name,legacy_market) VALUES (%s,%s,%s) ON DUPLICATE KEY UPDATE id=id', (branch, payload.market, payload.market))
            cursor.execute('INSERT INTO instances (product_id,quantity,price,is_promotion,obs_date,market) VALUES (%s,%s,%s,%s,%s,%s)',
                           (product['legacy_product_id'], payload.quantity, payload.price, payload.is_promotion, event_date, payload.market))
            legacy_id = cursor.lastrowid
            fractional_line=product['sale_mode']=='fractional'
            cursor.execute("INSERT INTO purchases (id,branch_id,occurred_at,occurred_on,event_timezone,time_precision,legacy_instance_id,needs_review) VALUES (%s,%s,%s,%s,%s,'instant',%s,%s)",
                           (entity, branch, payload.occurred_at.astimezone(timezone.utc).replace(tzinfo=None), event_date, payload.event_timezone, legacy_id,not fractional_line))
            if payload.cart_id:
                cursor.execute('UPDATE purchases SET cart_id=%s WHERE id=%s',(str(payload.cart_id),entity))
            line_quantity=payload.quantity*1000 if fractional_line else payload.quantity
            line_basis=product['content_unit'] if fractional_line else 'legacy_unconfirmed'
            cursor.execute("INSERT INTO purchase_lines (id,purchase_id,product_id,quantity,quantity_basis,total_paid,is_promotion,legacy_unit_price) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                           (stable_id('line', entity), entity, str(payload.product_id), line_quantity,line_basis,payload.total_paid if payload.total_paid is not None else payload.quantity * payload.price, payload.is_promotion, payload.price))
            if payload.add_to_stock:
                require_units(product)
                if payload.product_revision!=product['revision']: raise HTTPException(409,'La unidad del producto cambió; revisá esta compra')
                expected=payload.quantity*(product['package_content'] if product['sale_mode']=='package' else 1000 if product['sale_mode']=='fractional' else 1)
                if payload.stock_quantity!=expected: raise HTTPException(422,'Peso/contenido no coincide con la cantidad comprada')
                add_lot(cursor,entity,product,payload.stock_quantity,payload.stock_unit,payload.location,payload.expires_on,payload.expiry_source,payload.occurred_at,payload.event_timezone,entity)
                cursor.execute("UPDATE purchase_lines SET quantity_basis=%s,quantity=%s WHERE purchase_id=%s",('package' if product['sale_mode']=='package' else product['content_unit'],payload.quantity if product['sale_mode']=='package' else payload.stock_quantity,entity))
                cursor.execute('UPDATE purchases SET needs_review=FALSE WHERE id=%s',(entity,))
            if payload.promotion_description:
                cursor.execute('UPDATE purchase_lines SET promotion_description=%s WHERE purchase_id=%s',(payload.promotion_description.strip(),entity))
        else:
            legacy_id=None
            if operation.kind in SHOPPING_MODELS: apply_shopping(cursor,operation.kind,entity,payload)
            else: apply_stock(cursor,operation.kind,entity,payload)
        result = {'operation_id': str(operation.operation_id), 'entity_id': entity, 'legacy_id': legacy_id, 'status': 'confirmed'}
        cursor.execute('INSERT INTO sync_receipts (operation_id,payload_hash,entity_id,result_json) VALUES (%s,%s,%s,%s)',
                       (str(operation.operation_id), digest, entity, json.dumps(result)))
        connection.commit()
        return result
    except Exception:
        connection.rollback()
        raise
    finally:
        if acquired:
            cursor.execute('SELECT RELEASE_LOCK(%s)', (lock,))
            cursor.fetchone()
        functions.close_database_connection(connection, cursor)


def get_catalog():
    cursor, connection = functions.connect_to_database(True)
    try:
        # Incorporar productos creados por una pantalla antigua durante la transición.
        cursor.execute('SELECT p.* FROM products p LEFT JOIN catalog_products c ON c.legacy_product_id=p.id_product WHERE c.id IS NULL')
        for p in cursor.fetchall():
            cursor.execute('INSERT IGNORE INTO catalog_products (id,legacy_product_id,name,brand,category,product_type,product_subtype,legacy_presentation) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',
                           (stable_id('product', p['id_product']), p['id_product'], p['product'], p['brand'], p['pclass'], p['ptype'], p['psubtype'], p['presentation']))
        connection.commit()
        cursor.execute('''SELECT c.id, p.id_product AS legacy_id, p.product AS product_name,
            p.brand AS product_brand,p.ptype AS product_ptype,p.psubtype AS product_psubtype,
            c.sale_mode,c.content_unit,c.package_content,c.unit_status,c.revision,c.display_label,c.created_at,c.unit_content,c.unit_content_unit,c.storage_location,c.storage_detail,c.storage_locations,c.flavor,
            p.pclass AS product_class,CAST(p.presentation AS DECIMAL(18,6)) AS presentation,
            CAST(COALESCE((SELECT l.legacy_unit_price FROM purchases b JOIN purchase_lines l
                ON l.purchase_id=b.id WHERE b.legacy_instance_id=i.id_instance LIMIT 1),i.price)
                AS DECIMAL(18,4)) AS normal_price,
            i.obs_date AS normal_date,DATEDIFF(CURDATE(),i.obs_date) AS normal_age_days,
            (SELECT b.occurred_at FROM purchases b WHERE b.legacy_instance_id=i.id_instance LIMIT 1) AS normal_price_at,
            CAST(COALESCE((SELECT l.legacy_unit_price FROM purchases b JOIN purchase_lines l
                ON l.purchase_id=b.id WHERE b.legacy_instance_id=j.id_instance LIMIT 1),j.price)
                AS DECIMAL(18,4)) AS last_price,j.obs_date AS last_price_date,j.is_promotion AS last_price_promotion,
            (SELECT b.occurred_at FROM purchases b WHERE b.legacy_instance_id=j.id_instance LIMIT 1) AS last_price_at,
            (SELECT l.promotion_description FROM purchases b JOIN purchase_lines l ON l.purchase_id=b.id WHERE b.legacy_instance_id=j.id_instance LIMIT 1) AS last_price_description
            FROM catalog_products c JOIN products p ON p.id_product=c.legacy_product_id
            LEFT JOIN instances i ON i.id_instance=(SELECT x.id_instance FROM instances x
                WHERE x.product_id=p.id_product AND x.is_promotion=0
                ORDER BY x.obs_date DESC,x.id_instance DESC LIMIT 1)
            LEFT JOIN instances j ON j.id_instance=(SELECT x.id_instance FROM instances x
                WHERE x.product_id=p.id_product ORDER BY x.obs_date DESC,x.id_instance DESC LIMIT 1)
            WHERE c.deleted_at IS NULL ORDER BY p.pclass,p.product''')
        rows = cursor.fetchall()
        cursor.execute('SELECT o.*,s.name AS market FROM price_observations o LEFT JOIN store_branches s ON s.id=o.branch_id ORDER BY o.occurred_at DESC,o.received_at DESC,o.id DESC')
        observations={}
        for observation in cursor.fetchall(): observations.setdefault(observation['product_id'],[]).append(observation)
        for p in rows:
            p['last_price']=str(p['last_price']) if p['last_price'] is not None else None
            p['last_price_date']=p['last_price_date'].isoformat() if p['last_price_date'] else None
            p['normal_date'] = p['normal_date'].isoformat() if p['normal_date'] else None
            p['package_content']=str(p['package_content']) if p['package_content'] is not None else None
            raw_locations=p.get('storage_locations');p['storage_locations']=json.loads(raw_locations) if isinstance(raw_locations,str) else (raw_locations or [])
            p['unit_content']=str(p['unit_content']) if p['unit_content'] is not None else None
            p['product_all'] = visible_label(p)
            p['presentation'] = str(p['presentation']) if p['presentation'] is not None else None
            p['normal_price'] = str(p['normal_price']) if p['normal_price'] is not None else None
            p['last_price_source']='purchase'
            prices=observations.get(p['id'],[])
            if prices:
                observation=prices[0]
                p['shelf_observation']={'id':observation['id'],'received_at':observation['received_at'].isoformat(),'occurred_at':observation['occurred_at'].isoformat()+'Z','event_timezone':observation['event_timezone'],'branch_id':observation['branch_id'],'price':str(observation['list_price']) if observation['list_price'] is not None else None,'promotion':observation['promotion_code'],'special_quantity':str(observation['quantity']),'special_total':str(observation['total_price']),'promotion_description':observation['promotion_description']}
                p['shelf_observation']['amount_paid']=str(observation['amount_paid']) if observation['amount_paid'] is not None else None
                when=observation['occurred_at'].replace(tzinfo=timezone.utc)
                day=when.astimezone(ZoneInfo(observation['event_timezone'])).date().isoformat()
                newer=observation['occurred_at']>=p['last_price_at'] if p['last_price_at'] else not p['last_price_date'] or day>=p['last_price_date']
                if newer:
                    multiplier=1000 if observation['quantity_basis'] in ('g','ml') else 1
                    p.update(last_price=str((observation['total_price']*multiplier/observation['quantity']).quantize(Decimal('0.0001'),rounding=ROUND_HALF_UP)),last_price_date=day,last_price_source='shelf',last_price_promotion=observation['promotion_code']!='none',last_price_conditions=observation['promotion_code'],last_price_market=observation['market'],last_list_price=str(observation['list_price']) if observation['list_price'] is not None else None,last_price_at=observation['occurred_at'])
                    p.update(last_price_description=observation['promotion_description'],last_offer_quantity=str(observation['quantity']),last_offer_total=str(observation['total_price']))
                    if observation['quantity_basis'] in ('g','ml') and observation['list_price'] is not None: p['last_price']=str(observation['list_price'])
                normal=next((o for o in prices if o['promotion_code']=='none'),None)
                if normal:
                    normal_day=normal['occurred_at'].replace(tzinfo=timezone.utc).astimezone(ZoneInfo(normal['event_timezone'])).date().isoformat()
                    normal_newer=normal['occurred_at']>=p['normal_price_at'] if p['normal_price_at'] else not p['normal_date'] or normal_day>=p['normal_date']
                    if normal_newer:
                        p['normal_price']=str(normal['list_price'] if normal['list_price'] is not None else normal['total_price']/normal['quantity']);p['normal_date']=normal_day
                        p['normal_age_days']=(datetime.now(ZoneInfo(normal['event_timezone'])).date()-date.fromisoformat(normal_day)).days
            p.pop('normal_price_at',None)
            p['last_price_at']=p['last_price_at'].isoformat()+'Z' if p['last_price_at'] else None
            p['normal_unit'] = str(Decimal(p['normal_price']) / Decimal(p['presentation'])) if p['normal_price'] is not None and p['presentation'] and Decimal(p['presentation']) > 0 else None
        return rows
    finally:
        functions.close_database_connection(connection, cursor)


def visible_label(product):
    description=' '.join(str(v) for v in (product['product_name'],product['product_ptype'],product['product_psubtype'],product.get('flavor')) if v)
    parts=[description,product.get('product_brand')]
    unit=product.get('content_unit')
    content=product.get('package_content')
    if content is not None and product.get('sale_mode')=='package':
        amount=Decimal(content)
        if unit in ('g','ml') and amount>=1000:
            amount/=1000;unit='kg' if unit=='g' else 'L'
        elif unit=='unit': unit='unidades'
        parts.append(format(amount,'f').rstrip('0').rstrip('.') if '.' in format(amount,'f') else format(amount,'f'))
        parts[-1]+=' '+str(unit)
        if product.get('unit_content'):
            each=format(Decimal(product['unit_content']),'f')
            if '.' in each: each=each.rstrip('0').rstrip('.')
            parts[-1]+=' de '+each+' '+str(product['unit_content_unit'])+' c/u'
    elif product.get('sale_mode')=='fractional': parts.append('Por peso' if unit=='g' else 'Por volumen')
    elif product.get('sale_mode')=='unit': parts.append('Por unidad')
    elif product.get('presentation'):
        value=format(Decimal(product['presentation']),'f')
        if '.' in value: value=value.rstrip('0').rstrip('.')
        parts.append('Presentación '+value+' (unidad pendiente)')
    return ' · '.join(str(v) for v in parts if v)
