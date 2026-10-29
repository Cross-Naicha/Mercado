"""Prueba de regularidad con un producto temporal propio."""
from uuid import uuid4
from fastapi.testclient import TestClient
from test import app
import functions

client=TestClient(app)
product_id=str(uuid4())
entities=[product_id]

def send(kind,payload,entity=None):
    entity=entity or str(uuid4());entities.append(entity)
    response=client.post('/api/sync',json={'operation_id':str(uuid4()),'entity_id':entity,'kind':kind,'payload':payload})
    assert response.status_code==200,response.text

def product():
    return next(row for row in client.get('/api/catalog').json() if row['id']==product_id)

try:
    send('product',{'product':'Prueba regularidad '+product_id,'brand':'Prueba','presentation':'1','stock_pattern':'irregular','storage_location':'Cocina','storage_detail':'Cajones'},product_id)
    row=product();assert row['stock_pattern']=='irregular' and not row['storage_location'] and row['storage_locations']==[]
    base={'product_id':product_id,'product':row['product_name'],'brand':'Prueba'}
    send('product_edit',{**base,'expected_revision':row['revision'],'storage_location':'Cocina','storage_detail':'Cajones','storage_locations':[{'location':'Cocina','detail':'Cajones'}]})
    row=product();assert row['stock_pattern']=='irregular' and not row['storage_location'] and row['storage_locations']==[]
    send('product_edit',{**base,'expected_revision':row['revision'],'stock_pattern':'stable'})
    row=product();assert row['stock_pattern']=='stable'
    send('product_edit',{**base,'expected_revision':row['revision'],'storage_location':'Cocina','storage_detail':'Cajones','storage_locations':[{'location':'Cocina','detail':'Cajones'}]})
    row=product();assert row['storage_locations']
    send('product_edit',{**base,'expected_revision':row['revision'],'stock_pattern':'irregular'})
    row=product();assert row['stock_pattern']=='irregular' and not row['storage_detail'] and row['storage_locations']==[]
    print('OK: creación y edición, persistencia, limpieza de ubicaciones y compatibilidad con operaciones anteriores.')
finally:
    cursor,db=functions.connect_to_database()
    try:
        cursor.execute('SELECT legacy_product_id FROM catalog_products WHERE id=%s',(product_id,));row=cursor.fetchone()
        for entity in entities:cursor.execute('DELETE FROM sync_receipts WHERE entity_id=%s',(entity,))
        cursor.execute('DELETE FROM catalog_products WHERE id=%s',(product_id,))
        if row:cursor.execute('DELETE FROM products WHERE id_product=%s',(row[0],))
        db.commit()
    finally:functions.close_database_connection(db,cursor)
