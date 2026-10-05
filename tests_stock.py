"""Integración del stock con datos temporales propios, eliminados al finalizar."""
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
from decimal import Decimal
from fastapi.testclient import TestClient
from test import app
import functions


def main():
    client=TestClient(app); product=str(uuid4()); fractional=str(uuid4()); market='TEST-STOCK-'+str(uuid4()); ops=[]
    def send(kind,payload,entity=None,operation=None):
        operation=operation or str(uuid4()); ops.append(operation)
        op={'operation_id':operation,'entity_id':entity or str(uuid4()),'kind':kind,'payload':payload}
        return client.post('/api/sync',json=op),op
    time={'occurred_at':'2026-10-01T15:00:00Z','event_timezone':'America/Buenos_Aires'}
    try:
        response,_=send('product',{'product':'Stock temporal','brand':'Test','presentation':'0.5','sale_mode':'package','content_unit':'g','package_content':'500'},product)
        assert response.status_code==200,response.text
        response,initial=send('stock_initial',{'product_id':product,'quantity':'1000','unit':'g','location':'Despensa','expires_on':'2026-11-01',**time})
        assert response.status_code==200,response.text
        lot=initial['entity_id']
        assert client.post('/api/sync',json=initial).status_code==200
        response,purchase=send('purchase',{'product_id':product,'quantity':'2','price':'1000','total_paid':'2000','is_promotion':False,'market':market,'add_to_stock':True,'stock_quantity':'1000','stock_unit':'g','product_revision':1,**time})
        assert response.status_code==200,response.text
        move={'lot_id':lot,'quantity':'750','reason':'consume',**time}
        a={'operation_id':str(uuid4()),'entity_id':str(uuid4()),'kind':'stock_move','payload':move}
        b={'operation_id':str(uuid4()),'entity_id':str(uuid4()),'kind':'stock_move','payload':move}
        ops.extend([a['operation_id'],b['operation_id']])
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses=list(pool.map(lambda op: client.post('/api/sync',json=op),[a,b]))
        assert sorted(r.status_code for r in responses)==[200,409],[r.text for r in responses]
        winner=a if responses[0].status_code==200 else b
        response,_=send('stock_move',{'lot_id':lot,'quantity':'0','reason':'reversal','reverses_id':winner['entity_id'],**time})
        assert response.status_code==200,response.text
        response,_=send('stock_move',{'lot_id':lot,'quantity':'0','reason':'reversal','reverses_id':winner['entity_id'],**time})
        assert response.status_code==409
        response,_=send('stock_move',{'lot_id':lot,'quantity':'100','reason':'discard',**time}); assert response.status_code==200,response.text
        response,_=send('stock_move',{'lot_id':lot,'quantity':'0','reason':'open',**time}); assert response.status_code==200,response.text
        response,_=send('settings',{'product_id':product,'expected_revision':1,'sale_mode':'package','content_unit':'ml','package_content':'500'}); assert response.status_code==409
        response,_=send('minimum',{'product_id':product,'quantity':'2500','expected_revision':0}); assert response.status_code==200,response.text
        response,_=send('minimum',{'product_id':product,'quantity':'3000','expected_revision':0}); assert response.status_code==409
        response,_=send('product',{'product':'Fiambre temporal','brand':'Test','presentation':'1','sale_mode':'fractional','content_unit':'g','package_content':'1000'},fractional); assert response.status_code==200,response.text
        response,_=send('purchase',{'product_id':fractional,'quantity':'0.214','price':'15200','total_paid':'3252.8','is_promotion':False,'market':market,'add_to_stock':True,'stock_quantity':'214','stock_unit':'g','product_revision':1,**time}); assert response.status_code==200,response.text
        snapshot=client.get('/api/stock').json()
        ids=[l['id'] for l in snapshot['lots'] if l['product_id']==product]
        total=sum((Decimal(m['quantity']) for m in snapshot['movements'] if m['lot_id'] in ids),Decimal(0))
        assert total==1900,total
        ids=[l['id'] for l in snapshot['lots'] if l['product_id']==fractional]
        assert sum((Decimal(m['quantity']) for m in snapshot['movements'] if m['lot_id'] in ids),Decimal(0))==214
        print('OK: lotes, compra fija y fraccionada, consumo concurrente sin negativos, descartes, apertura, reverso, mínimos y unidades inmutables.')
    finally:
        c,db=functions.connect_to_database()
        try:
            c.execute('DELETE r FROM stock_movements r JOIN stock_lots l ON l.id=r.lot_id WHERE l.product_id IN (%s,%s) AND r.reverses_id IS NOT NULL',(product,fractional))
            c.execute('DELETE m FROM stock_movements m JOIN stock_lots l ON l.id=m.lot_id WHERE l.product_id IN (%s,%s)',(product,fractional))
            c.execute('DELETE FROM stock_lots WHERE product_id IN (%s,%s)',(product,fractional))
            c.execute('DELETE FROM stock_preferences WHERE product_id IN (%s,%s)',(product,fractional))
            c.execute('DELETE FROM purchase_lines WHERE product_id IN (%s,%s)',(product,fractional))
            c.execute('DELETE p FROM purchases p JOIN store_branches b ON b.id=p.branch_id WHERE b.legacy_market=%s',(market,))
            c.execute('DELETE FROM instances WHERE market=%s',(market,))
            c.execute('DELETE FROM store_branches WHERE legacy_market=%s',(market,))
            c.execute('SELECT legacy_product_id FROM catalog_products WHERE id IN (%s,%s)',(product,fractional)); legacy=[r[0] for r in c.fetchall()]
            c.execute('DELETE FROM catalog_products WHERE id IN (%s,%s)',(product,fractional))
            for id in legacy: c.execute('DELETE FROM products WHERE id_product=%s',(id,))
            for id in set(ops): c.execute('DELETE FROM sync_receipts WHERE operation_id=%s',(id,))
            db.commit()
        finally: functions.close_database_connection(db,c)


if __name__=='__main__': main()
