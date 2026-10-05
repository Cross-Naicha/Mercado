from uuid import uuid4
from fastapi.testclient import TestClient
from test import app
import functions


def main():
    client=TestClient(app); product=str(uuid4()); second=str(uuid4()); branch=str(uuid4()); ops=[]
    code='00'+str(uuid4().int)[:20]
    def send(kind,payload,entity=None):
        op={'operation_id':str(uuid4()),'entity_id':entity or str(uuid4()),'kind':kind,'payload':payload};ops.append(op['operation_id']);return client.post('/api/sync',json=op),op
    try:
        response,op=send('product',{'product':'TEST compras','brand':'Temporal','presentation':'1','barcode':code},product);assert response.status_code==200,response.text
        assert client.post('/api/sync',json=op).json()==response.json()
        response,_=send('product',{'product':'TEST alternativa','brand':'Temporal','presentation':'1'},second);assert response.status_code==200
        response,_=send('barcode',{'product_id':second,'code':code});assert response.status_code==409
        response,_=send('branch',{'name':'TEST sucursal','address':'Local temporal','expected_revision':0},branch);assert response.status_code==200,response.text
        map={'branch_id':branch,'nodes':[{'id':'e','label':'Entrada'},{'id':'a','label':'Pasillo 1'},{'id':'f','label':'Fríos'},{'id':'c','label':'Cajas'}],'edges':[{'source':'e','target':'a','distance':'10'},{'source':'a','target':'f','distance':'5'},{'source':'f','target':'c','distance':'10'}],'entrance':'e','checkout':'c'}
        response,_=send('shopping_document',{'kind':'map','owner_id':branch,'expected_revision':0,'data':map},branch);assert response.status_code==200,response.text
        response,_=send('shopping_document',{'kind':'map','owner_id':branch,'expected_revision':0,'data':map},branch);assert response.status_code==409
        location={'branch_id':branch,'product_id':product,'aisle':'1','aisle_order':1,'shelf':'Al medio','node_id':'a','confirmed_on':'2026-10-01'}
        response,_=send('shopping_document',{'kind':'location','owner_id':branch,'expected_revision':0,'data':location});assert response.status_code==200,response.text
        response,_=send('shopping_document',{'kind':'location','owner_id':branch,'expected_revision':0,'data':{**location,'node_id':'noexiste'}});assert response.status_code==422
        response,_=send('shopping_document',{'kind':'group','owner_id':branch,'expected_revision':0,'data':{'name':'Alternativas','product_ids':[product,second]}});assert response.status_code==200,response.text
        state=client.get('/api/shopping').json()
        assert any(b['code']==code and b['product_id']==product for b in state['barcodes'])
        assert sum(d['owner_id']==branch for d in state['documents'])==3
        print('OK: código con ceros, conflicto, reintento, sucursal, mapa, revisión, ubicación y equivalencias.')
    finally:
        c,db=functions.connect_to_database()
        try:
            c.execute('DELETE FROM shopping_documents WHERE owner_id=%s',(branch,))
            c.execute('DELETE FROM product_barcodes WHERE product_id IN (%s,%s)',(product,second))
            c.execute('DELETE FROM store_branches WHERE id=%s',(branch,))
            c.execute('SELECT legacy_product_id FROM catalog_products WHERE id IN (%s,%s)',(product,second));old=[r[0] for r in c.fetchall()]
            c.execute('DELETE FROM catalog_products WHERE id IN (%s,%s)',(product,second))
            for id in old:c.execute('DELETE FROM products WHERE id_product=%s',(id,))
            for id in ops:c.execute('DELETE FROM sync_receipts WHERE operation_id=%s',(id,))
            db.commit()
        finally:functions.close_database_connection(db,c)


if __name__=='__main__':main()
