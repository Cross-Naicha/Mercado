// Shared product attribute; no dependency on a map or a zone identity.
(function(){
    const storage='mercado-product-availability-v1',labels={unknown:'Sin confirmar',available:'Disponible',unavailable:'No disponible'};
    const key=(branch,product)=>branch+':'+product;
    const read=()=>JSON.parse(localStorage.getItem(storage)||'{"records":{},"pending":[]}');
    const write=state=>localStorage.setItem(storage,JSON.stringify(state));
    const emit=()=>document.dispatchEvent(new Event('mercado-availability-change'));
    async function mutate(action){const run=()=>{const state=read();const result=action(state);write(state);return result;};return navigator.locks?navigator.locks.request('mercado-availability-store',run):run();}
    function projected(state=read()){
        const records={...state.records};
        for(const op of state.pending){const old=records[key(op.branch_id,op.product_ids[0])];records[key(op.branch_id,op.product_ids[0])]={branch_id:op.branch_id,product_id:op.product_ids[0],status:op.status,revision:op.expected_revisions[op.product_ids[0]]+1,confirmed_at:op.status==='unknown'?null:op.created_at,pending:true,error:op.error||old?.error||null,server_status:state.records[key(op.branch_id,op.product_ids[0])]?.status||'unknown'};}
        return records;
    }
    let timer,running=false;
    function status(message){const el=document.getElementById('map_availability_sync_status');if(el)el.textContent=message;}
    async function set(branch,products,value){
        if(!branch||!products.length||!Object.hasOwn(labels,value))throw Error('Disponibilidad inválida');
        await mutate(state=>{
            // A deliberate new confirmation resolves only conflicts for these products.
            const ids=new Set(products),conflicted=new Set(state.pending.filter(op=>op.error&&op.branch_id===branch).map(op=>op.product_ids[0]));state.pending=state.pending.filter(op=>!(op.branch_id===branch&&ids.has(op.product_ids[0])&&conflicted.has(op.product_ids[0])));
            const view=projected(state);
            for(const product of ids){const old=view[key(branch,product)];const revision=old?.revision||0;state.pending.push({operation_id:crypto.randomUUID(),branch_id:branch,product_ids:[product],status:value,expected_revisions:{[product]:revision},created_at:new Date().toISOString()});}
        });
        status('Disponibilidad guardada en este dispositivo; pendiente de sincronizar.');emit();clearTimeout(timer);timer=setTimeout(sync,300);
    }
    async function syncRun(){
        if(running)return;running=true;
        const previous=JSON.stringify(projected());
        try{
            const response=await serverRequest('/api/availability');if(!Array.isArray(response.records))throw Error('Respuesta de disponibilidad inválida');
            await mutate(state=>{state.records=Object.fromEntries(response.records.map(r=>[key(r.branch_id,r.product_id),r]));});
            const blocked=new Set();
            for(const op of read().pending){
                const k=key(op.branch_id,op.product_ids[0]);if(blocked.has(k))continue;
                if(op.error){blocked.add(k);continue;}
                try{
                    const {created_at,error,...body}=op;const result=await serverRequest('/api/availability',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
                    await mutate(state=>{for(const record of result.records)state.records[key(record.branch_id,record.product_id)]=record;state.pending=state.pending.filter(p=>p.operation_id!==op.operation_id);});
                }catch(error){
                    if(error.status===409){await mutate(state=>{const pending=state.pending.find(p=>p.operation_id===op.operation_id);if(pending)pending.error='Cambió en otro dispositivo. Volvé a confirmar el estado para resolverlo.';});blocked.add(k);}
                    else throw error;
                }
            }
            const pending=read().pending;
            status(pending.some(op=>op.error)?'Hay cambios de disponibilidad de otro dispositivo. Revisá los productos marcados y volvé a confirmar su estado.':pending.length?pending.length+' cambios de disponibilidad pendientes.':'Disponibilidad sincronizada con el servidor.');if(JSON.stringify(projected())!==previous)emit();
        }catch(error){status('Disponibilidad sin sincronizar: '+error.message+'. Los cambios locales se conservan.');}
        finally{running=false;}
    }
    async function sync(){
        if(navigator.locks)return navigator.locks.request('mercado-availability-sync',{ifAvailable:true},lock=>lock?syncRun():undefined);
        return syncRun();
    }
    window.MercadoAvailability={labels,get:(branch,product)=>projected()[key(branch,product)]||{status:'unknown',confirmed_at:null,revision:0},forBranch:branch=>Object.fromEntries(Object.values(projected()).filter(r=>r.branch_id===branch).map(r=>[r.product_id,r])),forProduct:product=>Object.fromEntries(Object.values(projected()).filter(r=>r.product_id===product).map(r=>[r.branch_id,r])),set,sync};
    document.addEventListener('mercado-map-open',()=>void sync());window.addEventListener('online',()=>void sync());window.addEventListener('storage',event=>{if(event.key===storage)emit();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)void sync();});
    setInterval(()=>{if(!document.hidden)void sync();},30000);setTimeout(sync,1000);
})();
