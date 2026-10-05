let syncing = false, saving = false;
let selected_all = null;
const $ = id => document.getElementById(id);
function catalogLabelKey(value,field) {
    let key=String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('es');
    if(['product_name','product_class'].includes(field)) key=({galleta:'galletas',tomate:'tomates'})[key] || key;
    return key;
}
function unifyCatalogLabels(rows) {
    const fields=['product_name','product_brand','product_ptype','product_psubtype','product_class'],labels={};
    const score=value=>(/[\u00c0-\u017f]/.test(value) ? 10 : 0)+(value.match(/[A-ZÁÉÍÓÚÑ]/g)?.length || 0);
    for(const field of fields) {
        labels[field]=new Map();
        for(const row of rows) {
            const key=catalogLabelKey(row[field],field);if(!key) continue;
            let value=String(row[field]).trim().replace(/\s+/g,' ');
            if(['product_name','product_class'].includes(field) && key==='galletas') value='Galletas';
            if(field==='product_name' && key==='tomates') value='Tomates';
            const existing=labels[field].get(key);if(!existing || score(value)>score(existing)) labels[field].set(key,value);
        }
    }
    return rows.map(row=>{const result={...row};for(const field of fields) {const value=labels[field].get(catalogLabelKey(row[field],field));if(value) result[field]=value.charAt(0).toLocaleUpperCase('es')+value.slice(1);}result.product_all=productLabel(result);return result;}).sort((a,b)=>a.product_all.localeCompare(b.product_all,'es',{sensitivity:'base',numeric:true}));
}
function notice(message) { $('save_status').textContent = message;$('save_status').hidden=!message; }
function productLabel(row) {
    const parts=[[row.product_name,row.product_ptype,row.product_psubtype,row.flavor].filter(Boolean).join(' '),row.product_brand];
    if(row.sale_mode==='package' && row.package_content) {
        let value=Number(row.package_content),unit=row.content_unit;
        if(['g','ml'].includes(unit) && value>=1000) {value/=1000;unit=unit==='g' ? 'kg' : 'L';}
        if(unit==='unit') unit='unidades';parts.push(value+' '+unit+(row.unit_content ? ' de '+Number(row.unit_content)+' '+row.unit_content_unit+' c/u' : ''));
    } else if(row.sale_mode==='fractional') parts.push(row.content_unit==='g' ? 'Por peso' : 'Por volumen');
    else if(row.sale_mode==='unit') parts.push('Por unidad');
    else if(row.presentation) parts.push('Presentación '+Number(row.presentation)+' (unidad pendiente)');
    return parts.filter(Boolean).join(' · ');
}
function localTransaction(stores, action) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(stores, 'readwrite');
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('No se pudo guardar en el teléfono'));
        try { action(tx); } catch (error) { tx.abort(); reject(error); }
    });
}
function localRead(store) {
    return new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = () => resolve(store==='catalog' ? unifyCatalogLabels(req.result.filter(row=>!row.deleted_at)) : req.result);
        req.onerror = () => reject(req.error);
    });
}
open_database = function () {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('mercado_db', 5);
        req.onupgradeneeded = () => {
            for (const store of ['products', 'catalog', 'outbox','stock_cache','stock_effects','shopping_manual','shopping_cache','shopping_effects','shopping_choices','cart']) {
                if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store, {keyPath: store === 'outbox' ? 'operation_id' : 'id'});
            }
        };
        req.onsuccess = () => {
            db = req.result;
            db.onversionchange = () => { db.close(); notice('Cerrá las otras pestañas y volvé a abrir para actualizar.'); };
            resolve(db);
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => notice('Cerrá las otras pestañas de Mercado para actualizar el guardado local.');
    });
};
async function updateStatus(message) {
    const queue = await localRead('outbox');
    const syncMenu=$('sync_menu_button');
    if(syncMenu) {syncMenu.parentElement.hidden=queue.length===0;syncMenu.textContent='Sincronización · '+queue.length+' pendiente'+(queue.length===1 ? '' : 's');}
    $('sync_status').textContent = `${queue.length} pendientes${syncing ? ' · Sincronizando…' : ''}${message ? ' · ' + message : ''}`;
    if(queue.some(op=>op.error && op.error!=='Esperando conexión con tu PC')) {
        const review=document.createElement('button');review.type='button';review.textContent='Ver errores';
        review.onclick=()=>{showModule('settings');$('pending_details').open=true;};$('sync_status').append(' ',review);
    }
    $('pending_list').replaceChildren();
    for (const op of queue) {
        const item = document.createElement('li');
        const names={product:'Producto',product_edit:'Edición de producto',product_delete:'Borrado de producto',shelf_price:'Precio de góndola',purchase:'Compra',occasional_purchase:'Compra ocasional',settings:'Unidad del producto',stock_count:'Recuento de inventario',stock_transfer:'Traslado de existencias',stock_initial:'Stock inicial',stock_move:'Movimiento de stock',minimum:'Mínimo de compra',barcode:'Código de barras',branch:'Sucursal',shopping_document:'Información del súper'};
        item.textContent = `${names[op.kind]}: ${op.payload.product || op.payload.market || op.payload.note || ''} · ${op.error || 'Guardado en este teléfono'}`;
        const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Ver datos y corregir';details.append(summary);
        const labels={product:'Producto',brand:'Marca',ptype:'Tipo',psubtype:'Subtipo',display_label:'Etiqueta',presentation:'Presentación interna',quantity:'Cantidad',price:'Precio',total_paid:'Importe total',market:'Comercio',is_promotion:'Es promoción',promotion_description:'Descripción de promoción',sale_mode:'Modalidad',content_unit:'Unidad',package_content:'Contenido',promotion:'Promoción',special_quantity:'Cantidad de la oferta',special_total:'Importe de la oferta',note:'Nota',location:'Ubicación',expires_on:'Vencimiento'};
        const form=document.createElement('form'),inputs={};
        for(const [key,value] of Object.entries(op.payload)) {
            if(key==='display_label') continue;
            if(!labels[key]) continue;
            const label=document.createElement('label');label.textContent=labels[key]+' ';
            const choices={sale_mode:{package:'Envase fijo',fractional:'Fraccionado',unit:'Por unidad'},content_unit:{g:'g',kg:'kg',ml:'ml',l:'litros',unit:'unidades'},promotion:{none:'Sin promoción',offer:'Oferta','2x1':'2×1','3x2':'3×2','4x3':'4×3','2_50%':'Segunda al 50%','2_80%':'Segunda al 80%',special:'Promoción especial'}};
            const input=document.createElement(choices[key] ? 'select' : 'input');
            if(choices[key]) for(const [optionValue,text] of Object.entries(choices[key])) {const option=document.createElement('option');option.value=optionValue;option.textContent=text;input.append(option);}
            else input.type=typeof value==='boolean' ? 'checkbox' : 'text';
            if(input.type==='checkbox') input.checked=value;else input.value=value ?? '';
            input.disabled=!op.error_status || op.error_status>=500 || (op.kind==='purchase' && key==='price');
            label.append(input);form.append(label,document.createElement('br'));inputs[key]=input;
        }
        const save=document.createElement('button');save.type='submit';save.textContent='Guardar corrección y reintentar';save.disabled=!op.error_status || op.error_status>=500;
        form.append(save);form.onsubmit=async event=>{event.preventDefault();await correctPending(op.operation_id,inputs);};details.append(form);
        if(op.payload.product_id) {
            const edit=document.createElement('button');edit.type='button';edit.textContent='Revisar unidad y datos del producto';
            edit.onclick=async()=>{showModule('products');await editProduct(op.payload.product_id);};details.append(edit);
        }
        const retry=document.createElement('button');retry.type='button';retry.textContent='Reintentar sincronización';retry.onclick=()=>{retry.blur();void sync_pending();};details.append(retry);
        if(['product_edit','settings'].includes(op.kind)) {
            const discard=document.createElement('button');discard.type='button';discard.textContent='Descartar edición pendiente';
            discard.onclick=async()=>{discard.blur();await discardPendingEdit(op.operation_id);};details.append(discard);
        }
        item.append(details);
        $('pending_list').append(item);
    }
}
async function discardPendingEdit(id) {
    if(syncing || saving) {notice('Esperá a que termine la sincronización y volvé a intentarlo.');return;}
    saving=true;syncing=true;
    try {
        const queue=await localRead('outbox'),op=queue.find(item=>item.operation_id===id);
        if(!op || !['product_edit','settings'].includes(op.kind)) throw new Error('La edición ya no está pendiente');
        // Nunca retirar una operación cuyo resultado en el servidor sea desconocido.
        const stock=await serverRequest('/api/stock');
        if((stock.confirmed_operations || []).includes(id)) throw new Error('Esta edición ya fue aplicada. Reintentá sincronizar para actualizar el teléfono');
        const rows=await serverRequest('/api/catalog'),row=rows.find(item=>item.id===op.payload.product_id);
        if(!row) throw new Error('No se encontró el producto en el servidor');
        if(queue.some(item=>item.operation_id!==id && (['product_edit','settings'].includes(item.kind) && item.payload.product_id===row.id))) throw new Error('Hay otras ediciones pendientes de este producto. Descartá primero la última edición');
        if(queue.some(item=>item.operation_id!==id && (item.depends_on || []).includes(id))) throw new Error('Hay registros que dependen de esta edición. Se conserva para no alterar compras o stock pendientes');
        await localTransaction(['outbox','catalog'],tx=>{tx.objectStore('outbox').delete(id);tx.objectStore('catalog').put(row);});
        await closeProductEditor(false);$('search').value='';resetCatalogFilters();
        await read_products();await renderStock();await renderShopping();
        notice('Edición descartada. Se recuperaron los datos del servidor.');
    } catch(error) {notice('No se descartó: '+error.message+'. La edición sigue guardada en este teléfono.');}
    finally {saving=false;syncing=false;await updateStatus();}
}
async function correctPending(id,inputs) {
    if(syncing || saving) {notice('Esperá a que termine la sincronización y volvé a guardar la corrección.');return;}
    saving=true;syncing=true;
    try {
        const op=(await localRead('outbox')).find(item=>item.operation_id===id);
        if(!op) throw new Error('Este registro ya se sincronizó');
        if(!op.error_status || op.error_status>=500 || /identificador|contenido diferente|hash|receipt/i.test(op.error || '')) throw new Error('Primero reintentá la sincronización para confirmar el estado del registro');
        const payload={...op.payload};
        if(['product','product_edit'].includes(op.kind)) payload.display_label=null;
        for(const [key,input] of Object.entries(inputs)) payload[key]=input.type==='checkbox' ? input.checked : input.value.trim() || null;
        if(op.kind==='product' || op.kind==='settings' || op.kind==='product_edit') {
            if(!['package','fractional','unit'].includes(payload.sale_mode)) throw new Error('Modalidad: package, fractional o unit');
            if(!['g','kg','ml','l','unit'].includes(payload.content_unit)) throw new Error('Unidad: g, kg, ml, l o unit');
            payload.package_content=payload.sale_mode==='package' ? baseQuantity(payload.package_content,payload.content_unit) : payload.sale_mode==='fractional' ? '1000.000000' : '1.000000';
            payload.content_unit=baseUnit(payload.content_unit);
            if((payload.sale_mode==='unit')!==(payload.content_unit==='unit') && payload.sale_mode!=='package') throw new Error('La unidad no corresponde a la modalidad');
            if(op.kind==='product') payload.presentation=payload.sale_mode==='package' ? decimalText(scaledDecimal(payload.package_content,6)/(payload.content_unit==='unit' ? 1n : 1000n),6) : '1.000000';
        }
        if(op.kind==='purchase') {
            if(payload.quantity_from_total) Object.assign(payload,fractionalPurchaseValues(payload.price,payload.total_paid));
            const quantity=scaledDecimal(payload.quantity,6,true),total=scaledDecimal(payload.total_paid,4);
            if(!payload.quantity_from_total) payload.price=decimalText(roundedDivide(total*1000000n,quantity),4);
            if(payload.add_to_stock) {
                const row=(await localRead('catalog')).find(p=>p.id===payload.product_id);
                if(row?.unit_status!=='confirmed') throw new Error('Revisá primero la unidad del producto');
                payload.stock_quantity=decimalText(roundedDivide(quantity*(row.sale_mode==='package' ? scaledDecimal(row.package_content,6,true) : row.sale_mode==='fractional' ? 1000000000n : 1000000n),1000000n),6);
                payload.stock_unit=row.content_unit;payload.product_revision=row.revision;
            }
        }
        op.payload=payload;delete op.error;delete op.error_status;
        const effect=await stockEffect(op);
        const row=op.kind==='product' ? (await localRead('catalog')).find(p=>p.id===op.entity_id) : null;
        if(row) {Object.assign(row,{product_name:payload.product,product_brand:payload.brand,product_ptype:payload.ptype,product_psubtype:payload.psubtype,display_label:payload.display_label,presentation:payload.presentation,sale_mode:payload.sale_mode,content_unit:payload.content_unit,package_content:payload.package_content});row.product_all=productLabel(row);}
        await localTransaction(['outbox','stock_effects','catalog'],tx=>{tx.objectStore('outbox').put(op);if(effect) tx.objectStore('stock_effects').put({id:op.operation_id,...effect});if(row) tx.objectStore('catalog').put(row);});
        notice('Corrección guardada en este teléfono.');
    } catch(error) {notice('No se corrigió: '+error.message);}
    finally {saving=false;syncing=false;await updateStatus();}
    void sync_pending();
}
async function serverRequest(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(url, {...options, signal: controller.signal, cache: 'no-store'});
        const data = await response.json();
        if (!response.ok) {
            const error = new Error(typeof data.detail === 'string' ? data.detail : Array.isArray(data.detail) ? data.detail.map(item=>item.loc.filter(part=>part!=='body').join(' → ')+': '+item.msg).join('; ') : 'Revisar los datos del registro');
            error.status = response.status; throw error;
        }
        return data;
    } finally { clearTimeout(timer); }
}
async function refreshCatalog() {
    const rows = await serverRequest('/api/catalog');
    if (!Array.isArray(rows)) throw new Error('Respuesta de catálogo inválida');
    await localTransaction(['catalog', 'outbox'], tx => {
        const req = tx.objectStore('outbox').getAll();
        req.onsuccess = () => {
            const store = tx.objectStore('catalog');
            const pending = new Set(req.result.filter(op => op.kind === 'product' || ['settings','product_edit','product_delete'].includes(op.kind)).map(op => op.kind!=='product' ? op.payload.product_id : op.entity_id));
            const local = store.getAll();
            local.onsuccess = () => {
                const preserved = local.result.filter(row => pending.has(row.id));
                store.clear(); rows.forEach(row => store.put(row)); preserved.forEach(row => store.put(row));
            };
        };
    });
}
async function sync_pending() {
    if (!db || syncing || $('pending_list').contains(document.activeElement)) return;
    syncing = true;
    let outcome = 'Servidor disponible';
    try {
        const queue = await localRead('outbox');
        const priority=kind => kind==='product' ? 0 : 1;
        queue.sort((a,b) => priority(a.kind)-priority(b.kind) || (a.sequence || 0)-(b.sequence || 0) || a.created_at.localeCompare(b.created_at));
        for (const op of queue) {
            if (op.depends_on && (await localRead('outbox')).some(item => op.depends_on.includes(item.operation_id))) continue;
            if (op.payload.product_id && (await localRead('outbox')).some(item => item.kind==='product' && item.entity_id===op.payload.product_id)) continue;
            await updateStatus();
            try {
                const receipt = await serverRequest('/api/sync', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({operation_id: op.operation_id, entity_id: op.entity_id, kind: op.kind, payload: op.payload})});
                if (receipt.operation_id !== op.operation_id || receipt.entity_id !== op.entity_id || receipt.status !== 'confirmed') throw new Error('Confirmación inválida');
                await localTransaction(['outbox'], tx => tx.objectStore('outbox').delete(op.operation_id));
            } catch (error) {
                op.attempts = (op.attempts || 0) + 1;
                op.error = error.status && error.status < 500 ? error.message : 'Esperando conexión con tu PC';
                op.error_status=error.status || null;
                await localTransaction(['outbox'], tx => tx.objectStore('outbox').put(op));
                if (!error.status || error.status >= 500) { outcome = 'Sin conexión con tu PC'; break; }
                outcome = 'Hay registros que requieren revisión; siguen guardados';
            }
        }
        try { await refreshCatalog(); } catch (_) { outcome = 'Usando catálogo guardado en el teléfono'; }
        try { await refreshStock(); } catch (_) { /* Se conserva la copia local y sus movimientos. */ }
        try { await refreshShopping(); } catch (_) { /* Mapa y códigos siguen disponibles localmente. */ }
        await read_products();
        await renderStock();
        await renderShopping();
    } catch (error) { notice('No se pudo completar la sincronización: ' + error.message); }
    finally { syncing = false; await updateStatus(outcome); }
}
let actionProductId=null,shelfProductId=null,shelfEditingObservation=null,catalogRenderGeneration=0,revealedProductId=null,productFilterSnapshot=null;
let priceComparisonProduct=null;
async function catalogWithPrices() {
    const rows=await localRead('catalog');
    const pending=(await localRead('outbox')).filter(op=>['purchase','shelf_price'].includes(op.kind)).sort((a,b)=>(a.sequence || 0)-(b.sequence || 0));
    for(const op of pending) {
        const row=rows.find(p=>p.id===op.payload.product_id);if(!row) continue;
        const p=op.payload,day=new Date(p.occurred_at).toLocaleDateString('sv-SE',{timeZone:p.event_timezone});
        const shelf=op.kind==='shelf_price';let value=p.price;
        if(shelf) row.shelf_observation={...p,id:p.observation_id || op.entity_id,received_at:p.expected_received_at || null};
        if(shelf) {
            const [units,n,d]=p.promotion==='special' ? [BigInt(p.special_quantity),1n,1n] : shelfPromotion(p.promotion);
            const total=p.promotion==='special' ? scaledDecimal(p.special_total,2)*100n : roundedDivide(scaledDecimal(p.price,4)*n,d*100n)*100n;
            value=decimalText(roundedDivide(total,units),4);

            if(p.promotion==='none' && (!row.normal_date || day>=row.normal_date)) Object.assign(row,{normal_price:p.price,normal_date:day,normal_unit:row.presentation ? String(Number(p.price)/Number(row.presentation)) : null});
        }
        if(row.last_price_at ? Date.parse(p.occurred_at)>=Date.parse(row.last_price_at) : !row.last_price_date || day>=row.last_price_date) Object.assign(row,{last_price:value,last_price_date:day,last_price_at:p.occurred_at,last_price_promotion:shelf ? p.promotion!=='none' : p.is_promotion,last_price_pending:true,last_price_source:shelf ? 'shelf' : 'purchase',last_price_conditions:shelf ? p.promotion : null,last_list_price:shelf ? p.price : null,last_price_market:p.market,last_price_description:p.promotion_description || null,last_offer_quantity:p.special_quantity ? String(p.special_quantity) : null,last_offer_total:p.special_total || null});
    }
    return rows;
}
function shelfPromotion(code) {return {'none':[1n,1n,1n],'offer':[1n,1n,1n],'2x1':[2n,1n,1n],'3x2':[3n,2n,1n],'4x3':[4n,3n,1n],'2_50%':[2n,3n,2n],'2_80%':[2n,6n,5n]}[code || 'none'];}
function revealProductControls(element) {
    requestAnimationFrame(()=>{
        const offset=$('navbar').getBoundingClientRect().height+16;
        const top=window.scrollY+element.getBoundingClientRect().top-offset;
        window.scrollTo({top:Math.max(0,top),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    });
}
function centerProductCard(card,includeFilters=false) {
    requestAnimationFrame(()=>{
        const cardBounds=card.getBoundingClientRect();
        const start=includeFilters && !$('active_filters').hidden ? $('active_filters').getBoundingClientRect().top : cardBounds.top;
        const bounds={top:start,height:cardBounds.bottom-start},header=$('navbar').getBoundingClientRect().height;
        const top=window.scrollY+bounds.top-Math.max(header+16,(window.innerHeight+header-bounds.height)/2);
        window.scrollTo({top:Math.max(0,top),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    });
}
async function toggleCatalogFilters(open) {
    const filters=$('filters'),reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let closing;
    if(!open && !reduce) {
        const padding=parseFloat(getComputedStyle(filters).paddingTop)+parseFloat(getComputedStyle(filters).paddingBottom);
        closing=filters.animate([{height:(filters.getBoundingClientRect().height-padding)+'px',overflow:'hidden'},{height:'0px',overflow:'hidden',opacity:0}],{duration:220,easing:'ease-in-out',fill:'forwards'});
        await closing.finished.catch(()=>{});
    }
    if(!open) resetCatalogFilters();
    catalog_filters_open=true;await read_products();
    closing?.cancel();
    if(open && !reduce) {
        const padding=parseFloat(getComputedStyle(filters).paddingTop)+parseFloat(getComputedStyle(filters).paddingBottom);
        filters.animate([{height:'0px',overflow:'hidden',opacity:0},{height:(filters.getBoundingClientRect().height-padding)+'px',overflow:'hidden',opacity:1}],{duration:240,easing:'ease-out'});
        for(const button of filters.querySelectorAll(':scope > button')) button.animate([{opacity:0},{opacity:1}],{duration:240,easing:'ease-out'});
    }
}
function shelfBasis(row) {return row.sale_mode==='fractional' ? row.content_unit==='g' ? 'kg' : 'l' : row.sale_mode==='unit' ? 'unit' : 'package';}
function updateShelfFractionalPreview() {
    const output=$('shelf_fractional_amount');
    if($('shelf_fractional_fields').hidden) return;
    if(!$('shelf_amount_paid').value.trim()) {output.textContent='';return;}
    try {
        const price=scaledDecimal(adjustedPrice($('shelf_price').value,$('shelf_subtract_cent').checked),4,true);
        const total=scaledDecimal($('shelf_amount_paid').value,4,true);
        const quantity=roundedDivide(total*1000000000n,price);
        const text=decimalText(quantity,6).replace(/\.?0+$/,'');
        output.textContent='Cantidad: '+formatDisplayDecimal(text)+' '+$('shelf_fractional_fields').dataset.unit;
    } catch(error) {output.textContent='Completá precio e importe para calcular la cantidad.';}
}
for(const id of ['shelf_price','shelf_amount_paid','shelf_subtract_cent']) $(id).addEventListener('input',updateShelfFractionalPreview);
async function openShelfPrice(row) {
    shelfEditingObservation=null;
    $('shelf_price_form').querySelector('h2').textContent='Registrar precio de góndola';
    $('shelf_price_form').querySelector('button[onclick="saveShelfPrice()"]').textContent='Guardar precio de góndola';
    await closeProductEditor(false);shelfProductId=row.id;
    $('shelf_price_product').textContent=row.product_all;
    const priceLabel='Precio '+({package:'por envase',kg:'por kg',l:'por litro',unit:'por unidad'}[shelfBasis(row)]);
    $('shelf_price').placeholder=priceLabel;$('shelf_price').setAttribute('aria-label',priceLabel);
    $('shelf_price').value='';$('shelf_date').value=todayLocal();$('shelf_promotion').value='none';$('shelf_promotion').disabled=false;
    $('shelf_subtract_cent').checked=false;
    $('shelf_fractional_fields').hidden=row.sale_mode!=='fractional';
    $('shelf_fractional_fields').dataset.unit=row.content_unit==='g' ? 'g' : 'ml';
    $('shelf_amount_paid').value='';updateShelfFractionalPreview();
    for(const option of $('shelf_promotion').options) option.disabled=shelfBasis(row)!=='package' && !['none','offer',...(shelfBasis(row)==='unit' ? ['special'] : [])].includes(option.value);
    for(const name of ['quantity','total','description']) $('shelf_special_'+name).value='';updateSpecialPromotion();
    shelfLocalsExpanded=false;await renderShelfLocals();
    $('shelf_price_form').hidden=false;await read_products();openModuleSection('search_section');$('shelf_price').focus();
}
async function closeShelfPrice(restore=true) {
    const draftCancelled=comparisonProductDraft?.row.id===shelfProductId;
    shelfProductId=null;shelfEditingObservation=null;$('shelf_price_form').hidden=true;
    if(draftCancelled && restore) {comparisonProductDraft=null;await read_products();openModuleSection('register_section');return;}
    if(restore) {$('search').value='';resetCatalogFilters();await read_products();}
}
async function saveShelfPrice() {
    if(saving || !shelfProductId) return;saving=true;
    try {
        const row=comparisonProductDraft?.row.id===shelfProductId ? comparisonProductDraft.row : (await localRead('catalog')).find(p=>p.id===shelfProductId);if(!row) throw new Error('Elegí un producto');
        const branchId=$('shelf_branch').value;
        const state=await shoppingState();
        const branch=state.branches.find(b=>b.id===branchId);
        if(!branch) throw new Error('Elegí un local registrado');
        const market=(branch.name+' · '+(branch.address || 'Local sin confirmar')).slice(0,255);
        if(!$('shelf_date').value) throw new Error('Indicá la fecha');
        const when=new Date($('shelf_date').value===todayLocal() ? Date.now() : $('shelf_date').value+'T12:00:00');
        if(!Number.isFinite(when.getTime())) throw new Error('Fecha inválida');
        const promotion=$('shelf_promotion').disabled ? 'none' : $('shelf_promotion').value;
        const payload={product_id:row.id,price:promotion==='special' ? null : adjustedPrice($('shelf_price').value,$('shelf_subtract_cent').checked),price_basis:shelfBasis(row),promotion,market,occurred_at:when.toISOString(),event_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
        if(row.sale_mode==='fractional' && $('shelf_amount_paid').value.trim()) {
            scaledDecimal(payload.price,4,true);
            payload.amount_paid=decimalInput($('shelf_amount_paid').value,4,true);
        }
        if(promotion==='special') {const offer=readSpecialOffer('shelf');Object.assign(payload,{special_quantity:Number(offer.units),special_total:decimalText(offer.total/100n,2),promotion_description:offer.description});}
        if(branchId) payload.branch_id=branchId;
        if(shelfEditingObservation) {
            payload.observation_id=shelfEditingObservation.id;
            if(shelfEditingObservation.received_at) payload.expected_received_at=shelfEditingObservation.received_at;
            const originalDay=new Date(shelfEditingObservation.occurred_at).toLocaleDateString('sv-SE',{timeZone:shelfEditingObservation.event_timezone});
            if($('shelf_date').value===originalDay) {payload.occurred_at=shelfEditingObservation.occurred_at;payload.event_timezone=shelfEditingObservation.event_timezone;}
        }
        if(payload.price!==null) scaledDecimal(payload.price,4,true);
        if(comparisonProductDraft?.row.id===row.id) {
            const commit=async()=>{
                const previous=await localRead('outbox');
                const sequence=Math.max(Date.now(),...previous.map(op=>(op.sequence || 0)+1));
                const productOp={operation_id:identifier(),entity_id:row.id,kind:'product',payload:comparisonProductDraft.payload,created_at:new Date().toISOString(),sequence,attempts:0,depends_on:[]};
                const priceOp={operation_id:identifier(),entity_id:identifier(),kind:'shelf_price',payload,created_at:new Date().toISOString(),sequence:sequence+1,attempts:0,depends_on:[productOp.operation_id,...previous.filter(op=>op.kind==='branch' && op.entity_id===branchId).map(op=>op.operation_id)]};
                await localTransaction(['catalog','outbox'],tx=>{tx.objectStore('catalog').put(row);tx.objectStore('outbox').add(productOp);tx.objectStore('outbox').add(priceOp);});
            };
            if(navigator.locks) await navigator.locks.request('mercado-local-save',commit);else await commit();
            comparisonProductDraft=null;comparisonShelfDraft=null;setComparisonRegistration(false);
            for(const field of ['product','brand','ptype','psubtype','new_category','new_flavor','new_unit_content','new_total_content','new_barcode','new_package_content']) $(field).value='';
            await updateStatus();notice('Producto y precio de góndola guardados juntos.');
        } else await queueOperation('shelf_price',payload,null,shelfEditingObservation?.id);
        await closeShelfPrice();void sync_pending();
    } catch(error) {notice('No se guardó: '+error.message+'. Los campos se conservaron.');}
    finally {saving=false;}
}
function comparableProductPrice(row) {
    const value=row.last_price ?? row.normal_price;
    if(value==null || row.unit_status!=='confirmed') return null;
    const weightedPack=row.sale_mode==='package' && row.content_unit==='unit' && Number(row.package_content)>1 && Number(row.unit_content)>0 && ['g','ml'].includes(row.unit_content_unit);
    const measure=weightedPack ? row.unit_content_unit : row.content_unit;
    const dimension=measure==='g' ? 'mass' : measure==='ml' ? 'volume' : measure==='unit' ? 'unit' : null;
    if(!dimension) return null;
    try {
        const numerator=scaledDecimal(value,4)*(dimension==='unit' ? 1n : 1000n)*1000000n;
        const denominator=weightedPack ? scaledDecimal(row.package_content,6,true)*scaledDecimal(row.unit_content,6,true)/1000000n : row.sale_mode==='fractional' ? 1000000000n : row.sale_mode==='unit' ? 1000000n : scaledDecimal(row.package_content,6,true);
        return {dimension,numerator,denominator};
    } catch {return null;}
}
function productPriceComparison(row,selected) {
    if(row.id===selected.id || !selected.product_name?.trim() || catalogLabelKey(row.product_name,'product_name')!==catalogLabelKey(selected.product_name,'product_name')) return null;
    const a=comparableProductPrice(row),b=comparableProductPrice(selected);
    if(!a || !b || a.dimension!==b.dimension) return null;
    const delta=a.numerator*b.denominator-b.numerator*a.denominator;
    return {row,price:a,direction:delta>0n ? 1 : delta<0n ? -1 : 0};
}
function highlightProductFlavors(rows,selectedId) {
    const table=$('data_table');
    const entries=[...table.children].filter(element=>element.tagName==='TR');
    entries.forEach((entry,index)=>{if(entry.dataset.catalogOrder===undefined) entry.dataset.catalogOrder=String(index);});
    for(const entry of entries.sort((a,b)=>Number(a.dataset.catalogOrder)-Number(b.dataset.catalogOrder))) table.append(entry);
    const selected=rows.find(row=>row.id===selectedId);
    if(priceComparisonProduct!==selectedId) priceComparisonProduct=null;
    const comparing=Boolean(selected && priceComparisonProduct===selectedId);
    table.classList.toggle('price-comparison-active',comparing);
    const same=(a,b)=>catalogLabelKey(a,'')===catalogLabelKey(b,'');
    const flavorFields=['product_name','product_brand','product_ptype','product_psubtype','product_class','sale_mode','content_unit','unit_content_unit'];
    for(const card of $('data_table').querySelectorAll('.product-card')) {
        const row=rows.find(row=>row.id===card.dataset.productId);
        const related=Boolean(selected && row && row.id!==selected.id && selected.flavor?.trim() && row.flavor?.trim() && !same(row.flavor,selected.flavor)
            && flavorFields.every(field=>same(row[field],selected[field]))
            && ['package_content','unit_content','presentation'].every(field=>Number(row[field] || 0)===Number(selected[field] || 0)));
        card.classList.toggle('flavor-related',related && !comparing);
        card.classList.remove('name-related','comparison-expensive','comparison-cheaper','comparison-equal');
        const comparison=comparing && row ? productPriceComparison(row,selected) : null;
        if(comparison) card.classList.add(comparison.direction>0 ? 'comparison-expensive' : comparison.direction<0 ? 'comparison-cheaper' : 'comparison-equal');
        const price=card.querySelector('.product-last-price');
        if(price?.normalPriceNodes) price.replaceChildren(...price.normalPriceNodes);
        if(price && comparing && (comparison || row.id===selected.id) && row.sale_mode==='package' && row.content_unit==='unit' && Number(row.package_content)>1) {
            const value=row.last_price ?? row.normal_price;
            if(value!=null) {
                if(!price.normalPriceNodes) price.normalPriceNodes=[...price.childNodes];
                const individual=document.createElement('span');individual.textContent=formatCents(roundedDivide(scaledDecimal(value,4)*1000000n,scaledDecimal(row.package_content,6,true)*100n))+' por paquete individual';
                const pack=document.createElement('span');pack.className='product-unit-price product-pack-unit-price';pack.textContent=formatProductPrice(value)+' por pack';
                price.replaceChildren(individual,pack);
            }
        }
    }
    const selectedCard=[...table.querySelectorAll('.product-card')].find(card=>card.dataset.productId===selectedId);
    if(selectedCard) {
        if(comparing) {
            const options=[...table.querySelectorAll('.product-card')].map(card=>({card,comparison:productPriceComparison(rows.find(row=>row.id===card.dataset.productId),selected)})).filter(item=>item.comparison);
            options.sort((a,b)=>{const x=a.comparison.price,y=b.comparison.price,d=x.numerator*y.denominator-y.numerator*x.denominator;return d>0n ? -1 : d<0n ? 1 : 0;});
            const selectedEntry=selectedCard.closest('tr');
            for(const item of options.filter(item=>item.comparison.direction>0)) selectedEntry.before(item.card.closest('tr'));
            let anchor=selectedEntry;
            for(const item of options.filter(item=>item.comparison.direction<=0)) {const entry=item.card.closest('tr');anchor.after(entry);anchor=entry;}
            table.prepend(...options.filter(item=>item.comparison.direction>0).map(item=>item.card.closest('tr')),selectedEntry,...options.filter(item=>item.comparison.direction<=0).map(item=>item.card.closest('tr')));
            return;
        }
        let anchor=selectedCard.closest('tr');
        for(const card of [...table.querySelectorAll('.product-card.flavor-related'),...table.querySelectorAll('.product-card.name-related')]) {
            const entry=card.closest('tr');anchor.after(entry);anchor=entry;
        }
    }
}
read_products = async function () {
    if (!db) return;
    const generation=++catalogRenderGeneration;
    const rows = await catalogWithPrices();
    if(comparisonProductDraft && shelfProductId===comparisonProductDraft.row.id) rows.push(comparisonProductDraft.row);
    if(generation!==catalogRenderGeneration) return;
    const search = $('search').value.toLowerCase();
    const renderFilter=(id,values,selected,active,callback)=>{
        $(id).replaceChildren();
        for(const value of [null,...[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base',numeric:true}))]) {
            const button=document.createElement('button');button.type='button';button.textContent=value || 'Todos';
            button.setAttribute('aria-pressed',String(active && value===selected));button.onclick=()=>callback(value);$(id).append(button);
        }
    };
    const brandMode=catalog_filter_mode==='brand',dateMode=catalog_filter_mode==='date';
    if(dateMode) rows.sort((a,b)=>catalogDate(b)-catalogDate(a) || a.product_all.localeCompare(b.product_all,'es',{sensitivity:'base',numeric:true}));
    const firstValue=brandMode ? selected_brand_filter : selected_class_filter;
    const lastValue=brandMode ? selected_class_filter : selected_brand_filter;
    const firstApply=brandMode ? apply_brand_filter : apply_class_filter;
    const lastApply=brandMode ? apply_class_filter : apply_brand_filter;
    renderFilter('filters',rows.map(row=>brandMode ? row.product_brand : row.product_class),firstValue,firstValue!==null,firstApply);
    $('filters').querySelector('button').remove();
    if(!catalog_filters_open) for(const button of $('filters').querySelectorAll('button')) button.hidden=true;
    $('filters').hidden=dateMode || firstValue!==null || Boolean(actionProductId || editingProduct) || !catalog_filters_open;
    const active=$('active_filters');active.replaceChildren();
    active.classList.toggle('selected-product-filter',Boolean(actionProductId || editingProduct));
    const chosen=[[firstValue,()=>firstApply(null)],[selected_product_filter,()=>apply_product_filter(null)],[lastValue,()=>lastApply(null)]].filter(([value])=>value!==null);
    active.hidden=!chosen.length;
    if(chosen.length) {
        const button=document.createElement('button');button.type='button';button.className='combined-filter';
        button.textContent=chosen.map(([value])=>value).join(' · ');button.setAttribute('aria-pressed','true');
        button.title='Volver al nivel anterior';button.onclick=chosen[chosen.length-1][1];active.append(button);
    }
    const categoryRows=rows.filter(row=>firstValue===null || (brandMode ? row.product_brand : row.product_class)===firstValue);
    $('product_filter_section').hidden=firstValue===null || selected_product_filter!==null;
    renderFilter('product_filters',categoryRows.map(row=>row.product_name),selected_product_filter,product_filter_active,apply_product_filter);
    const productRows=categoryRows.filter(row=>selected_product_filter===null || row.product_name===selected_product_filter);
    $('brand_filter_section').hidden=selected_product_filter===null || lastValue!==null;
    $('brand_filter_section').setAttribute('aria-label',brandMode ? 'Filtro por tipo' : 'Filtro por marca');
    renderFilter('brand_filters',productRows.map(row=>brandMode ? row.product_class : row.product_brand),lastValue,product_filter_active,lastApply);
    if(dateMode) {$('product_filter_section').hidden=true;$('brand_filter_section').hidden=true;}
    const mode=document.createElement('button');mode.type='button';mode.id='catalog_filter_mode';
    const nextMode=brandMode ? 'date' : dateMode ? 'type' : 'brand';
    const modeLabels={type:'Por tipo',brand:'Por marca',date:'Por fecha'};
    mode.textContent=modeLabels[catalog_filter_mode];
    mode.setAttribute('aria-label',mode.textContent+'. Cambiar a '+modeLabels[nextMode]);
    mode.onclick=()=>switchCatalogMode(nextMode);
    const controls=document.createElement('div');controls.className='filter-mode-controls';
    if(active.hidden) controls.append(mode);
    const singleFilteredProduct=selected_product_filter!==null && rows.filter(row=>
        (selected_class_filter===null || row.product_class===selected_class_filter) &&
        row.product_name===selected_product_filter &&
        (selected_brand_filter===null || row.product_brand===selected_brand_filter) &&
        [row.product_all,row.product_name,row.product_brand,row.product_ptype,row.product_psubtype,row.product_class].filter(Boolean).join(' ').toLowerCase().includes(search)
    ).length===1;
    const searchProductSelected=Boolean(!shelfProductId && (selected_id || singleFilteredProduct));
    if(!active.hidden && !actionProductId && !editingProduct && !searchProductSelected) {
        const clear=document.createElement('button');clear.type='button';clear.className='clear-filters';
        clear.textContent='<';
        clear.setAttribute('aria-label','Limpiar filtros');clear.title='Limpiar filtros';clear.onclick=clearActiveFilters;
        controls.append(active.querySelector('.combined-filter'),clear);
    }
    if(!active.hidden && (actionProductId || editingProduct || searchProductSelected)) controls.append(active.querySelector('.combined-filter'));
    $('catalog_filter_control').replaceChildren();$('catalog_filter_control').hidden=!active.hidden;
    if(active.hidden) $('catalog_filter_control').append(controls);else active.prepend(controls);
    if(active.hidden && catalog_filters_open && !dateMode) {
        const collapse=document.createElement('button');collapse.type='button';collapse.className='clear-filters';collapse.textContent='<';
        collapse.setAttribute('aria-label','Volver a por fecha');collapse.title='Volver a por fecha';collapse.onclick=()=>void toggleCatalogFilters(false);
        $('filters').append(collapse);
    }
    $('product_actions_home').append($('product_actions'));
    $('product_editor_home').append($('product_editor'));
    $('shelf_price_home').append($('shelf_price_form'));
    $('data_table').replaceChildren();
    const focusedProduct=editingProduct || shelfProductId || actionProductId;
    for (const row of rows) {
        if(focusedProduct && row.id!==focusedProduct) continue;
        if (!focusedProduct && selected_class_filter !== null && row.product_class !== selected_class_filter) continue;
        if (!focusedProduct && selected_product_filter !== null && row.product_name!==selected_product_filter) continue;
        if (!focusedProduct && selected_brand_filter !== null && row.product_brand!==selected_brand_filter) continue;
        if (!focusedProduct && ![row.product_all,row.product_name,row.product_brand,row.product_ptype,row.product_psubtype,row.product_class].filter(Boolean).join(' ').toLowerCase().includes(search)) continue;
        const tr = document.createElement('tr'), td = document.createElement('td'), title = document.createElement('strong'), button = document.createElement('button');
        const menuOpen=row.id===actionProductId;
        title.textContent = row.product_all;
        button.textContent='Seleccionar';button.onclick = () => showProductActions(row.id);
        const edit=document.createElement('button');edit.type='button';edit.textContent='Editar';edit.onclick=()=>editProduct(row.id);
        const price=document.createElement('div');price.className='product-last-price';
        const value=row.last_price ?? row.normal_price;
        price.textContent=value==null ? 'Sin precio registrado' : formatProductPrice(value);
        if(value!=null && row.sale_mode==='fractional') price.textContent+='/'+(row.content_unit==='g' ? 'kg' : 'litro');
        const unitPrice=value==null || row.sale_mode==='fractional' ? '' : productUnitPrice(row,value);
        if(unitPrice) {
            const normalized=document.createElement('span');normalized.className='product-unit-price';
            const multiPack=row.sale_mode==='package' && row.content_unit==='unit' && Number(row.package_content)>1;
            if(multiPack) {
                normalized.classList.add('product-pack-unit-price');
                normalized.textContent=unitPrice.replace('/unidad',' por unidad');
            } else normalized.textContent=' ('+unitPrice+')';
            price.append(normalized);
        }
        const caption=document.createElement('div');caption.className='product-price-caption';
        const date=row.last_price_date || row.normal_date;
        caption.textContent='Último precio'+(date ? ' · '+date+' ('+priceAgeDays(date)+' días)' : '');
        if(row.last_price_source==='shelf') caption.textContent+=' · Góndola'+(row.last_price_market ? ' · '+row.last_price_market : '')+(row.last_price_conditions && row.last_price_conditions!=='none' ? ' · '+row.last_price_conditions.replace('offer','Oferta').replace('2_50%','Segunda al 50%').replace('2_80%','Segunda al 80%') : '');
        if(row.last_price_description && (row.last_price_source!=='shelf' || row.last_price_conditions==='special')) caption.textContent+=' · '+row.last_price_description;
        if(row.last_price_pending) caption.textContent+=' · Pendiente de sincronizar';
        if(value==null) caption.textContent='';
        const actions=document.createElement('div');actions.className='product-row-actions';actions.append(button);
        if(!menuOpen) actions.append(edit);
        if(!menuOpen && !focusedProduct && rows.some(candidate=>productPriceComparison(candidate,row)
            && (selected_class_filter===null || candidate.product_class===selected_class_filter)
            && (selected_product_filter===null || candidate.product_name===selected_product_filter)
            && (selected_brand_filter===null || candidate.product_brand===selected_brand_filter)
            && [candidate.product_all,candidate.product_name,candidate.product_brand,candidate.product_ptype,candidate.product_psubtype,candidate.product_class].filter(Boolean).join(' ').toLowerCase().includes(search))) {
            const compare=document.createElement('button');compare.type='button';compare.textContent='{}';compare.setAttribute('aria-label','Comparar precios de productos relacionados');compare.setAttribute('aria-pressed',String(priceComparisonProduct===row.id));
            compare.onclick=()=>{priceComparisonProduct=priceComparisonProduct===row.id ? null : row.id;compare.setAttribute('aria-pressed',String(priceComparisonProduct===row.id));highlightProductFlavors(rows,row.id);centerProductCard(td);};actions.append(compare);
        }
        td.className='product-card';td.dataset.productId=row.id;
        if(row.id===editingProduct) {td.classList.add('product-edit-open');actions.hidden=true;}
        if(menuOpen) {td.classList.add('product-menu-open');actions.hidden=true;price.hidden=true;caption.hidden=true;}
        const expanded=row.id===revealedProductId || row.id===focusedProduct;
        if(expanded) td.classList.add('actions-visible');
        td.tabIndex=0;td.setAttribute('aria-label',row.product_all+'. Activar para mostrar acciones');
        td.setAttribute('aria-expanded',String(expanded));
        const toggleActions=()=>{
            if(focusedProduct) return;
            const opening=!td.classList.contains('actions-visible');
            for(const card of $('data_table').querySelectorAll('.product-card')) {card.classList.remove('actions-visible');card.setAttribute('aria-expanded','false');}
            revealedProductId=opening ? row.id : null;
            td.classList.toggle('actions-visible',opening);td.setAttribute('aria-expanded',String(opening));
            $('data_table').classList.toggle('product-highlighted',opening);
            highlightProductFlavors(rows,opening ? row.id : null);
            if(opening) centerProductCard(td);
        };
        td.onclick=event=>{if(!event.target.closest('button,input,select,textarea,a,form')) toggleActions();};
        td.onkeydown=event=>{if(event.target===td && ['Enter',' '].includes(event.key)) {event.preventDefault();toggleActions();}};
        td.append(title,price,caption,actions); tr.append(td); $('data_table').append(tr);
        if(row.id===actionProductId) td.append($('product_actions'));
        if(row.id===editingProduct) td.append($('product_editor'));
        if(row.id===shelfProductId) td.append($('shelf_price_form'));
    }
    $('search_add_product').hidden=!search.trim() || Boolean(focusedProduct) || $('data_table').querySelector('.product-card')!==null;
    $('search_add_product_bottom').hidden=!search.trim() || Boolean(focusedProduct) || $('data_table').querySelector('.product-card')===null;
    $('data_table').classList.toggle('product-highlighted',Boolean($('data_table').querySelector('.actions-visible')));
    highlightProductFlavors(rows,revealedProductId || focusedProduct);
    if (!rows.length) notice('Todavía no hay catálogo local. Conectá una vez con tu PC o cargá un producto nuevo.');
};
function catalogDate(row) {
    const value=row.last_price_at || row.last_price_date || row.normal_date || row.created_at;
    return value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
}
function formatProductPrice(value) {
    const cents=roundedDivide(scaledDecimal(value,4),100n);
    return formatCents(cents);
}
function formatDisplayDecimal(value) {
    const [whole,fraction]=String(value).split('.');
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(fraction===undefined ? '' : ','+fraction);
}
function formatCents(cents) {return '$'+formatDisplayDecimal(decimalText(cents,2));}
function productUnitPrice(row,value) {
    if(row.unit_status!=='confirmed' || !row.sale_mode || !row.content_unit) return '';
    const label=row.content_unit==='g' ? 'kg' : row.content_unit==='ml' ? 'litro' : 'unidad';
    if(row.sale_mode==='fractional' || row.sale_mode==='unit') return formatProductPrice(value)+'/'+label;
    if(!row.package_content) return '';
    const content=scaledDecimal(row.package_content,6,true);
    const cents=roundedDivide(scaledDecimal(value,4)*(row.content_unit==='unit' ? 1n : 1000n)*1000000n,content*100n);
    return formatCents(cents)+'/'+label;
}
function priceAgeDays(date,now=new Date()) {
    const [year,month,day]=date.split('-').map(Number);
    return Math.floor((Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())-Date.UTC(year,month-1,day))/86400000);
}
function prepareComparison(row) {
    comparison_product=row;
    $('compare_product_label').textContent=row.product_all;
    const reference=row.normal_price==null ? 'Sin precio de referencia' : formatProductPrice(row.normal_price);
    $('compare_product_reference').value=row.normal_price ?? '';
    $('compare_content_unit').value=row.content_unit==='ml' ? 'l' : row.content_unit==='unit' ? 'unit' : 'kg';
    $('new_price').value='';
    $('new_presentation').value='';
    document.querySelectorAll('input[name="promotion"]').forEach(input=>input.checked=false);
    $('compare_promotions_enabled').checked=false;
    $('compare_promotions').hidden=true;
    for(const name of ['quantity','total','description']) $('compare_special_'+name).value='';
    updateSpecialPromotion();
    $('checkbox_new_price_9_99').checked=false;
    updateComparisonCentCheckbox();
    const unit=row.content_unit==='g' ? 'kg' : row.content_unit==='ml' ? 'litros' : row.content_unit==='unit' ? 'unidades' : null;
    $('new_presentation').dataset.caption='Contenido por envase';
    $('new_presentation').placeholder=$('new_presentation').dataset.caption;
    $('new_presentation').setAttribute('aria-label',$('new_presentation').dataset.caption);
    $('compare_product_content').value=row.sale_mode==='fractional' ? '1' : row.presentation ?? '';
    updateComparisonFieldCaptions();
}
select_product = function (id,all,name,brand,type,subtype,price,unitPrice,presentation) {
    clearComparison();
    $('price').value = ''; $('quantity').value = '1';
    $('checkbox_99').checked = false; $('checkbox_quantity_1_1000').checked = false;
    setPurchasePromotion('none');updatePurchasePromotion(false);
    selected_id=id; selected_all=all; selected_product=name; selected_brand=brand;
    selected_ptype=type; selected_psubtype=subtype; selected_presentation=presentation;
    selected_normal_price=price; selected_normal_unit=unitPrice;
    $('search').value=all; $('product_id').value=id;
    $('purchase_product_label').textContent=all;
    $('price').placeholder=price == null ? 'Ingresá el precio' : 'Referencia: '+formatProductPrice(price);
    another_similar_product(); read_products(); openModuleSection('compare_section');
    void configureStockSelection(id);
    void catalogWithPrices().then(rows=>{const row=rows.find(p=>p.id===id);if(row && selected_id===id) prepareComparison(row);});
};
function identifier() {
    if (!crypto.randomUUID) throw new Error('Abrí Mercado mediante HTTPS para usar el guardado sin conexión');
    return crypto.randomUUID();
}
let editingProduct=null,editingRevision=null;
async function showProductActions(id) {
    const row=(await localRead('catalog')).find(p=>p.id===id);if(!row) return;
    productFilterSnapshot={category:selected_class_filter,product:selected_product_filter,brand:selected_brand_filter};
    selected_class_filter=row.product_class || null;selected_product_filter=row.product_name || null;selected_brand_filter=row.product_brand || null;
    class_filter_active=selected_class_filter!==null;product_filter_active=selected_product_filter!==null;
    await closeProductEditor(false);await closeShelfPrice(false);actionProductId=id;$('product_actions_title').textContent='¿Qué querés hacer?';
    $('product_actions').dataset.productId=id;$('product_actions').hidden=false;
    await read_products();
    showModule('products',{scroll:false});$('product_actions').querySelector('button').focus({preventScroll:true});
    if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        $('product_actions').animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,easing:'ease-out'});
    }
    centerProductCard($('product_actions').closest('.product-card'),true);
}
async function closeProductActions(restore=true) {
    const id=actionProductId;
    const root=document.documentElement;
    const previousScrollBehavior=root.style.scrollBehavior,previousAnchor=root.style.overflowAnchor;
    if(restore && id) {
        root.style.scrollBehavior='auto';root.style.overflowAnchor='none';
        if($('product_actions').contains(document.activeElement)) document.activeElement.blur();
    }
    if(restore && productFilterSnapshot) {
        selected_class_filter=productFilterSnapshot.category;selected_product_filter=productFilterSnapshot.product;selected_brand_filter=productFilterSnapshot.brand;
        class_filter_active=selected_class_filter!==null;product_filter_active=selected_product_filter!==null;
    }
    productFilterSnapshot=null;
    actionProductId=null;revealedProductId=null;await read_products();$('product_actions').hidden=true;
    if(restore && id) {
        const card=[...$('data_table').querySelectorAll('.product-card')].find(element=>element.dataset.productId===id);
        if(card) {
            // Reponer la lista y su posición antes de que el navegador pinte el siguiente cuadro.
            const bounds=card.getBoundingClientRect(),header=$('navbar').getBoundingClientRect().height;
            const top=window.scrollY+bounds.top-Math.max(header+16,(window.innerHeight+header-bounds.height)/2);
            window.scrollTo({top:Math.max(0,top),behavior:'auto'});
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            window.scrollTo({top:Math.max(0,top),behavior:'auto'});
            if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                $('data_table').animate([{opacity:.35},{opacity:1}],{duration:220,easing:'ease-out'});
            }
        }
        root.style.scrollBehavior=previousScrollBehavior;root.style.overflowAnchor=previousAnchor;
    }
}
async function recordSameShelfPrice() {
    if(saving) return;
    saving=true;
    try {
        const id=$('product_actions').dataset.productId;
        const row=(await catalogWithPrices()).find(p=>p.id===id);
        const value=row?.last_price ?? row?.normal_price;
        if(value==null) throw new Error('Este producto todavía no tiene un precio registrado');
        const promotion=row.last_price_source==='shelf' ? row.last_price_conditions || 'none' : row.last_price_promotion ? 'offer' : 'none';
        const payload={product_id:id,price:promotion==='special' ? null : decimalInput(row.last_price_source==='shelf' ? row.last_list_price ?? value : value,4),price_basis:shelfBasis(row),promotion,...eventFields()};
        if(promotion==='special') Object.assign(payload,{special_quantity:Number(row.last_offer_quantity),special_total:row.last_offer_total,promotion_description:row.last_price_description});
        const state=await shoppingState();
        const branch=state.branches.find(b=>b.id===$('shelf_branch').value);
        if(!branch) {
            await closeProductActions(false);await openShelfPrice(row);
            $('shelf_price').value=payload.price || '';$('shelf_promotion').value=promotion;
            if(promotion==='special') {$('shelf_special_quantity').value=payload.special_quantity;$('shelf_special_total').value=payload.special_total;$('shelf_special_description').value=payload.promotion_description || '';}
            updateSpecialPromotion();
            notice('El precio ya está cargado. Elegí el local y guardá la observación.');
            return;
        }
        Object.assign(payload,{branch_id:branch.id,market:(branch.name+' · '+(branch.address || 'Local sin confirmar')).slice(0,255)});
        await queueOperation('shelf_price',payload);
        await closeProductActions();
        notice('Nueva observación guardada con el mismo precio y fecha de hoy: '+payload.market+'.');
        void sync_pending();
    } catch(error) {notice('No se guardó: '+error.message);}
    finally {saving=false;}
}
async function useProduct(action) {
    const id=$('product_actions').dataset.productId,row=(await catalogWithPrices()).find(p=>p.id===id);if(!row) return;
    await closeProductActions(false);
    if(action==='edit') {await editProduct(id);return;}
    if(action==='shelf') {await openShelfPrice(row);return;}
    if(['add','remove'].includes(action) && row.unit_status!=='confirmed') {await editProduct(id);notice('Confirmá la modalidad, unidad y contenido para gestionar el stock.');return;}
    select_product(row.id,row.product_all,row.product_name,row.product_brand,row.product_ptype,row.product_psubtype,row.normal_price,row.normal_unit,row.presentation);
    await configureStockSelection(id);
    if(action==='compare') {prepareComparison(row);openModuleSection('compare_section');return;}
    if(action==='purchase') {openModuleSection('instances_section');return;}
    stockMovementProduct=action==='remove' ? id : null;await renderStock();openModuleSection('stock_section');
    if(action==='add') {$('initial_quantity').focus();return;}
    $('movement_reason').value='consume';$('movement_quantity').value='';$('movement_lot').focus();
    if(!$('movement_lot').options.length || $('movement_lot').options.length===1) notice('Este producto todavía no tiene existencias para descontar.');
}
async function renderNewProductSuggestions(control,container) {
    const fields={product:'product_name',brand:'product_brand',ptype:'product_ptype',psubtype:'product_psubtype',new_category:'product_class',new_flavor:'flavor',branch_name:'name',branch_address:'address'};
    if(!db || !fields[control.id]) return;
    const generation=(container.suggestionGeneration || 0)+1;container.suggestionGeneration=generation;
    const normalize=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('es');
    let rows=control.id.startsWith('branch_') ? (await shoppingState()).branches : await localRead('catalog');
    if(generation!==container.suggestionGeneration) return;
    if(['ptype','psubtype'].includes(control.id) && $('product').value.trim()) rows=rows.filter(row=>catalogLabelKey(row.product_name,'product_name')===catalogLabelKey($('product').value,'product_name'));
    if(control.id==='psubtype' && $('ptype').value.trim()) rows=rows.filter(row=>normalize(row.product_ptype)===normalize($('ptype').value));
    if(control.id==='branch_address' && $('branch_name').value.trim()) rows=rows.filter(row=>normalize(row.name)===normalize($('branch_name').value));
    const query=normalize(control.value),values=new Map();
    for(const row of rows) {const value=String(row[fields[control.id]] || '').trim(),key=normalize(value);if(value && key.includes(query) && !values.has(key)) values.set(key,value);}
    container.replaceChildren();
    for(const value of [...values.values()].sort((a,b)=>a.localeCompare(b,'es'))) {
        const button=document.createElement('button');button.type='button';button.textContent=value;
        button.addEventListener('pointerdown',event=>event.preventDefault());
        button.onclick=()=>{control.value=value;control.dispatchEvent(new Event('input',{bubbles:true}));control.dispatchEvent(new Event('change',{bubbles:true}));const row=control.closest('.editor-field-row');row.classList.remove('suggestions-open');const toggle=row.querySelector('.suggestions-toggle');toggle.setAttribute('aria-expanded','false');toggle.focus({preventScroll:true});};
        container.append(button);
    }
    container.style.setProperty('--suggestions-height',(container.scrollHeight+8)+'px');
}
function toggleMultipleProducts() {
    const enabled=$('new_product_form').classList.toggle('multiple-products');
    $('multiple_products_toggle').setAttribute('aria-pressed',String(enabled));
}
function arrangeEditorFields(form=$('product_editor').querySelector('form')) {
    form.setAttribute('autocomplete','off');
    for(const label of [...form.querySelectorAll('label:not(.editor-field)')]) {
        const control=label.querySelector('input,select'),title=[...label.childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent).join('').trim();
        const row=document.createElement('div');row.className='editor-field-row';
        control.addEventListener('focus',()=>row.classList.add('field-writing'));
        row.addEventListener('focusout',()=>queueMicrotask(()=>{if(!row.contains(document.activeElement) || document.activeElement.classList.contains('suggestions-toggle')) row.classList.remove('field-writing');}));
        label.className='editor-field';label.replaceChildren(control);control.setAttribute('aria-label',title);
        control.setAttribute('autocomplete','off');
        control.setAttribute('data-lpignore','true');control.setAttribute('data-1p-ignore','true');control.setAttribute('data-bwignore','true');
        if(control.tagName==='INPUT') {
            control.placeholder=title;control.setAttribute('autocorrect','off');control.spellcheck=false;
            control.inputMode=control.getAttribute('inputmode') || (control.type==='number' ? 'decimal' : 'text');
        }
        const caption=document.createElement('span');caption.className='editor-field-caption';label.append(caption);
        const update=()=>{let value=control.tagName==='SELECT' ? control.selectedOptions[0]?.textContent : control.value;if(control.id==='stock_package_content' && value!=='') value=Number(value).toFixed(2).replace('.',',');caption.textContent=title+(value ? ': '+value : '');};
        control.addEventListener('input',update);control.addEventListener('change',update);control.addEventListener('blur',update);
        control.editorCaptionUpdate=update;
        const clear=document.createElement('button'),next=document.createElement('button');
        clear.type=next.type='button';clear.textContent='X';next.textContent='>';
        clear.setAttribute('aria-label','Borrar campo');clear.title='Borrar campo';
        next.setAttribute('aria-label','Siguiente campo');next.title='Siguiente campo';
        clear.className='editor-field-clear';next.className='editor-field-next';
        clear.onclick=()=>{
            if(control.disabled) return;
            if(control.tagName==='SELECT' && ![...control.options].some(option=>option.value==='')) {
                const option=document.createElement('option');option.value='';option.textContent='Elegir…';control.prepend(option);
            }
            control.value='';control.dispatchEvent(new Event('input',{bubbles:true}));control.dispatchEvent(new Event('change',{bubbles:true}));control.focus({preventScroll:true});
        };
        next.addEventListener('pointerdown',event=>event.preventDefault());
        next.onclick=()=>{
            const fields=[...form.querySelectorAll('.editor-field input,.editor-field select')].filter(field=>!field.disabled && field.getClientRects().length);
            const index=fields.indexOf(control),target=fields[index+1] || form.querySelector('button[onclick="saveProductEdit()"],button[onclick="save_product_form()"],button[onclick="saveBranch()"]');
            // iOS necesita que el foco se cambie dentro del toque, sin esperar ni animar el desplazamiento.
            target?.focus();
            if(target?.tagName==='INPUT' && target.type!=='number') target.setSelectionRange(target.value.length,target.value.length);
        };
        label.before(row);row.append(label);
        if(form.id!=='new_product_form' && !form.closest('#product_editor')) row.append(clear,next);
        if(form.id==='new_product_form' && ['product','brand','ptype','psubtype'].includes(control.id)) {
            const checkbox=$('checkbox_'+control.id);checkbox.className='copy-field-checkbox';checkbox.setAttribute('aria-label','Conservar '+title+' para varios productos');row.classList.add('copy-field-row');row.prepend(checkbox);
        }
        if((form.id==='new_product_form' && ['product','brand','ptype','psubtype','new_category','new_flavor'].includes(control.id)) || form.id==='branch_form') {
            row.classList.add('has-suggestions');
            const toggle=document.createElement('button');toggle.type='button';toggle.className='suggestions-toggle';toggle.textContent='e';toggle.title='Etiquetas';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Mostrar etiquetas de '+title);label.after(toggle);
            const suggestions=document.createElement('div');suggestions.className='new-product-suggestions';suggestions.setAttribute('aria-label','Opciones existentes para '+title);row.append(suggestions);
            const refresh=()=>void renderNewProductSuggestions(control,suggestions);
            toggle.onclick=async()=>{
                row.classList.remove('field-writing');
                const opening=!row.classList.contains('suggestions-open');
                for(const other of form.querySelectorAll('.has-suggestions')) {other.classList.remove('suggestions-open');other.querySelector('.suggestions-toggle').setAttribute('aria-expanded','false');}
                row.classList.toggle('suggestions-open',opening);toggle.setAttribute('aria-expanded',String(opening));
                toggle.focus({preventScroll:true});
                if(opening) {await renderNewProductSuggestions(control,suggestions);revealProductControls(row);}
            };
            control.addEventListener('focus',()=>{row.classList.remove('suggestions-open');toggle.setAttribute('aria-expanded','false');});
            control.addEventListener('input',refresh);control.addEventListener('change',refresh);
        }
    }
    for(const control of form.querySelectorAll('.editor-field input,.editor-field select')) control.editorCaptionUpdate();
    setupPackContents(form.id==='new_product_form' ? 'new_' : form.closest('#product_editor') ? 'stock_' : null);
}
function recalculatePackContents(prefix,strict=false) {
    const each=$(prefix+'unit_content'),total=$(prefix+'total_content');
    const source=total.dataset.source==='total' ? total : each,target=source===total ? each : total;
    if(!source.value.trim()) {target.value='';target.editorCaptionUpdate?.();return;}
    try {
        const count=scaledDecimal($(prefix+'package_content').value,6,true);
        if(count%1000000n || count<2000000n) throw new Error('Ingresá la cantidad de unidades del paquete: un número entero de 2 o más');
        const quantity=scaledDecimal(source.value,6,true);
        const result=source===total ? roundedDivide(quantity*1000000n,count) : quantity*count/1000000n;
        target.value=decimalText(result,6).replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'').replace('.',',');
        target.editorCaptionUpdate?.();
    } catch(error) {target.value='';target.editorCaptionUpdate?.();if(strict) throw error;}
}
function setupPackContents(prefix) {
    if(!prefix) return;
    const each=$(prefix+'unit_content'),total=$(prefix+'total_content');
    if(total.dataset.ready) return;
    total.dataset.ready='true';
    const pair=document.createElement('div');pair.className='pack-content-pair';pair.dataset.prefix=prefix;
    const first=each.closest('.editor-field-row');first.before(pair);pair.append(first,total.closest('.editor-field-row'));
    for(const [field,source] of [[each,'each'],[total,'total']]) field.addEventListener('input',()=>{total.dataset.source=source;recalculatePackContents(prefix);});
    $(prefix+'package_content').addEventListener('input',()=>recalculatePackContents(prefix));
}
function updateProductEditorFields() {
    const mode=$('stock_sale_mode').value;
    const byUnit=mode==='unit';
    for(const id of ['stock_unit_content','stock_total_content','stock_unit_content_unit']) $(id).closest('.editor-field-row').hidden=mode!=='multipack';
    $('stock_total_content').closest('.pack-content-pair').hidden=mode!=='multipack';
    for(const id of ['stock_content_unit','stock_package_content']) {
        const control=$(id);
        (control.closest('.editor-field-row') || control.closest('label')).hidden=byUnit;
    }
    const unit=$('stock_content_unit');
    if(byUnit || mode==='multipack') {
        if(unit.value!=='unit') unit.dataset.previousUnit=unit.value;
        unit.value='unit';
    } else if(unit.dataset.previousUnit) {
        unit.value=unit.dataset.previousUnit;
        delete unit.dataset.previousUnit;
    }
    unit.editorCaptionUpdate?.();
}
$('stock_sale_mode').addEventListener('change',updateProductEditorFields);
async function editProduct(id) {
    $('delete_product_confirmation').hidden=true;
    const row=(await localRead('catalog')).find(p=>p.id===id);if(!row) return;
    editingProduct=id;editingRevision=row.revision || 1;
    await closeShelfPrice(false);
    await closeProductActions(false);
    selected_class_filter=row.product_class || null;selected_product_filter=row.product_name || null;selected_brand_filter=row.product_brand || null;
    class_filter_active=selected_class_filter!==null;product_filter_active=selected_product_filter!==null;
    $('stock_sale_mode').value=row.sale_mode==='package' && row.content_unit==='unit' && Number(row.package_content)>1 ? 'multipack' : row.sale_mode || 'package';$('stock_content_unit').value=row.content_unit || 'g';
    delete $('stock_content_unit').dataset.previousUnit;
    const content=$('stock_package_content');content.value=row.package_content==null ? '' : Number(row.package_content).toFixed(2);
    content.dataset.originalValue=row.package_content || '';content.dataset.displayValue=content.value;
    $('stock_unit_content').value=row.unit_content==null ? '' : Number(row.unit_content);
    $('stock_total_content').dataset.source='each';
    recalculatePackContents('stock_');
    $('stock_unit_content_unit').value=row.unit_content_unit || 'g';
    const hasLots=(await projectedStock()).lots.some(l=>l.product_id===id);
    for(const field of ['stock_sale_mode','stock_content_unit','stock_package_content']) $(field).disabled=hasLots;
    for(const [field,value] of [['name',row.product_name],['brand',row.product_brand],['type',row.product_ptype],['subtype',row.product_psubtype],['category',row.product_class],['flavor',row.flavor],['storage_location',row.storage_location],['storage_detail',row.storage_detail]]) $('edit_'+field).value=value || '';
    arrangeEditorFields();
    updateProductEditorFields();
    $('product_editor').hidden=false;await read_products();showModule('products',{scroll:false});
    revealProductControls($('product_editor'));
}
async function editShelfObservation() {
    try {
        const row=(await catalogWithPrices()).find(p=>p.id===editingProduct);
        const observation=row?.shelf_observation;
        if(!observation) throw new Error('Este producto todavía no tiene observaciones de góndola');
        if((await localRead('outbox')).some(op=>op.kind==='shelf_price' && op.payload.observation_id===observation.id)) throw new Error('Esta observación ya tiene una corrección pendiente. Sincronizala o corregila desde el menú de sincronización');
        await openShelfPrice(row);shelfEditingObservation=observation;
        $('shelf_price_form').querySelector('h2').textContent='Editar precio de góndola';
        $('shelf_price_form').querySelector('button[onclick="saveShelfPrice()"]').textContent='Guardar corrección';
        $('shelf_price').value=observation.price || '';$('shelf_promotion').value=observation.promotion;
        $('shelf_amount_paid').value=observation.amount_paid || '';updateShelfFractionalPreview();
        $('shelf_date').value=new Date(observation.occurred_at).toLocaleDateString('sv-SE',{timeZone:observation.event_timezone});
        $('shelf_special_quantity').value=observation.special_quantity || '';$('shelf_special_total').value=observation.special_total || '';$('shelf_special_description').value=observation.promotion_description || '';
        $('shelf_branch').value=observation.branch_id || '';await renderShelfLocals();updateSpecialPromotion();
    } catch(error) {notice(error.message);}
}
function showDeleteProductConfirmation() {
    $('delete_product_confirmation').hidden=false;
    $('delete_product_confirmation').scrollIntoView({behavior:'smooth',block:'center'});
}
async function deleteEditedProduct() {
    if(saving || !editingProduct) return;
    saving=true;
    try {
        const action=async()=>{
            const row=(await localRead('catalog')).find(p=>p.id===editingProduct);
            if(!row || (row.revision || 1)!==editingRevision) throw new Error('El producto cambió; volvé a abrir la edición');
            const stock=await projectedStock();
            if(stock.lots.some(l=>l.product_id===row.id && balanceOf(stock,l.id)>0n)) throw new Error('El producto todavía tiene stock; resolvé sus existencias antes de borrarlo');
            await queueOperationUnlocked('product_delete',{product_id:row.id,expected_revision:editingRevision},{...row,deleted_at:new Date().toISOString()});
        };
        if(navigator.locks) await navigator.locks.request('mercado-local-save',action);else await action();
        await closeProductEditor();await renderStock();await renderShopping();
        notice('Producto borrado del catálogo. Su historial se conserva.');
        void sync_pending();
    } catch(error) {notice('No se borró: '+error.message);}
    finally {saving=false;}
}
async function closeProductEditor(restore=true) {
    const id=editingProduct;
    editingProduct=null;editingRevision=null;$('product_editor').hidden=true;
    if(restore) {
        revealedProductId=null;$('search').value='';resetCatalogFilters();productFilterSnapshot=null;
        actionProductId=id;
        await closeProductActions();
    }
}
async function saveProductEdit() {
    if(saving || !editingProduct) return;saving=true;
    try {
        const action=async()=>{
            const row=(await localRead('catalog')).find(p=>p.id===editingProduct);
            if(!row || (row.revision || 1)!==editingRevision) throw new Error('El producto cambió: cancelá y volvé a abrir la edición');
            const payload={product_id:row.id,expected_revision:editingRevision,display_label:null,product:$('edit_name').value.trim(),brand:$('edit_brand').value.trim(),ptype:$('edit_type').value.trim() || null,psubtype:$('edit_subtype').value.trim() || null,category:$('edit_category').value.trim() || null,flavor:$('edit_flavor').value.trim(),storage_detail:$('edit_storage_detail').value.trim(),storage_location:$('edit_storage_location').value.trim()};
            if(!payload.product) throw new Error('Ingresá el nombre del producto');
            if(Object.values(payload).some(v=>typeof v==='string' && v.length>255)) throw new Error('Los textos admiten hasta 255 caracteres');
            if($('stock_sale_mode').value) Object.assign(payload,productSpecification('stock_'));
            const lots=(await projectedStock()).lots;
            if(payload.sale_mode && lots.some(l=>l.product_id===row.id) && (row.sale_mode!==payload.sale_mode || row.content_unit!==payload.content_unit || scaledDecimal(row.package_content,6)!==scaledDecimal(payload.package_content,6))) throw new Error('Este producto tiene stock: creá otra presentación para cambiar su contenido');
            const updated={...row,flavor:payload.flavor,storage_detail:payload.storage_detail,storage_location:payload.storage_location,unit_content:payload.unit_content,unit_content_unit:payload.unit_content_unit,revision:editingRevision+1,product_name:payload.product,product_brand:payload.brand,product_ptype:payload.ptype,product_psubtype:payload.psubtype,product_class:payload.category,product_all:[payload.product,payload.brand,payload.ptype,payload.psubtype].filter(Boolean).join(', ')};
            if(payload.sale_mode) Object.assign(updated,{sale_mode:payload.sale_mode,content_unit:payload.content_unit,package_content:payload.package_content,unit_status:'confirmed',presentation:payload.sale_mode==='package' ? decimalText(scaledDecimal(payload.package_content,6)/(payload.content_unit==='unit' ? 1n : 1000n),6) : '1.000000'});
            updated.display_label=payload.display_label;updated.product_all=productLabel(updated);
            await queueOperationUnlocked('product_edit',payload,updated);
            if(selected_id===row.id) {
                selected_product=updated.product_name;selected_brand=updated.product_brand;selected_ptype=updated.product_ptype;selected_psubtype=updated.product_psubtype;selected_all=updated.product_all;
                selected_presentation=updated.presentation;selected_sale_mode=updated.sale_mode;
                $('search').value=updated.product_all;another_similar_product();
            }
        };
        if(navigator.locks) await navigator.locks.request('mercado-local-save',action);else await action();
        await closeProductEditor();await renderStock();await renderShopping();void sync_pending();
    } catch(error) {notice('No se guardó: '+error.message+'. Los campos se conservaron.');}
    finally {saving=false;}
}
async function newPresentationFromEdit() {
    if(!editingProduct) return;
    const row=(await localRead('catalog')).find(p=>p.id===editingProduct);if(!row) return;
    for(const [id,value] of [['product',$('edit_name').value],['brand',$('edit_brand').value],['ptype',$('edit_type').value],['psubtype',$('edit_subtype').value]]) $(id).value=value;
    $('new_package_content').value='';$('new_barcode').value='';
    $('new_sale_mode').value=row.sale_mode==='package' && row.content_unit==='unit' && Number(row.package_content)>1 ? 'multipack' : row.sale_mode || 'package';$('new_content_unit').value=row.content_unit || 'g';
    $('new_flavor').value=row.flavor || '';$('new_category').value=row.product_class || '';$('new_unit_content').value=row.unit_content==null ? '' : Number(row.unit_content);$('new_unit_content_unit').value=row.unit_content_unit || 'g';$('new_total_content').dataset.source='each';recalculatePackContents('new_');updateNewProductFields();
    await closeProductEditor();openModuleSection('register_section');
    notice('Completá el nuevo contenido y guardá: se creará otro producto con su propio stock e historial.');
}
async function queueOperation(kind,payload,row=null,entityId=null) {
    const action=() => queueOperationUnlocked(kind,payload,row,entityId);
    return navigator.locks ? navigator.locks.request('mercado-local-save',action) : action();
}
async function queueOperationUnlocked(kind,payload,row=null,entityId=null) {
    const previous=await localRead('outbox');
    const op={operation_id:identifier(),entity_id:entityId || (row ? row.id : identifier()),kind,payload,created_at:new Date().toISOString(),sequence:Math.max(Date.now(),...previous.map(item => (item.sequence || 0)+1)),attempts:0};
    op.depends_on=previous.filter(item => (item.kind==='product' && item.entity_id===payload.product_id) || (['settings','product_edit'].includes(item.kind) && item.payload.product_id===payload.product_id) || (kind==='minimum' && item.kind==='minimum' && item.payload.product_id===payload.product_id) || (payload.lot_id && (item.entity_id===payload.lot_id || item.payload.lot_id===payload.lot_id))).map(item => item.operation_id);
    const refs=[payload.product_id,payload.branch_id,payload.owner_id,payload.data?.product_id,...(payload.data?.product_ids || [])].filter(Boolean);
    if(kind==='shelf_price' && payload.observation_id) op.depends_on.push(...previous.filter(item=>item.kind==='shelf_price' && item.entity_id===payload.observation_id).map(item=>item.operation_id));
    if(kind==='product_delete') op.depends_on.push(...previous.filter(item=>item.payload.product_id===payload.product_id || item.payload.data?.product_id===payload.product_id).map(item=>item.operation_id));
    if(['stock_count','stock_transfer'].includes(kind)) op.depends_on.push(...previous.filter(item=>['stock_initial','stock_move','stock_count','stock_transfer','purchase'].includes(item.kind)).map(item=>item.operation_id));
    op.depends_on.push(...previous.filter(item => ((item.kind==='branch' || item.kind==='product') && refs.includes(item.entity_id)) || (kind==='shopping_document' && item.kind==='shopping_document' && item.entity_id===op.entity_id) || (kind==='branch' && item.kind==='branch' && item.entity_id===op.entity_id)).map(item => item.operation_id));
    if (kind==='shopping_document' && payload.kind==='location') op.depends_on.push(...previous.filter(item => item.kind==='shopping_document' && item.payload.kind==='map' && item.payload.owner_id===payload.owner_id).map(item => item.operation_id));
    const effect=await stockEffect(op);
    const shopping=await shoppingEffect(op);
    await localTransaction(['catalog','outbox','stock_effects','shopping_effects'],tx => { tx.objectStore('outbox').add(op); if (row) tx.objectStore('catalog').put(row); if (effect) tx.objectStore('stock_effects').put({id:op.operation_id,...effect}); if (shopping) tx.objectStore('shopping_effects').put({id:op.operation_id,...shopping}); });
    await updateStatus(); notice('Guardado en este teléfono. Se sincronizará cuando tu PC esté disponible.'); return op;
}
save_product_form = async function (addShelf=false) {
    if (saving || !db) return; saving=true;
    try {
        const name=$('product').value.trim(); if (!name) throw new Error('Ingresá el nombre del producto');
        let presentation='1.000000';
        const payload={product:name,brand:$('brand').value.trim(),ptype:$('ptype').value.trim() || null,psubtype:$('psubtype').value.trim() || null,presentation};
        payload.category=$('new_category').value.trim() || null;
        payload.flavor=$('new_flavor').value.trim();
        payload.storage_location='';
        payload.storage_detail='';
        payload.display_label=null;
        if ($('new_barcode').value.trim()) payload.barcode=validBarcode($('new_barcode').value);
        Object.assign(payload,productSpecification('new_'));
        const fractionalPurchase=payload.sale_mode==='fractional' && !addShelf ? fractionalPurchaseValues($('new_fractional_price').value,$('new_fractional_total').value) : null;
        const fractionalShelfPrice=payload.sale_mode==='fractional' && addShelf ? adjustedPrice($('new_fractional_price').value,false) : null;
        if (payload.sale_mode==='package') payload.presentation=decimalText(scaledDecimal(payload.package_content,6)/(payload.content_unit==='unit' ? 1n : 1000n),6);
        presentation=payload.presentation;
        if (Object.values(payload).some(value => typeof value === 'string' && value.length > 255)) throw new Error('Los textos admiten hasta 255 caracteres');
        const row={id:identifier(),flavor:payload.flavor,storage_detail:payload.storage_detail,storage_location:payload.storage_location,unit_content:payload.unit_content,unit_content_unit:payload.unit_content_unit,created_at:new Date().toISOString(),product_all:[name,payload.brand,payload.ptype,payload.psubtype].filter(Boolean).join(', '),product_name:name,product_brand:payload.brand,product_ptype:payload.ptype,product_psubtype:payload.psubtype,product_class:payload.category,presentation,normal_price:null,normal_unit:null};
        if (payload.sale_mode) Object.assign(row,{sale_mode:payload.sale_mode,content_unit:payload.content_unit,package_content:payload.package_content,unit_status:'confirmed',revision:1});
        row.display_label=payload.display_label;row.product_all=productLabel(row);
        if(comparisonShelfDraft) {
            comparisonProductDraft={payload,row};
            await closeProductActions(false);
            await openShelfPrice(row);fillComparisonShelf(comparisonShelfDraft);
            notice('Completá y guardá el precio de góndola para crear el producto.');
            return;
        }
        await queueOperation('product',payload,row);
        for(const field of ['product','brand','ptype','psubtype','new_category','new_flavor','new_unit_content','new_total_content','new_barcode','new_package_content']) $(field).value='';
        $('new_unit_content_unit').value='g';
        $('new_sale_mode').value='package';$('new_content_unit').value='g';updateNewProductFields();
        await closeProductEditor(false);await closeShelfPrice(false);
        actionProductId=null;$('product_actions').hidden=true;
        $('search').value='';resetCatalogFilters();
        await read_products();
        await renderStock();
        await renderShopping();
        if(addShelf) {
            selected_product_filter=row.product_name;selected_brand_filter=row.product_brand || null;product_filter_active=true;
            await openShelfPrice(row);
            if(fractionalShelfPrice) {$('shelf_price').value=fractionalShelfPrice;$('shelf_amount_paid').value=$('new_fractional_total').value;updateShelfFractionalPreview();}
            if(comparisonShelfDraft) {fillComparisonShelf(comparisonShelfDraft);comparisonShelfDraft=null;}
            notice('Producto guardado. Completá su precio de góndola.');
        } else if(fractionalPurchase) {
            const state=await shoppingState(),branch=state.branches.find(b=>b.id===$('purchase_branch').value);
            if(branch) {
                await addCartItem({product_id:row.id,...fractionalPurchase,is_promotion:false,market:(branch.name+' · '+(branch.address || 'Local sin confirmar')).slice(0,255),branch_id:branch.id,...eventFields(),add_to_stock:true,stock_quantity:decimalText(scaledDecimal(fractionalPurchase.quantity,6)*1000n,6),stock_unit:row.content_unit,product_revision:1,location:stockPlaceLabel(productStorageLocations(row)[0]) || 'Despensa',expires_on:null,expiry_source:'exact'});
                await read_products();await renderStock();await renderShopping();openModuleSection('search_section');
                notice('Producto guardado y agregado al carrito. Confirmá la compra al pasar por caja.');
            } else {
                select_product(row.id,row.product_all,row.product_name,row.product_brand,row.product_ptype,row.product_psubtype,null,null,row.presentation);
                await configureStockSelection(row.id);$('price').value=fractionalPurchase.price;$('purchase_total').value=fractionalPurchase.total_paid;$('quantity').value=fractionalPurchase.quantity;updateFractionalPurchasePreview();openModuleSection('instances_section');
                notice('Producto guardado. Elegí el local y guardá la compra; precio, importe y cantidad ya están cargados.');
            }
        } else openModuleSection('search_section');
        comparisonShelfDraft=null;
        $('new_fractional_price').value='';$('new_fractional_total').value='';
        void sync_pending();
    } catch (error) { notice('No se guardó: '+error.message+'. Los campos se conservaron.'); }
    finally { saving=false; }
};
save_instance_form = async function () {
    if (saving || !db) return; saving=true;
    try {
        const product=(await localRead('catalog')).find(row => row.id === $('product_id').value);
        if (!product) throw new Error('Seleccioná un producto del catálogo');
        const values=purchaseAmounts(product);
        const {price,quantity,total_paid}=values;
        const quantityValue=scaledDecimal(quantity,6,true);
        decimalInput(total_paid,4);
        const branch=(await shoppingState()).branches.find(b=>b.id===$('purchase_branch').value);
        if(!branch) throw new Error('Elegí un local registrado');
        const market=(branch.name+' · '+(branch.address || 'Local sin confirmar')).slice(0,255);
        if (market.length > 255) throw new Error('El comercio admite hasta 255 caracteres');
        const payload={product_id:product.id,...values,market,occurred_at:new Date().toISOString(),event_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
        payload.branch_id=branch.id;
        if (product.unit_status==='confirmed') {
            if (product.unit_status!=='confirmed') throw new Error('Confirmá la unidad en Productos → Editar antes de sumar esta compra');
            const multiplier=product.sale_mode==='package' ? scaledDecimal(product.package_content,6,true) : product.sale_mode==='fractional' ? 1000000000n : 1000000n;
            const stock_quantity=decimalText(roundedDivide(quantityValue*multiplier,1000000n),6);
            Object.assign(payload,{add_to_stock:true,stock_quantity,stock_unit:product.content_unit,product_revision:product.revision,location:stockPlaceLabel(productStorageLocations(product)[0]) || 'Despensa',expires_on:null,expiry_source:'exact'});
        }
        await addCartItem(payload);
        reset_form();notice('Producto agregado al carrito. Todavía no se registró la compra.');
    } catch (error) { notice('No se guardó: '+error.message+'. Los campos se conservaron.'); }
    finally { saving=false; }
};
clean_promotions = function () {
    $('compare_promotions_enabled').checked=false;$('compare_promotions').hidden=true;
    document.querySelectorAll('input[name="promotion"]').forEach(input => input.checked=false);
    setPurchasePromotion('none');$('purchase_total').value='';updatePurchasePromotion(false);updateSpecialPromotion();
};
async function export_pending() {
    const data={format:'mercado-local-v4',exported_at:new Date().toISOString(),catalog:await localRead('catalog'),outbox:await localRead('outbox'),stock_cache:await localRead('stock_cache'),stock_effects:await localRead('stock_effects'),shopping_manual:await localRead('shopping_manual'),shopping_cache:await localRead('shopping_cache'),shopping_effects:await localRead('shopping_effects'),shopping_choices:await localRead('shopping_choices'),cart:await localRead('cart')};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='mercado-pendientes.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
window.onload = async function () {
    try {
        await open_database();await renderCart();await read_products();await updateStatus();await renderStock();await renderShopping();
        for(const id of ['price','quantity','checkbox_99','checkbox_quantity_1_1000']) $(id).addEventListener('input',()=>{$('purchase_total').value='';updateFractionalPurchasePreview();updatePurchasePromotion(false);});
        $('purchase_total').addEventListener('input',()=>{updateFractionalPurchasePreview();updatePurchasePromotion(false);});
        document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',event=>event.preventDefault()));
        if(navigator.storage?.persist) navigator.storage.persist().catch(()=>{});
        void sync_pending();setInterval(()=>{if(!document.hidden) void sync_pending();},30000);
        window.addEventListener('online',()=>void sync_pending());
        document.addEventListener('visibilitychange',()=>{if(!document.hidden) void sync_pending();});
    } catch(error) {
        notice('Guardado local no disponible: '+error.message+'. No cargues datos hasta resolverlo.');
        document.querySelectorAll('button[onclick^="save_"]').forEach(button=>button.disabled=true);
    }
};





let comparisonShelfDraft=null,comparisonProductDraft=null;
function setComparisonRegistration(active) {
    document.querySelector('button[onclick="save_product_form()"]').hidden=active;
    document.querySelector('button[onclick="save_product_form(true)"]').textContent=active ? 'Agregar en góndola' : 'Agregar góndola';
}
function fillComparisonShelf(draft) {
    $('shelf_price').value=draft.price;
    $('shelf_subtract_cent').checked=draft.subtractCent;
    $('shelf_promotion').value=draft.promotion;
    if(draft.special) {
        $('shelf_special_quantity').value=draft.special.quantity;
        $('shelf_special_total').value=draft.special.total;
        $('shelf_special_description').value=draft.special.description;
    }
    updateSpecialPromotion();updateShelfFractionalPreview();
}
async function registerComparisonShelf() {
    try {
        const promotion=document.querySelector('input[name="promotion"]:checked')?.id || 'none';
        const draft={price:$('new_price').value,subtractCent:$('checkbox_new_price_9_99').checked,promotion,
            special:promotion==='special' ? {quantity:$('compare_special_quantity').value,total:$('compare_special_total').value,description:$('compare_special_description').value} : null};
        const content=scaledDecimal($('new_presentation').value,6,true);
        const row=comparison_product;
        if(row && content===scaledDecimal(row.sale_mode==='fractional' ? '1' : row.presentation,6,true)) {
            comparisonShelfDraft=null;await closeProductActions(false);await openShelfPrice(row);fillComparisonShelf(draft);return;
        }
        comparisonShelfDraft=draft;setComparisonRegistration(true);
        for(const [id,value] of [['product',row?.product_name],['brand',row?.product_brand],['ptype',row?.product_ptype],['psubtype',row?.product_psubtype],['new_category',row?.product_class],['new_flavor',row?.flavor]]) $(id).value=value || '';
        const sourceUnit=$('compare_content_unit').value;
        const targetUnit=row?.content_unit || (content>=10000000n ? 'g' : 'kg');
        const unitFactors={kg:1000n,g:1n,l:1000n,ml:1n,unit:1n};
        const convertedContent=row ? roundedDivide(content*unitFactors[sourceUnit],unitFactors[targetUnit]) : content;
        $('new_sale_mode').value='package';$('new_content_unit').value=targetUnit;
        $('new_package_content').value=decimalText(convertedContent,6).replace(/\.?0+$/,'');
        $('new_barcode').value='';$('new_unit_content').value='';$('new_total_content').value='';$('new_total_content').dataset.source='each';updateNewProductFields();
        openModuleSection('register_section');
        notice('Completá la identificación de esta presentación y tocá Agregar góndola. El precio y la promoción de B se conservaron.');
    } catch(error) {notice(error.message);}
}
