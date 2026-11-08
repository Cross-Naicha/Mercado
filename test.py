import functions

from datetime import date

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

from sync_api import Operation, apply_operation, get_catalog
from fastapi import HTTPException
from pydantic import ValidationError
import mysql.connector
from stock_api import stock_snapshot
from database_backup import export_backup
from shopping_api import shopping_snapshot
from sync_diagnostics import router as sync_diagnostics_router, record_failure, clear_failure
import logging

sync_logger = logging.getLogger(__name__)

class Product(BaseModel):
    product: str
    pclass: str | None = None
    brand: str
    ptype: str | None = None
    psubtype: str | None = None
    presentation: float

class Instance(BaseModel):
    product_id: int
    quantity: float
    price: float
    is_promotion: int
    market: str

app.mount("/static", StaticFiles(directory="static"),name="static")

@app.get("/")
def root():
    return {"Sistema funcinando": "Bienvenido al sistema de gestion de inventario del mercado!"}

@app.get("/home")
def get_form():
    return FileResponse("index.html")

@app.get("/sw.js")
def service_worker():
    return FileResponse("sw.js",headers={'Cache-Control':'no-cache'})

@app.post("/add_product")
def create_product_endopoint(product: Product):
    return functions.create_product(product)

@app.post("/add_instance")
def create_instance_endpoint(instance: Instance):
    return functions.create_instance(instance)

@app.get("/get_products")
def read_product_endpoint():
    return functions.read_product()

@app.get('/api/catalog')
def catalog_endpoint():
    try:
        rows=get_catalog()
        from availability_api import snapshot as availability_snapshot
        by_product={}
        for record in availability_snapshot()['records']:
            by_product.setdefault(record['product_id'],{})[record['branch_id']]={key:record[key] for key in ('status','confirmed_at','revision')}
        for row in rows: row['availability_by_branch']=by_product.get(str(row['id']),{})
        return rows
    except mysql.connector.Error:
        raise HTTPException(503, 'Base de datos no disponible')

@app.post('/api/sync')
def sync_endpoint(operation: Operation):
    try:
        result = apply_operation(operation)
    except ValidationError as error:
        detail = str(error)
        try: record_failure(operation, 422, detail)
        except Exception: sync_logger.exception('No se pudo registrar el error de sincronización')
        raise HTTPException(422, detail)
    except HTTPException as error:
        try: record_failure(operation, error.status_code, error.detail)
        except Exception: sync_logger.exception('No se pudo registrar el error de sincronización')
        raise
    except mysql.connector.Error:
        detail = 'No se pudo confirmar el guardado; reintentar'
        try: record_failure(operation, 503, detail)
        except Exception: sync_logger.exception('No se pudo registrar el error de sincronización')
        raise HTTPException(503, detail)
    try: clear_failure(operation.operation_id)
    except Exception: sync_logger.exception('No se pudo limpiar el error de sincronización')
    return result


app.include_router(sync_diagnostics_router)

@app.get('/api/stock')
def stock_endpoint():
    try: return stock_snapshot()
    except mysql.connector.Error: raise HTTPException(503,'Stock no disponible')

@app.get('/api/backup')
def backup_endpoint():
    try: return export_backup()
    except mysql.connector.Error: raise HTTPException(503,'No se pudo generar el respaldo')

@app.get('/api/shopping')
def shopping_endpoint():
    try: return shopping_snapshot()
    except mysql.connector.Error: raise HTTPException(503,'Información de compras no disponible')
from maps_api import router as maps_router
app.include_router(maps_router)

from availability_api import router as availability_router
app.include_router(availability_router)
