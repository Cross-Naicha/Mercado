let scanStream=null,scanTimer=null,editingLocation=null,scanGeneration=0;
async function shoppingState() {
    const state=await new Promise((resolve,reject) => {
        const tx=db.transaction(['shopping_cache','shopping_effects'],'readonly');
        const snapshot=tx.objectStore('shopping_cache').get('snapshot'),effects=tx.objectStore('shopping_effects').getAll();
        tx.oncomplete=() => resolve({snapshot:snapshot.result,effects:effects.result});
        tx.onerror=tx.onabort=() => reject(tx.error);
    });
    const snapshot=state.snapshot || {branches:[],barcodes:[],documents:[]};
    const branches=new Map(snapshot.branches.map(r => [r.id,r])),barcodes=new Map(snapshot.barcodes.map(r => [r.code,r])),documents=new Map(snapshot.documents.map(r => [r.id,r]));
    for (const effect of state.effects.sort((a,b) => a.sequence-b.sequence)) {
        if (effect.branch) branches.set(effect.branch.id,effect.branch);
        if (effect.barcode) barcodes.set(effect.barcode.code,effect.barcode);
        if (effect.document) documents.set(effect.document.id,effect.document);
    }
    return {branches:[...branches.values()],barcodes:[...barcodes.values()],documents:[...documents.values()]};
}
async function refreshShopping() {
    const snapshot=await serverRequest('/api/shopping');
    if (!Array.isArray(snapshot.documents) || !Array.isArray(snapshot.barcodes) || !Array.isArray(snapshot.branches) || !Array.isArray(snapshot.confirmed_operations)) throw new Error('Información de compras inválida');
    await localTransaction(['shopping_cache','shopping_effects'],tx => {
        tx.objectStore('shopping_cache').put({id:'snapshot',...snapshot});
        snapshot.confirmed_operations.forEach(id => tx.objectStore('shopping_effects').delete(id));
    });
}
async function shoppingEffect(op) {
    const p=op.payload,state=await shoppingState();
    if (op.kind==='barcode' || (op.kind==='product' && p.barcode)) {
        const code=p.code || p.barcode,product_id=op.kind==='product' ? op.entity_id : p.product_id;
        const old=state.barcodes.find(b => b.code===code);
        if (old && old.product_id!==product_id) throw new Error('Ese código ya pertenece a otro producto');
        return {sequence:op.sequence,barcode:{code,product_id}};
    }
    if (op.kind==='branch') return {sequence:op.sequence,branch:{id:op.entity_id,name:p.name,address:p.address,revision:p.expected_revision+1,location_confirmed:true}};
    if (op.kind==='shopping_document') return {sequence:op.sequence,document:{id:op.entity_id,kind:p.kind,owner_id:p.owner_id,payload:p.data,revision:p.expected_revision+1}};
    return null;
}
async function shoppingAction(action) {
    if (saving || !db) return; saving=true;
    try { await action(); await renderShopping(); void sync_pending(); }
    catch(error) { notice('No se guardó: '+error.message+'. Los datos se conservaron.'); }
    finally { saving=false; }
}
function validBarcode(value) {
    const code=String(value).trim();
    if (!/^[0-9A-Za-z._-]{1,80}$/.test(code)) throw new Error('Código inválido');
    return code;
}
async function findBarcode(code=$('barcode_value').value) {
    try {
        code=validBarcode(code); $('barcode_value').value=code;
        const state=await shoppingState(),products=await localRead('catalog');
        const match=state.barcodes.find(b => b.code===code),product=products.find(p => p.id===match?.product_id);
        if (product) {
            select_product(product.id,product.product_all,product.product_name,product.product_brand,product.product_ptype,product.product_psubtype,product.normal_price,product.normal_unit,product.presentation);
            notice('Código encontrado: '+product.product_all); openModuleSection('instances_section');
        } else {
            reset_form(); $('new_barcode').value=code;
            openModuleSection('register_section');
            notice('Código desconocido. Completá los datos del nuevo producto o asociá el código a uno existente.');
        }
    } catch(error) { notice(error.message); }
}
async function saveBarcode() {
    await shoppingAction(async () => {
        const product_id=$('assist_product').value;
        if (!product_id) throw new Error('Elegí un producto');
        await queueOperation('barcode',{product_id,code:validBarcode($('barcode_value').value)});
    });
}
async function detector() {
    if (!('BarcodeDetector' in window)) throw new Error('Este navegador no admite escaneo nativo. Podés escribir el código.');
    const supported=await BarcodeDetector.getSupportedFormats();
    const formats=['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf'].filter(f => supported.includes(f));
    if (!formats.length) throw new Error('No hay formatos compatibles; ingresá el código manualmente');
    return new BarcodeDetector({formats});
}
function stopScanner() {
    scanGeneration++;
    if (scanTimer) clearTimeout(scanTimer); scanTimer=null;
    if (scanStream) scanStream.getTracks().forEach(t => t.stop());
    scanStream=null; $('scan_video').srcObject=null; $('scan_video').hidden=true;
}
async function startScanner() {
    stopScanner();
    const generation=scanGeneration;
    try {
        const reader=await detector();
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('La cámara necesita HTTPS y permiso del navegador');
        const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
        if (generation!==scanGeneration) {stream.getTracks().forEach(t => t.stop());return;}
        scanStream=stream;
        $('scan_video').srcObject=scanStream; $('scan_video').hidden=false; await $('scan_video').play();
        const frame=async () => {
            if (!scanStream) return;
            try { const results=await reader.detect($('scan_video')); if (generation!==scanGeneration) return; if (results.length) { stopScanner(); await findBarcode(results[0].rawValue); return; } }
            catch(error) { stopScanner(); notice('No se pudo leer el código: '+error.message); return; }
            if (scanStream) scanTimer=setTimeout(frame,300);
        };
        void frame();
    } catch(error) { stopScanner(); notice(error.message); }
}
document.addEventListener('visibilitychange',() => { if (document.hidden) stopScanner(); });
window.addEventListener('pagehide',stopScanner);
async function scanBarcodePhoto(file) {
    if (!file) return;
    let bitmap;
    try { const reader=await detector(); bitmap=await createImageBitmap(file); const results=await reader.detect(bitmap); if (!results.length) throw new Error('No se encontró un código legible'); await findBarcode(results[0].rawValue); }
    catch(error) { notice(error.message); }
    finally { bitmap?.close(); }
}
let branchEditing=null,branchMenu=null,branchRevealed=null,branchFilter=null,branchFiltersOpen=false,shelfLocalsExpanded=false,purchaseLocalsExpanded=false;
async function renderShelfLocals(state) {
    return renderLocalOptions('shelf',state);
}
async function renderPurchaseLocals(state) {
    return renderLocalOptions('purchase',state);
}
async function renderLocalOptions(kind,state) {
    state=state || await shoppingState();const container=$(kind+'_local_options'),chosen=$(kind+'_branch').value;
    const expanded=kind==='shelf' ? shelfLocalsExpanded : purchaseLocalsExpanded;
    container.replaceChildren();
    const current=state.branches.find(branch=>branch.id===chosen);
    for(const branch of current && !expanded ? [current] : state.branches) {
        const button=document.createElement('button');button.type='button';button.textContent=branch.name+' · '+(branch.address || 'Local sin confirmar');button.setAttribute('aria-pressed',String(branch.id===chosen));
        button.onclick=async()=>{
            if(branch.id===chosen && !expanded) {
                if(kind==='shelf') shelfLocalsExpanded=true;else purchaseLocalsExpanded=true;
                await renderLocalOptions(kind);
            } else {
                shelfLocalsExpanded=false;purchaseLocalsExpanded=false;
                await choosePurchaseBranch(branch.id);
            }
        };container.append(button);
    }
    if(!state.branches.length) container.textContent='Registrá un local en Supermercados para elegirlo aquí.';
}
async function closeBranchForm() {const id=branchEditing;branchEditing=null;branchMenu=null;branchRevealed=null;$('branch_form').hidden=true;await renderBranchCards();const card=[...$('branch_cards').querySelectorAll('.product-card')].find(card=>card.dataset.branchId===id);if(card) centerProductCard(card);}
async function renderBranchCards(state) {
    if(!db) return;state=state || await shoppingState();
    const list=$('branch_cards'),filters=$('branch_filters');filters.replaceChildren();
    const activeBranch=state.branches.find(branch=>branch.id===(branchMenu || branchEditing));
    const filterButton=document.createElement('button');filterButton.type='button';filterButton.textContent=activeBranch?.name || branchFilter || 'Filtros';
    filterButton.setAttribute('aria-pressed',String(Boolean(activeBranch || branchFilter)));
    filters.style.justifyContent=activeBranch ? 'center' : '';
    filterButton.onclick=()=>{branchFilter=null;branchFiltersOpen=!branchFiltersOpen;void renderBranchCards();};filters.append(filterButton);
    if(branchFiltersOpen && !branchFilter && !activeBranch) for(const name of [...new Set(state.branches.map(branch=>branch.name))].sort((a,b)=>a.localeCompare(b,'es'))) {
        const button=document.createElement('button');button.type='button';button.textContent=name;button.onclick=()=>{branchFilter=name;void renderBranchCards();};filters.append(button);
    }
    if((branchFilter || branchFiltersOpen) && !activeBranch) {const back=document.createElement('button');back.type='button';back.className='clear-filters';back.textContent='<';back.setAttribute('aria-label','Limpiar filtros de locales');back.onclick=()=>{branchFilter=null;branchFiltersOpen=false;void renderBranchCards();};filters.append(back);}
    $('branch_form_home').append($('branch_form'));list.replaceChildren();
    const focused=branchMenu || (branchEditing!=='new' ? branchEditing : null),query=$('branch_search').value.toLocaleLowerCase('es');
    for(const branch of state.branches) {
        if(focused ? branch.id!==focused : (branchFilter && branch.name!==branchFilter) || !(branch.name+' '+(branch.address || '')).toLocaleLowerCase('es').includes(query)) continue;
        const tr=document.createElement('tr'),card=document.createElement('td'),title=document.createElement('strong');card.className='product-card';card.dataset.branchId=branch.id;title.textContent=branch.name+' · '+(branch.address || 'Local sin confirmar');card.append(title);
        const actions=document.createElement('div');actions.className='product-row-actions';
        for(const [text,action] of [['Seleccionar',async()=>{branchMenu=branch.id;await renderBranchCards();centerProductCard($('branch_cards').querySelector('.product-card'));}],['Editar',()=>editBranch(branch.id)]]) {const button=document.createElement('button');button.type='button';button.textContent=text;button.onclick=action;actions.append(button);}
        if(!focused) card.append(actions);
        if(branchRevealed===branch.id || focused) card.classList.add('actions-visible');
        card.onclick=event=>{if(event.target.closest('button,input,select,form')) return;branchRevealed=branchRevealed===branch.id ? null : branch.id;void renderBranchCards().then(()=>{const current=[...list.querySelectorAll('.product-card')].find(card=>card.dataset.branchId===branch.id);if(branchRevealed && current) centerProductCard(current);});};
        if(branchMenu===branch.id) {
            const heading=document.createElement('h2');heading.textContent='¿Qué querés hacer?';heading.style.textAlign='center';card.append(heading);
            for(const [text,action] of [['Comprar en este local',async()=>{await choosePurchaseBranch(branch.id);await closeBranchForm();showModule('products');notice('Local elegido: '+title.textContent);}],['Editar local',()=>editBranch(branch.id)],['<',()=>closeBranchForm()]]) {const button=document.createElement('button');button.type='button';button.textContent=text;button.onclick=action;if(text==='<') {button.className='branch-back';button.setAttribute('aria-label','Volver a los locales');}card.append(button);}
        }
        if(branchEditing===branch.id) card.append($('branch_form'));
        tr.append(card);list.append(tr);
    }
    for(const control of $('branch_form').querySelectorAll('.editor-field input')) control.editorCaptionUpdate?.();
    list.classList.toggle('product-highlighted',Boolean(branchRevealed || focused));
    if(branchEditing==='new') $('branch_form_home').append($('branch_form'));
}
async function saveBranch() {
    await shoppingAction(async () => {
        const state=await shoppingState(),id=$('branch_edit').value || identifier();
        const old=state.branches.find(b => b.id===id);
        const name=$('branch_name').value.trim(),address=$('branch_address').value.trim();
        if (!name || !address || name.length>255 || address.length>500) throw new Error('Ingresá el supermercado y la dirección o referencia del local');
        await queueOperation('branch',{name,address,expected_revision:old?.revision || 0},null,id);
        branchEditing=null;$('branch_form').hidden=true;
    });
}
async function editBranch(id) {
    const branch=(await shoppingState()).branches.find(b => b.id===id);
    $('branch_name').value=branch?.name || ''; $('branch_address').value=branch?.address || '';
    $('branch_edit').value=id;branchEditing=id || 'new';branchMenu=null;
    $('branch_form_title').textContent=id ? 'Editar local' : 'Nuevo local';
    arrangeEditorFields($('branch_form'));$('branch_form').hidden=false;await renderBranchCards();showModule('stores',{scroll:false});revealProductControls($('branch_form'));
}
async function choosePurchaseBranch(id) {
    const branch=(await shoppingState()).branches.find(b => b.id===id);
    for(const field of ['purchase_branch','shelf_branch','route_branch']) $(field).value=id;
    if (branch) {$('market').value=(branch.name+' · '+(branch.address || 'Local sin confirmar')).slice(0,255);$('shelf_market').value=$('market').value;}
    await localTransaction(['shopping_choices'],tx=>tx.objectStore('shopping_choices').put({id:'active_branch',branch_id:id}));
    await renderShelfLocals();
    await renderPurchaseLocals();
}
async function documentOperation(kind,owner_id,data,id=identifier()) {
    const old=(await shoppingState()).documents.find(d => d.id===id);
    await queueOperation('shopping_document',{kind,owner_id,expected_revision:old?.revision || 0,data},null,id);
}
async function saveLocation() {
    await shoppingAction(async () => {
        const branch_id=$('route_branch').value,product_id=$('location_product').value;
        if (!branch_id || !product_id) throw new Error('Elegí sucursal y producto');
        const aisle=$('location_aisle').value.trim(),order=Number($('location_order').value);
        if (!aisle || !Number.isInteger(order) || order<0 || order>10000) throw new Error('Ingresá pasillo y orden válidos');
        const data={branch_id,product_id,aisle,aisle_order:order,shelf:$('location_shelf').value.trim(),reference:$('location_reference').value.trim(),node_id:$('location_node').value.trim() || null,cold:$('location_cold').checked,confirmed_on:todayLocal()};
        const state=await shoppingState(),map=state.documents.find(d => d.kind==='map' && d.owner_id===branch_id)?.payload;
        if (data.node_id && (!map || !map.nodes.some(n => n.id===data.node_id))) throw new Error('El punto no existe en el mapa de esta sucursal');
        await documentOperation('location',branch_id,data,editingLocation || identifier()); editingLocation=null;
    });
}
async function editLocation(id) {
    const row=(await shoppingState()).documents.find(d => d.id===id); if (!row) return;
    editingLocation=id; const p=row.payload; $('route_branch').value=p.branch_id; $('location_product').value=p.product_id;
    for (const [key,field] of [['aisle','aisle'],['aisle_order','order'],['shelf','shelf'],['reference','reference'],['node_id','node']]) $('location_'+field).value=p[key] ?? '';
    $('location_cold').checked=p.cold; $('location_form').open=true; openModuleSection('location_form');
}
async function saveMap() {
    await shoppingAction(async () => {
        const branch_id=$('route_branch').value;if (!branch_id) throw new Error('Elegí una sucursal');
        const nodes=$('map_nodes').value.split('\n').filter(line => line.trim()).map(line => {const [id,label]=line.split('|').map(s => s.trim());return {id,label:label || id};});
        const edges=$('map_edges').value.split('\n').filter(line => line.trim()).map(line => {const [source,target,distance]=line.split('|').map(s => s.trim());return {source,target,distance};});
        const data={branch_id,nodes,edges,entrance:$('map_entrance').value.trim(),checkout:$('map_checkout').value.trim()};
        validateMap(data); await documentOperation('map',branch_id,data,branch_id);
    });
}
function validateMap(map) {
    const ids=new Set(map.nodes.map(n => n.id));
    if (ids.size!==map.nodes.length || ids.size<2 || ids.size>200 || !ids.has(map.entrance) || !ids.has(map.checkout)) throw new Error('Puntos, entrada o cajas inválidos');
    if (!map.edges.length || map.edges.length>500 || map.edges.some(e => !ids.has(e.source) || !ids.has(e.target) || e.source===e.target || !(Number(e.distance)>0) || !Number.isFinite(Number(e.distance)) || Number(e.distance)>100000)) throw new Error('Conexiones o distancias inválidas');
}
async function loadMap() {
    editingLocation=null;
    const map=(await shoppingState()).documents.find(d => d.kind==='map' && d.owner_id===$('route_branch').value)?.payload;
    $('map_nodes').value=map ? map.nodes.map(n => `${n.id} | ${n.label}`).join('\n') : '';
    $('map_edges').value=map ? map.edges.map(e => `${e.source} | ${e.target} | ${e.distance}`).join('\n') : '';
    $('map_entrance').value=map?.entrance || 'entrada'; $('map_checkout').value=map?.checkout || 'cajas'; await renderShopping();
}
async function saveGroup() {
    await shoppingAction(async () => {
        const product_ids=[...$('group_products').selectedOptions].map(o => o.value),name=$('group_name').value.trim();
        if (!name || product_ids.length<2) throw new Error('Ingresá nombre y al menos dos productos equivalentes');
        const id=$('group_edit').value || identifier(); await documentOperation('group',id,{name,product_ids},id);
    });
}
async function editGroup(id) {
    const group=(await shoppingState()).documents.find(d => d.id===id)?.payload;
    $('group_name').value=group?.name || ''; [...$('group_products').options].forEach(o => o.selected=group?.product_ids.includes(o.value) || false);
}
function shortestPaths(map,start) {
    const distances=new Map(map.nodes.map(n => [n.id,Infinity])),previous=new Map(),left=new Set(distances.keys()); distances.set(start,0);
    const graph=new Map(map.nodes.map(n => [n.id,[]]));
    map.edges.forEach(e => { graph.get(e.source).push([e.target,Number(e.distance)]);graph.get(e.target).push([e.source,Number(e.distance)]); });
    while(left.size) {
        const node=[...left].sort((a,b) => distances.get(a)-distances.get(b))[0];if (!Number.isFinite(distances.get(node))) break;left.delete(node);
        for (const [next,length] of graph.get(node)) if (distances.get(node)+length<distances.get(next)) {distances.set(next,distances.get(node)+length);previous.set(next,node);}
    }
    return {distance:node => distances.get(node) ?? Infinity,path(node) {if (!Number.isFinite(distances.get(node))) return []; const path=[node];while(node!==start) {node=previous.get(node);if (!node) return [];path.unshift(node);}return path;}};
}
function planRoute(map,items,coldLast=true) {
    validateMap(map);let current=map.entrance,total=0;const steps=[],pending=[...items],unreachable=[];
    while(pending.length) {
        const paths=shortestPaths(map,current);
        const candidates=coldLast && pending.some(i => !i.cold) ? pending.filter(i => !i.cold) : pending;
        const best=[...candidates].sort((a,b) => paths.distance(a.node_id)-paths.distance(b.node_id))[0];
        if (!best || !Number.isFinite(paths.distance(best.node_id))) {unreachable.push(...candidates);candidates.forEach(i => pending.splice(pending.indexOf(i),1));continue;}
        steps.push({item:best,path:paths.path(best.node_id),distance:paths.distance(best.node_id)});total+=paths.distance(best.node_id);current=best.node_id;pending.splice(pending.indexOf(best),1);
    }
    const finish=shortestPaths(map,current); if (!Number.isFinite(finish.distance(map.checkout))) return {steps,total,unreachable,noCheckout:true};
    total+=finish.distance(map.checkout);return {steps,total,unreachable,finish:finish.path(map.checkout)};
}
async function shoppingNeeds() {
    const stock=await projectedStock(),products=await localRead('catalog'),needs=[];
    for (const pref of stock.preferences) {
        const product=products.find(p => p.id===pref.product_id);if (!product) continue;
        const available=stock.lots.filter(l => l.product_id===product.id && (!l.expires_on || l.expires_on>=todayLocal())).reduce((n,l) => n+balanceOf(stock,l.id),0n);
        const shortage=scaledDecimal(pref.minimum_quantity,6)-available;
        if (shortage>0n) needs.push({product,quantity:decimalText(shortage,6)});
    }
    return needs;
}
function fillSelect(id,rows,label,placeholder='Elegí…') {
    const value=$(id).value,selected=[...$(id).selectedOptions].map(o => o.value);$(id).replaceChildren();
    if (!$(id).multiple) $(id).add(new Option(placeholder,''));
    rows.forEach(row => $(id).add(new Option(label(row),row.id)));
    if ($(id).multiple) [...$(id).options].forEach(o => o.selected=selected.includes(o.value)); else $(id).value=value;
}
async function renderShopping() {
    if (!db) return;const state=await shoppingState(),products=await localRead('catalog');
    for (const id of ['assist_product','location_product','group_products']) fillSelect(id,products,p => p.product_all);
    if (!$('assist_product').value && selected_id) $('assist_product').value=selected_id;
    for (const id of ['route_branch','branch_edit','purchase_branch','shelf_branch']) fillSelect(id,state.branches,b => `${b.name} · ${b.address || 'Local sin confirmar'}`,id==='branch_edit' ? 'Nuevo local' : 'Elegí local');
    const remembered=(await localRead('shopping_choices')).find(choice=>choice.id==='active_branch');
    if(remembered?.branch_id && !$('purchase_branch').value && state.branches.some(branch=>branch.id===remembered.branch_id)) await choosePurchaseBranch(remembered.branch_id);
    await renderBranchCards(state);
    await renderShelfLocals(state);
    await renderPurchaseLocals(state);
    const groups=state.documents.filter(d => d.kind==='group');fillSelect('group_edit',groups,g => g.payload.name,'Crear grupo nuevo');
    $('barcode_list').replaceChildren();state.barcodes.forEach(b => appendText($('barcode_list'),`${b.code}: ${products.find(p => p.id===b.product_id)?.product_all || 'Producto pendiente'}`,'li'));
    $('location_list').replaceChildren();
    const locations=state.documents.filter(d => d.kind==='location' && d.owner_id===$('route_branch').value);
    for (const loc of locations) {
        const p=loc.payload,item=appendText($('location_list'),`${products.find(row => row.id===p.product_id)?.product_all || 'Producto'} · Pasillo ${p.aisle} · ${p.shelf} · ${p.reference} · Confirmado ${p.confirmed_on}`,'li');
        const button=document.createElement('button');button.textContent='Corregir ubicación';button.onclick=() => editLocation(loc.id);item.append(button);
    }
    await renderRoute(state,products);
}
async function renderRoute(state,products) {
    const branch=$('route_branch').value,map=state.documents.find(d => d.kind==='map' && d.owner_id===branch)?.payload;
    const locations=state.documents.filter(d => d.kind==='location' && d.owner_id===branch),groups=state.documents.filter(d => d.kind==='group');
    const choices=await localRead('shopping_choices'),needs=await shoppingNeeds(),located=[],unknown=[];
    $('route_choices').replaceChildren();$('route_result').replaceChildren();
    for (const need of needs) {
        const alternatives=new Set([need.product.id,...groups.filter(g => g.payload.product_ids.includes(need.product.id)).flatMap(g => g.payload.product_ids)]);
        const target=choices.find(c => c.id===need.product.id)?.product_id || need.product.id;
        const selected=alternatives.has(target) ? target : need.product.id;
        const line=appendText($('route_choices'),`${need.product.product_all}: faltan ${need.quantity} ${need.product.content_unit || ''}`);
        if (alternatives.size>1) {
            const select=document.createElement('select');products.filter(p => alternatives.has(p.id)).forEach(p => select.add(new Option(p.product_all,p.id)));select.value=selected;
            select.onchange=async () => {await localTransaction(['shopping_choices'],tx => tx.objectStore('shopping_choices').put({id:need.product.id,product_id:select.value}));await renderShopping();};line.append(select);
            appendText(line,'Alternativa elegida para el recorrido. Revisá su presentación al comprar; no cambia tus existencias.');
        }
        const matches=locations.filter(d => d.payload.product_id===selected);
        if (!matches.length) {unknown.push(need.product.product_all);continue;}
        let location=matches.sort((a,b) => b.payload.confirmed_on.localeCompare(a.payload.confirmed_on))[0].payload;
        if (map) {
            const paths=shortestPaths(map,map.entrance); const valid=matches.filter(d => Number.isFinite(paths.distance(d.payload.node_id)));
            if (valid.length) location=valid.sort((a,b) => paths.distance(a.payload.node_id)-paths.distance(b.payload.node_id))[0].payload;
        }
        located.push({...location,title:products.find(p => p.id===selected)?.product_all || need.product.product_all});
    }
    if (!branch) {appendText($('route_result'),'Elegí una sucursal para ordenar la lista.');return;}
    if (map) {
        const mapped=located.filter(i => map.nodes.some(n => n.id===i.node_id)),unmapped=located.filter(i => !map.nodes.some(n => n.id===i.node_id));
        const route=planRoute(map,mapped,$('cold_last').checked),labels=new Map(map.nodes.map(n => [n.id,n.label]));
        appendText($('route_result'),`Recorrido aproximado: ${route.total.toFixed(1)} m. Usa tramos mínimos y el siguiente producto más cercano; no garantiza la ruta global óptima.`);
        route.steps.forEach(step => appendText($('route_result'),`${step.path.map(id => labels.get(id)).join(' → ')}: ${step.item.title} · Pasillo ${step.item.aisle} · ${step.item.shelf}`));
        if (route.finish) appendText($('route_result'),route.finish.map(id => labels.get(id)).join(' → '));
        if (route.noCheckout) appendText($('route_result'),'No hay camino a cajas; revisá las conexiones del mapa.');
        [...unmapped,...route.unreachable].forEach(i => appendText($('route_result'),`Sin ruta: ${i.title} · Pasillo ${i.aisle}`));
    } else {
        appendText($('route_result'),'Lista ordenada por pasillo. Cargá un mapa para calcular distancias.');
        located.sort((a,b) => ($('cold_last').checked ? Number(a.cold)-Number(b.cold) : 0) || a.aisle_order-b.aisle_order).forEach(i => appendText($('route_result'),`Pasillo ${i.aisle} · ${i.shelf}: ${i.title}`));
    }
    unknown.forEach(title => appendText($('route_result'),'Sin ubicación registrada: '+title));
    (await localRead('shopping_manual')).forEach(row => appendText($('route_result'),'Necesidad manual sin ubicación: '+row.text));
}
async function imageReference(file) {
    if (!file || !file.type.startsWith('image/') || file.size>20000000) throw new Error('Elegí una imagen de hasta 20 MB');
    const bitmap=await createImageBitmap(file);
    try {
        const small=document.createElement('canvas');small.width=small.height=8;const ctx=small.getContext('2d');
        const size=Math.min(bitmap.width,bitmap.height),x=(bitmap.width-size)/2,y=(bitmap.height-size)/2;
        ctx.drawImage(bitmap,x,y,size,size,0,0,8,8);const raw=ctx.getImageData(0,0,8,8).data,signature=[];
        for(let i=0;i<raw.length;i+=4) signature.push(raw[i],raw[i+1],raw[i+2]);
        const thumb=document.createElement('canvas');thumb.width=thumb.height=160;thumb.getContext('2d').drawImage(bitmap,x,y,size,size,0,0,160,160);
        return {signature,thumbnail:thumb.toDataURL('image/webp',0.75)};
    } finally {bitmap.close();}
}
function imageDistance(a,b) {return Math.sqrt(a.reduce((n,v,i) => n+(v-b[i])**2,0)/a.length);}
async function saveReferencePhoto(file) {
    if (!file) return;
    await shoppingAction(async () => {const product_id=$('assist_product').value;if (!product_id) throw new Error('Elegí el producto de esta foto'); const image=await imageReference(file);await documentOperation('photo',product_id,{product_id,...image});});
}
async function suggestPhoto(file) {
    if (!file) return;
    try {
        const image=await imageReference(file),state=await shoppingState(),products=await localRead('catalog');
        const matches=state.documents.filter(d => d.kind==='photo').map(d => ({document:d,distance:imageDistance(image.signature,d.payload.signature)})).filter(m => m.distance<=45).sort((a,b) => a.distance-b.distance).slice(0,3);
        $('photo_results').replaceChildren();
        if (!matches.length) {appendText($('photo_results'),'No encontré una referencia parecida. Registrá el producto manualmente o probá el código de barras.');return;}
        for (const match of matches) {
            const product=products.find(p => p.id===match.document.payload.product_id);if (!product) continue;
            const image=document.createElement('img');image.src=match.document.payload.thumbnail;image.alt=product.product_all;image.width=80;image.height=80;
            const button=document.createElement('button');button.textContent='Elegir '+product.product_all;button.onclick=() => select_product(product.id,product.product_all,product.product_name,product.product_brand,product.product_ptype,product.product_psubtype,product.normal_price,product.normal_unit,product.presentation);
            $('photo_results').append(image,button);
        }
    } catch(error) {notice(error.message);}
}
