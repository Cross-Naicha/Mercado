"""Pruebas de integración: registros propios temporales, eliminados al terminar."""
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from fastapi.testclient import TestClient
import functions
from test import app


def main():
    client = TestClient(app)
    product_id, purchase_id = str(uuid4()), str(uuid4())
    shelf_id=str(uuid4())
    special_shelf_id=str(uuid4())
    product_op, purchase_op = str(uuid4()), str(uuid4())
    market = 'TEST-' + str(uuid4())
    product = {'operation_id': product_op, 'entity_id': product_id, 'kind': 'product', 'payload': {'product': 'Prueba sincronización', 'brand': 'Temporal', 'presentation': '0.220000'}}
    purchase = {'operation_id': purchase_op, 'entity_id': purchase_id, 'kind': 'purchase', 'payload': {'product_id': product_id, 'quantity': '3.000000', 'price': '666.6667', 'total_paid': '2000.0000', 'is_promotion': True, 'market': market, 'occurred_at': '2026-06-02T01:30:00Z', 'event_timezone': 'America/Buenos_Aires'}}
    purchase['payload']['promotion_description']='Oferta de prueba'
    try:
        assert client.post('/api/sync', json=purchase).status_code == 409
        first = client.post('/api/sync', json=product)
        assert first.status_code == 200, first.text
        assert client.post('/api/sync', json=product).json() == first.json()
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: client.post('/api/sync', json=purchase), range(2)))
        assert all(r.status_code == 200 for r in responses), [r.text for r in responses]
        assert responses[0].json() == responses[1].json()
        assert client.post('/api/sync', json=purchase).json() == responses[0].json()
        changed = {**purchase, 'payload': {**purchase['payload'], 'market': market + '-otro'}}
        assert client.post('/api/sync', json=changed).status_code == 409
        invalid = {**purchase, 'operation_id': str(uuid4()), 'payload': {**purchase['payload'], 'quantity': '-1'}}
        assert client.post('/api/sync', json=invalid).status_code == 422
        c, db = functions.connect_to_database(True)
        try:
            c.execute('SELECT occurred_on FROM purchases WHERE id=%s', (purchase_id,))
            assert str(c.fetchone()['occurred_on']) == '2026-06-01'
            c.execute('SELECT quantity,total_paid FROM purchase_lines WHERE purchase_id=%s', (purchase_id,))
            row = c.fetchone()
            assert str(row['quantity']) == '3.000000' and str(row['total_paid']) == '2000.0000'
            c.execute('SELECT promotion_description FROM purchase_lines WHERE purchase_id=%s',(purchase_id,));assert c.fetchone()['promotion_description']=='Oferta de prueba'
            c.execute('SELECT COUNT(*) AS n FROM instances WHERE market=%s', (market,))
            assert c.fetchone()['n'] == 1
        finally:
            functions.close_database_connection(db, c)
        assert any(p['id'] == product_id for p in client.get('/api/catalog').json())
        latest=next(p for p in client.get('/api/catalog').json() if p['id']==product_id)
        assert latest['last_price']=='666.6667' and latest['last_price_promotion']==1
        assert latest['last_price_date']=='2026-06-01' and latest['normal_price'] is None
        edit={'operation_id':str(uuid4()),'entity_id':product_id,'kind':'product_edit','payload':{'product_id':product_id,'expected_revision':1,'product':'Nombre corregido','brand':'Marca corregida','ptype':'Tipo','psubtype':'Subtipo','category':'Categoría'}}
        saved=client.post('/api/sync',json=edit)
        assert saved.status_code==200,saved.text
        assert client.post('/api/sync',json=edit).json()==saved.json()
        assert client.post('/api/sync',json={**edit,'operation_id':str(uuid4())}).status_code==409
        edited=next(p for p in client.get('/api/catalog').json() if p['id']==product_id)
        assert edited['product_name']=='Nombre corregido' and edited['product_class']=='Categoría' and edited['revision']==2
        assert edited['presentation']=='0.220000'
        label_edit={**edit,'operation_id':str(uuid4()),'payload':{**edit['payload'],'expected_revision':2,'display_label':'Mi producto favorito'}}
        response=client.post('/api/sync',json=label_edit)
        assert response.status_code==200,response.text
        labeled=next(p for p in client.get('/api/catalog').json() if p['id']==product_id)
        assert labeled['display_label']=='Mi producto favorito' and labeled['product_all']=='Mi producto favorito'
        label_edit={**label_edit,'operation_id':str(uuid4()),'payload':{**label_edit['payload'],'expected_revision':3,'display_label':''}}
        assert client.post('/api/sync',json=label_edit).status_code==200
        automatic=next(p for p in client.get('/api/catalog').json() if p['id']==product_id)
        assert automatic['display_label'] is None and 'Nombre corregido' in automatic['product_all']
        configured={**label_edit,'operation_id':str(uuid4()),'payload':{**label_edit['payload'],'expected_revision':4,'sale_mode':'package','content_unit':'g','package_content':'500.000000'}}
        response=client.post('/api/sync',json=configured)
        assert response.status_code==200,response.text
        final=next(p for p in client.get('/api/catalog').json() if p['id']==product_id)
        assert final['unit_status']=='confirmed' and final['revision']==5 and final['presentation']=='0.500000'
        shelf={'operation_id':str(uuid4()),'entity_id':shelf_id,'kind':'shelf_price','payload':{'product_id':product_id,'price':'949.9900','price_basis':'package','promotion':'2x1','market':market,'occurred_at':'2026-10-01T12:00:00Z','event_timezone':'America/Buenos_Aires'}}
        response=client.post('/api/sync',json=shelf)
        assert response.status_code==200,response.text
        assert client.post('/api/sync',json=shelf).json()==response.json()
        observed=next(p for p in client.get('/api/catalog').json() if p['id']==product_id)
        assert observed['last_price']=='474.9950' and observed['last_list_price']=='949.9900'
        assert observed['last_price_source']=='shelf' and observed['last_price_conditions']=='2x1'
        c,db=functions.connect_to_database(True)
        try:
            c.execute('SELECT COUNT(*) AS n FROM price_observations WHERE product_id=%s',(product_id,));assert c.fetchone()['n']==1
            c.execute('SELECT COUNT(*) AS n FROM instances WHERE market=%s',(market,));assert c.fetchone()['n']==1
            c.execute('SELECT COUNT(*) AS n FROM stock_lots WHERE product_id=%s',(product_id,));assert c.fetchone()['n']==0
        finally: functions.close_database_connection(db,c)
        invalid={**shelf,'operation_id':str(uuid4()),'entity_id':str(uuid4()),'payload':{**shelf['payload'],'price_basis':'kg'}}
        assert client.post('/api/sync',json=invalid).status_code==409
        special={**shelf,'operation_id':str(uuid4()),'entity_id':special_shelf_id,'payload':{**shelf['payload'],'price':None,'promotion':'special','special_quantity':4,'special_total':'1000.00','promotion_description':'4 turrones por $1.000','occurred_at':'2026-10-02T12:00:00Z'}}
        response=client.post('/api/sync',json=special);assert response.status_code==200,response.text
        assert client.post('/api/sync',json=special).json()==response.json()
        latest=next(p for p in client.get('/api/catalog').json() if p['id']==product_id)
        assert latest['last_price']=='250.0000' and latest['last_offer_quantity']=='4.000000' and latest['last_offer_total']=='1000.0000'
        assert latest['last_price_description']=='4 turrones por $1.000' and latest['last_list_price'] is None
        invalid={**special,'operation_id':str(uuid4()),'entity_id':str(uuid4()),'payload':{**special['payload'],'promotion_description':''}}
        assert client.post('/api/sync',json=invalid).status_code==422
        print('OK: dependencias, reintentos concurrentes, conflictos, validación, decimales y fecha real.')
    finally:
        c, db = functions.connect_to_database()
        try:
            c.execute('DELETE FROM sync_receipts WHERE entity_id IN (%s,%s,%s,%s)', (product_id,purchase_id,shelf_id,special_shelf_id))
            c.execute('DELETE FROM purchase_lines WHERE purchase_id=%s', (purchase_id,))
            c.execute('DELETE FROM purchases WHERE id=%s', (purchase_id,))
            c.execute('DELETE FROM instances WHERE market=%s', (market,))
            c.execute('DELETE FROM price_observations WHERE product_id=%s',(product_id,))
            c.execute('DELETE FROM store_branches WHERE legacy_market=%s', (market,))
            c.execute('SELECT legacy_product_id FROM catalog_products WHERE id=%s', (product_id,))
            row = c.fetchone()
            c.execute('DELETE FROM catalog_products WHERE id=%s', (product_id,))
            if row:
                c.execute('DELETE FROM products WHERE id_product=%s', (row[0],))
            db.commit()
        finally:
            functions.close_database_connection(db, c)


if __name__ == '__main__':
    main()
