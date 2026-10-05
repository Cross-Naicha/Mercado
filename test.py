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
        return get_catalog()
    except mysql.connector.Error:
        raise HTTPException(503, 'Base de datos no disponible')

@app.post('/api/sync')
def sync_endpoint(operation: Operation):
    try:
        return apply_operation(operation)
    except ValidationError as error:
        raise HTTPException(422, str(error))
    except mysql.connector.Error:
        raise HTTPException(503, 'No se pudo confirmar el guardado; reintentar')

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
