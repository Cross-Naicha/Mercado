import tempfile
from pathlib import Path
from uuid import uuid4
from fastapi import FastAPI
from fastapi.testclient import TestClient
import maps_api
import availability_api

def test_availability():
    original=maps_api.DATABASE
    try:
        with tempfile.TemporaryDirectory() as directory:
            maps_api.DATABASE=Path(directory)/'maps.sqlite3'
            app=FastAPI();app.include_router(maps_api.router);app.include_router(availability_api.router);client=TestClient(app)
            branch,other,product,second=map(lambda _:str(uuid4()),range(4))
            def send(status,ids=None,revisions=None,operation=None):
                return client.post('/api/availability',json={'operation_id':operation or str(uuid4()),'branch_id':branch,'product_ids':ids or [product],'status':status,'expected_revisions':revisions or {}})
            operation=str(uuid4());response=send('unavailable',operation=operation);assert response.status_code==200,response.text
            record=response.json()['records'][0];assert record['status']=='unavailable' and record['confirmed_at']
            assert send('unavailable',operation=operation).json()==response.json()
            assert send('available').status_code==409
            assert send('available',ids=[product,second],revisions={product:0}).status_code==409
            assert len(client.get('/api/availability').json()['records'])==1
            assert send('unknown',revisions={product:1}).json()['records'][0]['confirmed_at'] is None
            grid={'version':2,'rows':1,'cols':1,'precision':1,'cells':[1],'shelves':[{'id':'z','name':'A1','cells':[0]}],'assignments':{product:'z',second:'z'}}
            assert client.put('/api/maps/'+branch,json={'expected_revision':0,'map':grid}).status_code==200
            records={r['product_id']:r for r in client.get('/api/availability').json()['records']}
            assert records[product]['status']=='unknown' # Explicit availability overrides legacy inference.
            assert records[second]['status']=='available'
            grid['shelves']=[];grid['assignments']={}
            assert client.put('/api/maps/'+branch,json={'expected_revision':1,'map':grid}).status_code==200
            records={r['product_id']:r for r in client.get('/api/availability').json()['records']}
            assert records[second]['status']=='available' # No dependency on zones.
            assert send('unavailable',ids=[product,second],revisions={product:2,second:1}).status_code==200
            assert client.post('/api/availability',json={'operation_id':str(uuid4()),'branch_id':other,'product_ids':[product],'status':'available'}).status_code==200
            records=client.get('/api/availability').json()['records'];assert len(records)==3
            assert next(r for r in records if r['branch_id']==branch and r['product_id']==product)['status']=='unavailable'
            assert next(r for r in records if r['branch_id']==other)['status']=='available'
    finally: maps_api.DATABASE=original

if __name__=='__main__':
    test_availability();print('OK: availability independent of zones, per branch, timestamps, unknown state, legacy inference, retries, atomic bulk and conflict protection.')
