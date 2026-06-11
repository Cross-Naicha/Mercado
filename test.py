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

cursor, connection = functions.connect_to_database()

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
    return FileResponse("sw.js")

@app.post("/add_product")
def create_product_endopoint(product: Product):
    return functions.create_product(product)

@app.post("/add_instance")
def create_instance_endpoint(instance: Instance):
    return functions.create_instance(instance)

@app.get("/get_products")
def read_product_endpoint():
    return functions.read_product()