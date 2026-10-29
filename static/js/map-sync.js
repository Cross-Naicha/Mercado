// Revisions prevent an offline copy from silently replacing another device's changes.
(function(){
    const api=window.mercadoMapProducts,el=id=>document.getElementById('map_sync_'+id);
    const prefix='mercado-branch-map-v1:',metaKey=id=>'mercado-map-sync-v1:'+id;
    let running=false,timer=null,conflicts=new Map();
    const encode=value=>JSON.stringify(api.validate(value));
    const metadata=id=>JSON.parse(localStorage.getItem(metaKey(id))||'null');
    function acknowledge(id,revision,base){localStorage.setItem(metaKey(id),JSON.stringify({revision,base}));}
    function showConflicts(){
        const current=api.context().branch;el('conflict').hidden=!conflicts.has(current);
        if(conflicts.size)el('status').textContent='Hay '+conflicts.size+' mapa(s) con cambios de otro dispositivo. Elegí la sucursal para resolverlos.';
    }
    const empty=value=>!value.cells.some(Boolean)&&!value.shelves.length&&!Object.keys(value.assignments||{}).length;
    function backup(id,value){localStorage.setItem('mercado-map-backup:'+id+':'+Date.now(),JSON.stringify(value));}
    function canReceive(id){
        if(api.context().branch!==id)return true;
        return api.canReceive();
    }
    async function sync(){
        if(running)return;running=true;clearTimeout(timer);el('status').textContent='Sincronizando mapas con el servidor…';
        try {
            const response=await serverRequest('/api/maps');
            if(!Array.isArray(response.maps))throw Error('Respuesta de mapas inválida');
            const remote=new Map(response.maps.map(r=>[r.branch_id,r]));
            const ids=new Set(remote.keys());
            for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(prefix)&&/^[0-9a-f-]{36}$/i.test(k.slice(prefix.length)))ids.add(k.slice(prefix.length));}
            let pending=false;
            for(const id of ids){
                const raw=localStorage.getItem(api.storageKey(id)),local=raw?encode(JSON.parse(raw)):null,record=remote.get(id),meta=metadata(id),server=record?encode(record.map):null;
                if(local===server){if(record)acknowledge(id,record.revision,server);conflicts.delete(id);continue;}
                const migratingLocal=!meta&&record&&local!==null&&empty(JSON.parse(server))&&!empty(JSON.parse(local));
                const migratingRemote=!meta&&record&&local!==null&&empty(JSON.parse(local))&&!empty(JSON.parse(server));
                const dirty=local!==null&&(!meta||local!==meta.base)&&!migratingRemote;
                if(dirty){
                    if(record&&!migratingLocal&&(!meta||record.revision!==meta.revision)){conflicts.set(id,record);continue;}
                    if(migratingLocal)backup(id,record.map);
                    const result=await serverRequest('/api/maps/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_revision:migratingLocal?record.revision:(meta?.revision||0),map:JSON.parse(local)})});
                    acknowledge(id,result.revision,local);conflicts.delete(id);
                    if(encode(JSON.parse(localStorage.getItem(api.storageKey(id))))!==local)pending=true;
                }else if(record){
                    if(!canReceive(id)){pending=true;continue;}
                    if(migratingRemote)backup(id,JSON.parse(local));
                    localStorage.setItem(api.storageKey(id),server);acknowledge(id,record.revision,server);conflicts.delete(id);api.receive(id,JSON.parse(server));
                }
            }
            el('status').textContent=pending?'Hay cambios pendientes; se sincronizarán automáticamente.':'Mapas y asignaciones sincronizados con el servidor.';
            showConflicts();
        }catch(error){el('status').textContent=error.status===409?'El mapa cambió en otro dispositivo. Volvé a sincronizar para revisar ambas versiones.':'Sin sincronizar: '+error.message+'. Los cambios locales se conservan.';}
        finally{running=false;}
    }
    async function resolve(useLocal){
        if(running)return;const id=api.context().branch,remote=conflicts.get(id);if(!remote)return;
        running=true;
        try{
            const raw=localStorage.getItem(api.storageKey(id));
            if(useLocal){
                backup(id,remote.map);const local=encode(JSON.parse(raw));
                const result=await serverRequest('/api/maps/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_revision:remote.revision,map:JSON.parse(local)})});
                acknowledge(id,result.revision,local);
            }else{
                if(!canReceive(id)){el('status').textContent='Terminá o cancelá la selección y la edición de etiquetas antes de cargar la versión del servidor.';return;}
                backup(id,JSON.parse(raw));const server=encode(remote.map);localStorage.setItem(api.storageKey(id),server);acknowledge(id,remote.revision,server);api.receive(id,JSON.parse(server));
            }
            conflicts.delete(id);showConflicts();el('status').textContent='Versión elegida guardada. Se conservó un respaldo local de la otra versión.';
        }catch(error){el('status').textContent='No se pudo resolver: '+error.message+'. Las versiones se conservan.';}
        finally{running=false;}
    }
    window.MercadoMapSync={sync};el('local').onclick=()=>resolve(true);el('remote').onclick=()=>resolve(false);
    document.addEventListener('mercado-map-saved',()=>{clearTimeout(timer);timer=setTimeout(sync,700);});
    document.addEventListener('mercado-map-open',()=>void sync());
    document.addEventListener('mercado-map-change',showConflicts);
    window.addEventListener('online',()=>void sync());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void sync();});
    setInterval(()=>{if(!document.hidden)void sync();},30000);
    setTimeout(sync,1000);
})();
