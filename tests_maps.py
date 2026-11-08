import tempfile
from pathlib import Path
from uuid import uuid4
from fastapi import FastAPI
from fastapi.testclient import TestClient
import maps_api

def test_maps():
    original=maps_api.DATABASE
    try:
        with tempfile.TemporaryDirectory() as folder:
            maps_api.DATABASE=Path(folder)/'maps.sqlite3'
            app=FastAPI();app.include_router(maps_api.router);client=TestClient(app)
            branch=str(uuid4())
            value={'version':2,'rows':2,'cols':2,'precision':1,'cells':[1,0,0,0],'shelves':[{'id':'z','name':'Zona 1','cells':[0]}],'assignments':{'p':'z'}}
            assert client.get('/api/maps').json()=={'features':['placements','region_entry','boundaries'],'maps':[]}
            response=client.put('/api/maps/'+branch,json={'expected_revision':0,'map':value});assert response.status_code==200,response.text
            assert response.json()['revision']==1
            assert client.put('/api/maps/'+branch,json={'expected_revision':0,'map':value}).json()['revision']==1
            changed={**value,'nextZone':2}
            assert client.put('/api/maps/'+branch,json={'expected_revision':0,'map':changed}).status_code==409
            assert client.put('/api/maps/'+branch,json={'expected_revision':1,'map':changed}).json()['revision']==2
            invalid={**value,'assignments':{'p':'missing'}}
            assert client.put('/api/maps/'+branch,json={'expected_revision':2,'map':invalid}).status_code==422
            assert client.get('/api/maps').json()['maps'][0]['map']['assignments']=={'p':'z'}
            located={**changed,'shelves':[{**changed['shelves'][0],'entry':'last'}],'placements':{'p':{'cell':0,'order':2}}}
            assert client.put('/api/maps/'+branch,json={'expected_revision':2,'map':located}).status_code==200
            assert client.get('/api/maps').json()['maps'][0]['map']['shelves'][0]['entry']=='last'
            assert client.get('/api/maps').json()['maps'][0]['map']['placements']=={'p':{'cell':0,'order':2}}
            assert client.put('/api/maps/'+branch,json={'expected_revision':3,'map':{**located,'placements':{'p':{'cell':1,'order':0}}}}).status_code==422
            assert client.put('/api/maps/'+branch,json={'expected_revision':3,'map':{**located,'placements':{'missing':{'cell':0,'order':0}}}}).status_code==422
            assert client.put('/api/maps/'+branch,json={'expected_revision':3,'map':{**located,'placements':{'p':{'cell':0,'order':-1}}}}).status_code==422


            bounded={**located,'walls':['v:1:0'],'access':{'0':['east']}}
            assert client.put('/api/maps/'+branch,json={'expected_revision':3,'map':bounded}).status_code==200
            stored=client.get('/api/maps').json()['maps'][0]['map']
            assert stored['walls']==bounded['walls'] and stored['access']==bounded['access']
            for bad in [{'walls':['v:3:0']},{'walls':['h:01:0']},{'walls':['h:0:0','h:0:0']},{'access':{'1':['east']}},{'access':{'0':['east','east']}},{'access':{'0':['invalid']}}]:
                assert client.put('/api/maps/'+branch,json={'expected_revision':4,'map':{**bounded,**bad}}).status_code==422

    finally: maps_api.DATABASE=original

if __name__=='__main__':
    test_maps();print('OK: shared storage, revisions, retry, conflict protection, assignment validation.')
