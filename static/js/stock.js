function eventFields() { return {occurred_at:new Date().toISOString(),event_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}; }
function baseQuantity(value,unit) {
    const quantity=scaledDecimal(value,6,true);
    return decimalInput(decimalText(quantity*(unit==='kg' || unit==='l' ? 1000n : 1n),6),6,true);
}
function baseUnit(unit) { return unit==='kg' ? 'g' : unit==='l' ? 'ml' : unit; }
function updateNewProductFields() {
    const mode=$('new_sale_mode').value,unit=$('new_content_unit');
    const packaged=['package','multipack'].includes(mode);
    $('new_content_field').hidden=!packaged;
    $('new_package_content').required=packaged;
    $('new_package_content').disabled=!packaged;
    $('new_unit_field').hidden=mode==='unit';
    if($('new_content_field').closest('.editor-field-row')) $('new_content_field').closest('.editor-field-row').hidden=!packaged;
    if($('new_unit_field').closest('.editor-field-row')) $('new_unit_field').closest('.editor-field-row').hidden=mode==='unit';
    for(const id of ['new_unit_content','new_total_content','new_unit_content_unit']) $(id).closest('.editor-field-row').hidden=mode!=='multipack';
    $('new_total_content').closest('.pack-content-pair').hidden=mode!=='multipack';
    if(!$('new_unit_content').value && $('new_total_content').dataset.source!=='total') $('new_total_content').value='';
    for(const id of ['new_fractional_price','new_fractional_total']) $(id).closest('.editor-field-row').hidden=mode!=='fractional';
    $('new_fractional_amount').hidden=mode!=='fractional';
    for(const option of unit.options) option.disabled=(mode==='fractional' && !['kg','l'].includes(option.value)) || (['unit','multipack'].includes(mode) && option.value!=='unit');
    if(['unit','multipack'].includes(mode)) unit.value='unit';
    else if(unit.selectedOptions[0]?.disabled) unit.value=mode==='fractional' ? 'kg' : 'g';
    for(const control of $('new_product_form').querySelectorAll('input,select')) control.editorCaptionUpdate?.();
    updateNewFractionalPreview();
}
function updateNewFractionalPreview() {
    const output=$('new_fractional_amount');
    if($('new_sale_mode').value!=='fractional') return;
    try {
        const values=fractionalPurchaseValues($('new_fractional_price').value,$('new_fractional_total').value);
        output.textContent='Cantidad comprada: '+formatDisplayDecimal(String(Number(values.quantity)*1000))+' '+($('new_content_unit').value==='kg' ? 'g' : 'ml');
    } catch(error) {output.textContent='La cantidad se calcula con el precio y el importe pagado.';}
}
$('new_fractional_price').addEventListener('input',updateNewFractionalPreview);
$('new_fractional_total').addEventListener('input',updateNewFractionalPreview);
arrangeEditorFields($('new_product_form'));
updateNewProductFields();
function productSpecification(prefix) {
    const selectedMode=$(prefix+'sale_mode').value;
    if(selectedMode==='multipack') recalculatePackContents(prefix,true);
    const sale_mode=selectedMode==='multipack' ? 'package' : selectedMode;
    const unit=selectedMode==='multipack' ? 'unit' : $(prefix+'content_unit').value;
    const content=$(prefix+'package_content');
    const value=prefix==='stock_' && content.value===content.dataset.displayValue ? content.dataset.originalValue : content.value;
    if(selectedMode==='multipack' && (!Number.isInteger(Number(value)) || Number(value)<2)) throw new Error('Ingresá la cantidad de unidades del paquete: un número entero de 2 o más');
    let package_content=sale_mode==='package' ? baseQuantity(value,unit) : '1.000000';
    const content_unit=baseUnit(unit);
    if (sale_mode==='fractional') {
        if (content_unit==='unit') throw new Error('Fraccionado requiere peso o volumen');
        package_content='1000.000000';
    }
    if (sale_mode==='unit') {
        if (content_unit!=='unit') throw new Error('Venta por unidad requiere unidad física unidad');
        package_content='1.000000';
    }
    let unit_content=null,unit_content_unit=null;
    if(selectedMode==='multipack' && $(prefix+'unit_content').value.trim()) {
        const measure=$(prefix+'unit_content_unit').value;
        unit_content=baseQuantity($(prefix+'unit_content').value,measure);unit_content_unit=baseUnit(measure);
    }
    return {sale_mode,content_unit,package_content,unit_content,unit_content_unit};
}
async function configureStockSelection(id) {
    const row=(await localRead('catalog')).find(p => p.id===id);
    if (!row) return;
    $('purchase_product_label').textContent=row.product_all;
    $('initial_location').value=stockPlaceLabel(productStorageLocations(row)[0]) || 'Despensa';
    $('stock_product').value=id;
    if ($('assist_product')) $('assist_product').value=id;
    selected_sale_mode=row.sale_mode;
    stockMovementProduct=null;
    $('stock_selected').textContent=row.product_all+(row.unit_status==='confirmed' ? ' · Unidad confirmada' : ' · Confirmá unidad y modalidad');
    $('initial_unit').value=row.content_unit || 'g';
    const multipack=row.sale_mode==='package' && row.content_unit==='unit' && Number(row.package_content)>1;
    $('initial_multipack_fields').hidden=!multipack;
    $('initial_quantity_field').hidden=multipack;$('initial_unit').hidden=multipack;
    $('initial_packs').value='';$('initial_loose_units').value='';updateInitialUnitsPreview(row);

    $('stock_minimum_unit').textContent=row.content_unit || 'Unidad pendiente';
    const lots=await projectedStock();
    const preference=lots.preferences.find(p => p.product_id===id);
    $('stock_minimum').value=preference?.minimum_quantity || '0';
    const fractional=row.sale_mode==='fractional';
    $('purchase_price_label').textContent=fractional ? 'Precio por '+(row.content_unit==='g' ? 'kilo' : 'litro') : 'Precio por envase o unidad';
    $('quantity').placeholder=fractional ? 'Cantidad en '+(row.content_unit==='g' ? 'kg' : 'litros') : 'Cantidad de envases o unidades';
    $('quantity').setAttribute('aria-label',$('quantity').placeholder);
    $('quantity').readOnly=false;$('checkbox_quantity_1_1000').hidden=true;$('checkbox_quantity_1_1000').checked=false;
    $('price').required=fractional;$('purchase_total').required=false;
    if(fractional && !$('price').value && row.normal_price) $('price').value=row.normal_price;
    updateFractionalPurchasePreview();
    updatePurchasePromotion(false);
}
async function refreshStock() {
    const snapshot=await serverRequest('/api/stock');
    if (!Array.isArray(snapshot.lots) || !Array.isArray(snapshot.movements) || !Array.isArray(snapshot.confirmed_operations)) throw new Error('Stock inválido');
    await localTransaction(['stock_cache','stock_effects'],tx => {
        tx.objectStore('stock_cache').put({id:'snapshot',...snapshot});
        for (const id of snapshot.confirmed_operations) tx.objectStore('stock_effects').delete(id);
    });
}
async function projectedStock() {
    const state=await new Promise((resolve,reject) => {
        const tx=db.transaction(['stock_cache','stock_effects'],'readonly');
        const snapshot=tx.objectStore('stock_cache').get('snapshot'),effects=tx.objectStore('stock_effects').getAll();
        tx.oncomplete=() => resolve({snapshot:snapshot.result,effects:effects.result});
        tx.onerror=tx.onabort=() => reject(tx.error || new Error('No se pudo leer el stock local'));
    });
    const snapshot=state.snapshot || {lots:[],movements:[],preferences:[]};
    const lots=new Map(snapshot.lots.map(row => [row.id,row]));
    const movements=new Map(snapshot.movements.map(row => [row.id,row]));
    const preferences=new Map(snapshot.preferences.map(row => [row.product_id,row]));
    const effects=state.effects.sort((a,b) => a.sequence-b.sequence);
    for (const effect of effects) {
        if (effect.lot) lots.set(effect.lot.id,effect.lot);
        if (effect.movement) movements.set(effect.movement.id,effect.movement);
        for(const movement of effect.movements || []) movements.set(movement.id,movement);
        if (effect.preference) preferences.set(effect.preference.product_id,effect.preference);
    }
    return {lots:[...lots.values()],movements:[...movements.values()],preferences:[...preferences.values()]};
}
function signedScaled(value) { const text=String(value); return text.startsWith('-') ? -scaledDecimal(text.slice(1),6) : scaledDecimal(text,6); }
function balanceOf(data,id) { return data.movements.filter(m => m.lot_id===id).reduce((sum,m) => sum+signedScaled(m.quantity),0n); }
async function stockEffect(op) {
    const p=op.payload;
    const effect={sequence:op.sequence};
    if (op.kind==='stock_initial' || (op.kind==='purchase' && p.add_to_stock)) {
        effect.lot={id:op.entity_id,product_id:p.product_id,purchase_id:op.kind==='purchase' ? op.entity_id : null,unit:p.unit || p.stock_unit,location:p.location,expires_on:p.expires_on,expiry_source:p.expiry_source,created_at:p.occurred_at};
        effect.movement={id:op.entity_id,lot_id:op.entity_id,quantity:p.quantity,reason:op.kind==='purchase' ? 'purchase' : 'initial',occurred_at:p.occurred_at,event_timezone:p.event_timezone};
        effect.movement.quantity=op.kind==='purchase' ? p.stock_quantity : p.quantity;
    } else if(['stock_count','stock_transfer'].includes(op.kind)) {
        const data=await projectedStock();
        const source=op.kind==='stock_transfer' ? data.lots.find(l=>l.id===p.lot_id) : null;
        const product=(await localRead('catalog')).find(row=>row.id===(p.product_id || source?.product_id));
        if(!product) throw new Error('Falta el producto');
        const lots=source ? [source] : data.lots.filter(l=>l.product_id===p.product_id && l.location===p.location).sort((a,b)=>(a.expires_on || '9999').localeCompare(b.expires_on || '9999') || a.id.localeCompare(b.id));
        const current=lots.reduce((sum,lot)=>sum+balanceOf(data,lot.id),0n);
        if(current!==scaledDecimal(p.expected_balance,6)) throw new Error('Las existencias cambiaron; volvé a abrir el formulario');
        const target=scaledDecimal(p.quantity,6);
        if(product.content_unit==='unit' && target%1000000n) throw new Error('Ingresá unidades enteras');
        let remove=op.kind==='stock_transfer' ? target : current>target ? current-target : 0n;
        if(source && (!target || target>current || source.location===p.location)) throw new Error('Revisá cantidad y destino del traslado');
        effect.movements=[];
        for(const lot of lots) {
            const balance=balanceOf(data,lot.id),amount=balance<remove ? balance : remove;
            if(amount) effect.movements.push({id:op.entity_id+'-'+lot.id,lot_id:lot.id,quantity:decimalText(-amount,6),reason:'adjust',occurred_at:p.occurred_at,event_timezone:p.event_timezone,note:source?'Traslado: salida':'Inventario: diferencia negativa'});
            remove-=amount;
        }
        const add=source ? target : target>current ? target-current : 0n;
        if(add) {
            effect.lot={id:op.entity_id,product_id:product.id,purchase_id:source?.purchase_id || null,unit:product.content_unit,location:p.location,expires_on:source?.expires_on || p.expires_on || null,expiry_source:source?.expiry_source || 'exact',created_at:p.occurred_at};
            effect.movements.push({id:op.entity_id,lot_id:op.entity_id,quantity:decimalText(add,6),reason:'adjust',occurred_at:p.occurred_at,event_timezone:p.event_timezone,note:source?'Traslado: entrada':'Inventario: diferencia positiva'});
        }
    } else if (op.kind==='minimum') {
        effect.preference={product_id:p.product_id,minimum_quantity:p.quantity,revision:p.expected_revision+1};
    } else if (op.kind==='stock_move') {
        const data=await projectedStock();
        if (!data.lots.some(lot => lot.id===p.lot_id)) throw new Error('Elegí un lote');
        let quantity=scaledDecimal(p.quantity,6);
        if (p.reason==='reversal') {
            const old=data.movements.find(m => m.id===p.reverses_id && m.lot_id===p.lot_id);
            if (!old || old.reason==='reversal' || data.movements.some(m => m.reverses_id===old.id)) throw new Error('El movimiento no puede revertirse');
            quantity=-signedScaled(old.quantity);
        } else if (p.reason==='open') quantity=0n;
        else {
            if (!quantity) throw new Error('Ingresá una cantidad positiva');
            if (p.reason==='consume' || p.reason==='discard' || p.direction==='remove') quantity=-quantity;
        }
        if (balanceOf(data,p.lot_id)+quantity<0n) throw new Error('La cantidad supera lo que queda en ese lote');
        effect.movement={id:op.entity_id,lot_id:p.lot_id,quantity:decimalText(quantity,6),reason:p.reason,reverses_id:p.reverses_id || null,occurred_at:p.occurred_at,event_timezone:p.event_timezone,note:p.note};
    } else return null;
    return effect;
}
async function stockAction(action,{preserveLocationDrafts=false}={}) {
    if (saving || !db) return false; saving=true;
    try { await action(); await renderStock({forceLocations:!preserveLocationDrafts}); await renderShopping();await renderCart(); void sync_pending(); return true; }
    catch(error) { notice('No se guardó: '+error.message+'. Los datos se conservaron.'); return false; }
    finally { saving=false; }
}
async function save_stock_settings() {
    await editProduct($('stock_product').value);
}
function initialMultipackQuantity(product) {
    const packs=scaledDecimal($('initial_packs').value || '0',0);
    const loose=scaledDecimal($('initial_loose_units').value || '0',0);
    const perPack=scaledDecimal(product.package_content,0,true);
    return (packs*perPack+loose)*1000000n;
}
async function updateInitialUnitsPreview(product=null) {
    try {
        if(!product) product=(await localRead('catalog')).find(p=>p.id===$('stock_product').value);
        if(!product || $('initial_multipack_fields').hidden) {$('initial_units_preview').textContent='';return;}
        const quantity=initialMultipackQuantity(product);
        $('initial_units_preview').textContent=Number(product.package_content)+' unidades por paquete · Total: '+formatDisplayDecimal(decimalText(quantity/1000000n,0))+' unidades';
    } catch(error) {$('initial_units_preview').textContent='Ingresá cantidades enteras de paquetes y unidades.';}
}
for(const id of ['initial_packs','initial_loose_units']) $(id).addEventListener('input',()=>void updateInitialUnitsPreview());
async function save_initial_stock() {
    await stockAction(async () => {
        const row=(await localRead('catalog')).find(p => p.id===$('stock_product').value);
        if (!row || row.unit_status!=='confirmed') throw new Error('Confirmá primero unidad y modalidad');
        const unit=baseUnit($('initial_unit').value);
        if (unit!==row.content_unit) throw new Error('La unidad debe coincidir con el producto');
        const multipack=row.sale_mode==='package' && row.content_unit==='unit' && Number(row.package_content)>1;
        const quantity=multipack ? decimalText(initialMultipackQuantity(row),6) : baseQuantity($('initial_quantity').value,$('initial_unit').value);
        const count=scaledDecimal(quantity,6,true);
        if(unit==='unit' && count%1000000n!==0n) throw new Error('Ingresá unidades enteras');
        await queueOperation('stock_initial',{product_id:row.id,quantity,unit,location:$('initial_location').value.trim() || 'Despensa',expires_on:$('initial_expiry').value || null,expiry_source:$('initial_expiry_source').value,...eventFields()});
        $('initial_quantity').value='';$('initial_packs').value='';$('initial_loose_units').value='';updateInitialUnitsPreview(row);
    });
}
async function save_stock_move() {
    await stockAction(async () => {
        const data=await projectedStock(); const lot=data.lots.find(l => l.id===$('movement_lot').value);
        if (!lot) throw new Error('Elegí un lote');
        const reason=$('movement_reason').value;
        if(reason!=='open' && lot.unit==='unit' && scaledDecimal($('movement_quantity').value,6,true)%1000000n!==0n) throw new Error('El consumo se registra en unidades enteras, no en paquetes');
        await queueOperation('stock_move',{lot_id:lot.id,quantity:reason==='open' ? '0.000000' : decimalInput($('movement_quantity').value,6,true),reason,direction:$('movement_direction').value,note:$('movement_note').value,...eventFields()});
        $('movement_quantity').value=''; $('movement_note').value='';
    });
}
async function reverseMovement(movement) {
    await stockAction(() => queueOperation('stock_move',{lot_id:movement.lot_id,quantity:'0.000000',reason:'reversal',reverses_id:movement.id,note:'Corrección por reverso',...eventFields()}));
}
async function save_minimum() {
    await stockAction(async () => {
        const product=(await localRead('catalog')).find(p => p.id===$('stock_product').value);
        if (!product || product.unit_status!=='confirmed') throw new Error('Confirmá la unidad del producto');
        const data=await projectedStock(); const pref=data.preferences.find(p => p.product_id===product.id);
        await queueOperation('minimum',{product_id:product.id,quantity:decimalInput($('stock_minimum').value,6),expected_revision:pref?.revision || 0});
    });
}
function todayLocal(now=new Date()) { return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; }
function appendText(parent,text,tag='p') { const child=document.createElement(tag); child.textContent=text; parent.append(child); return child; }
let stockMovementProduct=null;
let selectedStockLocation=null,selectedStockDetail=null,selectedStockFamily=null;
function productStorageLocations(product) {
    const locations=Array.isArray(product.storage_locations) ? product.storage_locations.map(item=>({...item})) : [];
    if(product.storage_location) {
        const first={location:product.storage_location,detail:product.storage_detail || '',role:locations[0]?.role || 'daily'};
        if(locations.length) locations[0]=first;else locations.push(first);
    }
    return locations;
}
function stockPlaceSuggestionField(input,values) {
    const wrapper=document.createElement('div');wrapper.className='stock-place-field stock-place-tags-first';
    input.hidden=true;
    const toggle=document.createElement('button');toggle.type='button';toggle.className='suggestions-toggle';toggle.textContent='+';toggle.setAttribute('aria-label','Escribir '+input.placeholder);toggle.setAttribute('aria-expanded','false');
    const suggestions=document.createElement('div');suggestions.className='new-product-suggestions';suggestions.setAttribute('aria-label',input.placeholder);
    const refresh=()=>{
        suggestions.replaceChildren();const options=new Map();
        for(const value of [...values(),input.value]) {const text=(value || '').trim();if(text)options.set(catalogLabelKey(text,''),text);}
        for(const value of [...options.values()].sort((a,b)=>a.localeCompare(b,'es'))) {
            const button=document.createElement('button');button.type='button';button.textContent=value;button.setAttribute('aria-pressed',String(catalogLabelKey(value,'')===catalogLabelKey(input.value,'')));
            button.onclick=()=>{
                const changed=input.value!==value;input.value=value;input.hidden=true;wrapper.classList.remove('place-writing');toggle.setAttribute('aria-expanded','false');toggle.focus({preventScroll:true});
                if(changed && input.dataset.placeField==='location') wrapper.closest('.stock-place-entry').querySelector('[data-place-field=detail]').value='';
                input.dispatchEvent(new Event('input',{bubbles:true}));
            };suggestions.append(button);
        }
        if(!options.size) {const empty=document.createElement('span');empty.className='cart-meta';empty.textContent=input.placeholder+': todavía no hay opciones.';suggestions.append(empty);}
    };
    wrapper.refreshPlaceTags=refresh;
    input.addEventListener('input',()=>{for(const field of wrapper.closest('.stock-place-entry').querySelectorAll('.stock-place-field'))field.refreshPlaceTags?.();});
    toggle.onclick=()=>{input.hidden=!input.hidden;wrapper.classList.toggle('place-writing',!input.hidden);toggle.setAttribute('aria-expanded',String(!input.hidden));if(!input.hidden)input.focus();};
    wrapper.append(suggestions,toggle,input);refresh();return wrapper;
}
function renderStockLocations(products,data,{force=false}={}) {
    if(!force && $('stock_location_products').querySelector('.stock-location-editor:not([hidden]),.stock-distribution-form,.stock-count-dirty')) return;
    const filters=$('stock_location_filters'),namedFilters=$('stock_named_location_filters'),detailFilters=$('stock_detail_filters'),list=$('stock_location_products');
    for(const element of [filters,namedFilters,detailFilters,list]) element.replaceChildren();
    detailFilters.hidden=true;
    const key=value=>(value || '').trim().toLocaleLowerCase('es');
    const families=new Map();
    for(const product of products) {
        const name=JSON.stringify([catalogLabelKey(product.product_name || product.product_all,'product_name'),catalogLabelKey(product.product_ptype,''),catalogLabelKey(product.product_psubtype,'')]);
        if(!families.has(name)) families.set(name,{key:name,name:[product.product_name || product.product_all,product.product_ptype,product.product_psubtype].filter(Boolean).join(' · '),products:[],locations:[]});
        const family=families.get(name);family.products.push(product);
        for(const place of productStorageLocations(product)) if(!family.locations.some(item=>key(item.location)===key(place.location)&&key(item.detail)===key(place.detail)&&item.role===place.role)) family.locations.push(place);
    }
    const places=new Map();
    for(const family of families.values()) for(const place of family.locations) places.set(key(place.location),place.location);
    if(selectedStockLocation && !places.has(selectedStockLocation)) {selectedStockLocation=null;selectedStockDetail=null;}
    const render=()=>renderStockLocations(products,data,{force:true});
    const add=(parent,label,active,action)=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-pressed',String(active));button.onclick=action;parent.append(button);return button;};
    if(selectedStockLocation===null) {
        add(filters,'Todas',true,()=>{selectedStockDetail=null;render();});add(filters,'Sin ubicación',false,()=>{selectedStockLocation='';selectedStockDetail=null;render();});
        for(const [id,label] of [...places].sort((a,b)=>a[1].localeCompare(b[1],'es'))) add(namedFilters,label,false,()=>{selectedStockLocation=id;selectedStockDetail=null;render();});
    } else {
        const label=(places.get(selectedStockLocation) || 'Sin ubicación')+(selectedStockDetail!==null ? ' · '+(selectedStockDetail || 'Sin ubicación interna') : '');
        add(filters,label,true,()=>{if(selectedStockDetail!==null)selectedStockDetail=null;else selectedStockLocation=null;render();});
        const back=add(filters,'<',false,()=>{selectedStockLocation=null;selectedStockDetail=null;render();});back.className='stock-filter-back';back.setAttribute('aria-label','Volver a todas las ubicaciones');
        if(selectedStockLocation && selectedStockDetail===null) {
            detailFilters.hidden=false;
            const details=[...new Set([...families.values()].flatMap(f=>f.locations).filter(p=>key(p.location)===selectedStockLocation).map(p=>p.detail))].sort((a,b)=>a.localeCompare(b,'es'));
            for(const detail of details)add(detailFilters,detail || 'Sin ubicación interna',false,()=>{selectedStockDetail=detail;render();});
        }
    }
    namedFilters.hidden=selectedStockLocation!==null;
    for(const family of [...families.values()].sort((a,b)=>a.name.localeCompare(b.name,'es'))) {
        if(selectedStockLocation==='' && family.locations.length)continue;
        if(selectedStockLocation && !family.locations.some(p=>key(p.location)===selectedStockLocation&&(selectedStockDetail===null||p.detail===selectedStockDetail)))continue;
        const card=document.createElement('article');card.className='cart-card stock-location-card';appendText(card,family.name,'strong');
        const locations=appendText(card,family.locations.map(p=>[p.location,p.detail,p.role==='reserve'?'Reserva':'Uso diario'].filter(Boolean).join(' · ')).join(' / ') || 'Sin ubicación');locations.className='cart-meta stock-place-summary';
        if(selectedStockLocation!==null) {
            locations.textContent=selectedStockLocation && selectedStockDetail===null ? [...new Set(family.locations.filter(p=>key(p.location)===selectedStockLocation).map(p=>p.detail).filter(Boolean))].join(' / ') : '';
            locations.hidden=!locations.textContent;
        }
        const edit=document.createElement('button');edit.type='button';edit.className='stock-location-edit';edit.textContent='Editar';edit.setAttribute('aria-label','Editar ubicación de '+family.name);
        const editor=document.createElement('form');editor.className='stock-location-editor';editor.hidden=true;
        const entries=document.createElement('div');entries.className='stock-location-entries';
        const addEntry=place=>{
            const row=document.createElement('div');row.className='stock-place-entry';
            const location=document.createElement('input');location.placeholder='Ubicación';location.setAttribute('aria-label','Ubicación');location.maxLength=255;location.value=place?.location || '';location.dataset.placeField='location';
            const detail=document.createElement('input');detail.placeholder='Ubicación interna';detail.setAttribute('aria-label','Ubicación interna');detail.maxLength=255;detail.value=place?.detail || '';detail.dataset.placeField='detail';
            const role=document.createElement('select');role.setAttribute('aria-label','Uso de la ubicación');role.add(new Option('Uso diario','daily'));role.add(new Option('Reserva','reserve'));role.value=place?.role || 'daily';
            const remove=document.createElement('button');remove.type='button';remove.textContent='Quitar ubicación';remove.className='stock-location-cancel';remove.onclick=()=>row.remove();const known=()=>products.flatMap(productStorageLocations);
            const locationField=stockPlaceSuggestionField(location,()=>known().map(p=>p.location));
            const detailField=stockPlaceSuggestionField(detail,()=>known().filter(p=>!location.value.trim() || key(p.location)===key(location.value)).map(p=>p.detail));
            detailField.hidden=!location.value.trim();
            let previousLocation=location.value;
            location.addEventListener('input',()=>{
                if(location.value!==previousLocation) {detail.value='';previousLocation=location.value;}
                detailField.hidden=!location.value.trim();
                if(detailField.hidden) {detail.hidden=true;detailField.classList.remove('place-writing');detailField.querySelector('.suggestions-toggle').setAttribute('aria-expanded','false');}
                detailField.refreshPlaceTags();
            });
            row.append(locationField,detailField,role,remove);entries.append(row);
        };
        for(const place of family.locations)addEntry(place);if(!family.locations.length)addEntry();
        const more=document.createElement('button');more.type='button';more.textContent='Agregar ubicación';more.onclick=()=>addEntry();
        const save=document.createElement('button');save.type='submit';save.textContent='Guardar';
        const cancel=document.createElement('button');cancel.type='button';cancel.className='stock-location-cancel';cancel.textContent='Cancelar';
        const actions=document.createElement('div');actions.className='stock-location-editor-actions';actions.append(cancel,save);
        const status=document.createElement('p');status.className='cart-meta';status.setAttribute('role','status');editor.append(entries,more,actions,status);card.append(edit,editor);
        edit.onclick=()=>{editor.hidden=false;edit.hidden=true;entries.querySelector('input')?.focus();};cancel.onclick=()=>{editor.hidden=true;edit.hidden=false;void renderStock({forceLocations:true});};
        editor.onsubmit=async event=>{
            event.preventDefault();save.disabled=true;
            try {
                const locations=[...entries.children].map(row=>({location:row.querySelector('[data-place-field=location]').value.trim(),detail:row.querySelector('[data-place-field=detail]').value.trim(),role:row.querySelector('select').value}));
                if(locations.some(p=>!p.location&&(p.detail||p.role==='reserve')))throw Error('Completá la ubicación de cada lugar');
                await saveStockFamilyLocation(family.products,locations.filter(p=>p.location));
            }catch(error){status.textContent='No se guardó: '+error.message;}finally{save.disabled=false;}
        };
        const totals=new Map();
        for(const product of family.products.sort((a,b)=>a.product_all.localeCompare(b.product_all,'es'))) {
            const lots=data.lots.filter(l=>l.product_id===product.id),total=lots.reduce((sum,l)=>sum+balanceOf(data,l.id),0n),unit=product.content_unit || lots[0]?.unit || 'unidad pendiente';
            if(total>0n)totals.set(unit,(totals.get(unit)||0n)+total);
            const variant=document.createElement('div');variant.className='stock-variant';variant.dataset.productId=product.id;appendText(variant,product.product_all,'span');const countLabel=appendText(variant,total>0n?formatDisplayDecimal(String(Number(decimalText(total,6))))+' '+unit:'Sin stock','span');countLabel.className='stock-variant-balance';card.append(variant);
            if(product.unit_status==='confirmed') addQuickStockCount(variant,product,data,family.locations);
        }
        const byPlace=new Map();
        for(const product of family.products) for(const lot of data.lots.filter(l=>l.product_id===product.id)) {
            const balance=balanceOf(data,lot.id);if(balance<=0n)continue;
            const key=lot.location+'|'+lot.unit;
            const entry=byPlace.get(key) || {location:lot.location,unit:lot.unit,quantity:0n};entry.quantity+=balance;byPlace.set(key,entry);
        }
        if(selectedStockLocation===null) for(const entry of byPlace.values()) {const line=appendText(card,entry.location+': '+formatDisplayDecimal(String(Number(decimalText(entry.quantity,6))))+' '+entry.unit);line.className='cart-meta';}
        const familyKey=family.key;
        const manage=document.createElement('div');manage.className='stock-location-editor-actions stock-card-actions';
        const occupied=new Set([...family.locations.map(stockPlaceLabel),...byPlace.values()].map(place=>typeof place==='string'?place:place.location).map(key));
        const choices=occupied.size>1 ? [['Mover','transfer']] : [];
        manage.classList.add('single-action');
        for(const [label,mode] of choices) {
            const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>openStockDistribution(card,family.products,mode);manage.append(button);
        }
        card.tabIndex=0;card.setAttribute('aria-label',family.name+'. Seleccionar para gestionar existencias');
        const active=selectedStockFamily===familyKey;manage.hidden=!active;card.classList.toggle('stock-card-selected',active);card.setAttribute('aria-expanded',String(active));
        const toggle=()=>{
            const opening=selectedStockFamily!==familyKey;selectedStockFamily=opening?familyKey:null;
            for(const other of list.querySelectorAll('.stock-location-card')) {
                other.classList.remove('stock-card-selected');other.setAttribute('aria-expanded','false');other.querySelector('.stock-card-actions').hidden=true;other.querySelector('.stock-distribution-form')?.remove();
            }
            card.classList.toggle('stock-card-selected',opening);card.setAttribute('aria-expanded',String(opening));manage.hidden=!opening;
            if(!opening)card.querySelector('.stock-distribution-form')?.remove();
        };
        card.onclick=event=>{if(!event.target.closest('button,input,select,textarea,form,a'))toggle();};
        card.onkeydown=event=>{if(event.target===card&&['Enter',' '].includes(event.key)){event.preventDefault();toggle();}};
        card.append(manage);
        const total=appendText(card,totals.size?'Total: '+[...totals].map(([unit,value])=>formatDisplayDecimal(String(Number(decimalText(value,6))))+' '+unit).join(' · '):'Sin stock');total.className='cart-meta stock-family-total';list.append(card);
    }
    if(!products.length)appendText(list,'Todavía no hay productos registrados.');
}
async function saveStockFamilyLocation(family,value,internalValue="") {
    const locations=Array.isArray(value) ? value : (value.trim() ? [{location:value.trim(),detail:internalValue.trim(),role:'daily'}] : []);
    if(locations.length>20)throw new Error('Podés registrar hasta 20 ubicaciones');
    if(locations.some(p=>!p.location.trim()||p.location.length>255||p.detail.length>255||!['daily','reserve'].includes(p.role)))throw new Error('Revisá los datos de las ubicaciones');
    const storage_detail=locations[0]?.detail || '';
    if(storage_detail.length>255) throw new Error("La ubicación interna admite hasta 255 caracteres");
    const location=locations[0]?.location || '';
    if(location.length>255) throw new Error('La ubicación admite hasta 255 caracteres');
    if(saving) throw new Error('Esperá a que termine el guardado actual');
    saving=true;
    try {
        const action=async()=>{
            const catalog=await localRead('catalog');
            const rows=family.map(old=>{
                const row=catalog.find(product=>product.id===old.id);
                if(!row || (row.revision || 1)!==(old.revision || 1)) throw new Error('Un producto cambió; volvé a abrir su tarjeta');
                return row;
            });
            for(const row of rows) {
                if(JSON.stringify(productStorageLocations(row))===JSON.stringify(locations)) continue;
                const payload={product_id:row.id,expected_revision:row.revision || 1,product:row.product_name,brand:row.product_brand || '',ptype:row.product_ptype || null,psubtype:row.product_psubtype || null,category:row.product_class || null,storage_location:location,storage_detail,storage_locations:locations};
                await queueOperationUnlocked('product_edit',payload,{...row,storage_location:location,storage_detail,storage_locations:locations,revision:(row.revision || 1)+1});
            }
        };
        if(navigator.locks) await navigator.locks.request('mercado-local-save',action);else await action();
        selectedStockLocation=null;selectedStockDetail=null;
        await renderStock({forceLocations:true});await read_products();await renderCart();
        notice('Ubicación guardada para todas las marcas y presentaciones de este producto.');void sync_pending();
    } finally {saving=false;}
}
async function renderStock({forceLocations=false}={}) {
    if (!db) return;
    const products=await localRead('catalog'), data=await projectedStock();
    renderStockLocations(products,data,{force:forceLocations});
    const current=$('stock_product').value; $('stock_product').replaceChildren(new Option('Elegí un producto',''));
    products.forEach(p => $('stock_product').add(new Option(p.product_all,p.id))); $('stock_product').value=current;
    const selectedLot=$('movement_lot').value; $('movement_lot').replaceChildren(new Option('Elegí un lote',''));
    $('stock_list').replaceChildren(); $('shopping_list').replaceChildren(); $('stock_history').replaceChildren();
    const today=todayLocal();
    const soonDate=new Date(); soonDate.setDate(soonDate.getDate()+7); const soon=todayLocal(soonDate);
    for (const product of products) {
        const lots=data.lots.filter(l => l.product_id===product.id);
        const total=lots.reduce((n,l) => n+balanceOf(data,l.id),0n);
        if (product.unit_status==='confirmed') appendText($('stock_list'),`${product.product_all}: ${decimalText(total,6)} ${product.content_unit}`,'h3');
        for (const lot of lots.sort((a,b) => (a.expires_on || '9999').localeCompare(b.expires_on || '9999'))) {
            const balance=balanceOf(data,lot.id);
            const expiry=lot.expires_on ? (lot.expires_on<today ? 'Vencido: ' : lot.expires_on<=soon ? 'Vence pronto: ' : 'Vence: ')+lot.expires_on+(lot.expiry_source==='estimated' ? ' (estimado)' : '') : 'Sin vencimiento registrado';
            appendText($('stock_list'),`${decimalText(balance,6)} ${lot.unit} · ${lot.location} · ${expiry}`);
            if((!stockMovementProduct || product.id===stockMovementProduct) && balance>0n) $('movement_lot').add(new Option(`${product.product_all} · ${lot.location} · ${lot.expires_on || 'Sin fecha'} · ${decimalText(balance,6)} ${lot.unit}`,lot.id));
        }
        const pref=data.preferences.find(p => p.product_id===product.id);
        const usable=lots.filter(l => !l.expires_on || l.expires_on>=today).reduce((n,l) => n+balanceOf(data,l.id),0n);
        if (pref && scaledDecimal(pref.minimum_quantity,6)>usable) appendText($('shopping_list'),`${product.product_all}: faltan ${decimalText(scaledDecimal(pref.minimum_quantity,6)-usable,6)} ${product.content_unit}${product.sale_mode==='package' ? ' (aprox. '+((scaledDecimal(pref.minimum_quantity,6)-usable+scaledDecimal(product.package_content,6)-1n)/scaledDecimal(product.package_content,6)).toString()+' envases)' : ''}`,'li');
    }
    $('movement_lot').value=selectedLot;
    if (!data.lots.length) appendText($('stock_list'),'Todavía no hay existencias. Confirmá la unidad de un producto y cargá lo que tenés en casa.');
    const lotMap=new Map(data.lots.map(l => [l.id,l]));
    for (const movement of [...data.movements].sort((a,b) => b.occurred_at.localeCompare(a.occurred_at))) {
        const lot=lotMap.get(movement.lot_id), product=products.find(p => p.id===lot?.product_id);
        const item=appendText($('stock_history'),`${movement.occurred_at.slice(0,10)} · ${product?.product_all || 'Producto'} · ${movement.reason}: ${movement.quantity} ${lot?.unit || ''} · ${movement.note || ''}`,'li');
        if (!/^(Traslado:|Inventario:)/.test(movement.note || '') && movement.reason!=='reversal' && signedScaled(movement.quantity)!==0n && !data.movements.some(m => m.reverses_id===movement.id)) {
            const button=document.createElement('button'); button.textContent='Revertir este movimiento'; button.onclick=() => reverseMovement(movement); item.append(button);
        }
    }
    for (const item of await localRead('shopping_manual')) {
        const li=appendText($('shopping_list'),item.text+' (manual)','li');
        const button=document.createElement('button'); button.textContent='Quitar'; button.onclick=async () => { await localTransaction(['shopping_manual'],tx => tx.objectStore('shopping_manual').delete(item.id)); await renderStock(); }; li.append(button);
    }
    if (!$('shopping_list').children.length) appendText($('shopping_list'),'No hay faltantes según los mínimos configurados.','li');
}
async function addShoppingItem() {
    const text=$('shopping_text').value.trim(); if (!text) return;
    try { await localTransaction(['shopping_manual'],tx => tx.objectStore('shopping_manual').put({id:identifier(),text})); $('shopping_text').value=''; await renderStock(); }
    catch(error) { notice('No se guardó la lista: '+error.message); }
}
async function export_database_backup() {
    try { downloadJSON(await serverRequest('/api/backup'),'mercado-base-completa.json'); notice('Respaldo completo de la PC exportado. Exportá también los pendientes del teléfono.'); }
    catch(error) { notice('El respaldo completo necesita conexión con tu PC. Podés exportar pendientes sin señal.'); }
}
function downloadJSON(data,name) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a'); link.href=url; link.download=name; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
async function import_local_backup(file) {
    if (!file) return;
    try {
        const data=JSON.parse(await file.text());
        if (!['mercado-local-v3','mercado-local-v4'].includes(data.format) || !Array.isArray(data.outbox) || !Array.isArray(data.catalog)) throw new Error('Formato de respaldo no reconocido');
        const existing=await localRead('outbox');
        for (const op of data.outbox) {
            const old=existing.find(item => item.operation_id===op.operation_id);
            if (old && JSON.stringify(old.payload)!==JSON.stringify(op.payload)) throw new Error('Hay un UUID con datos diferentes; no se importó');
        }
        // No sustituir catálogo ni snapshot actuales con copias anteriores.
        await localTransaction(['outbox','catalog','stock_effects','stock_cache','shopping_manual','shopping_cache','shopping_effects','shopping_choices','cart'],tx => {
            for (const op of data.outbox) { const store=tx.objectStore('outbox'); const r=store.get(op.operation_id); r.onsuccess=() => { if (!r.result) store.put(op); }; }
            for (const [store,rows] of [['catalog',data.catalog],['stock_effects',data.stock_effects || []],['stock_cache',data.stock_cache || []],['shopping_manual',data.shopping_manual || []],['shopping_cache',data.shopping_cache || []],['shopping_effects',data.shopping_effects || []],['shopping_choices',data.shopping_choices || []],['cart',data.cart || []]]) {
                for (const row of rows) { const s=tx.objectStore(store); const r=s.get(row.id); r.onsuccess=() => { if (!r.result) s.put(row); }; }
            }
        });
        await read_products(); await renderStock(); await renderShopping();await renderCart(); await updateStatus(); notice('Respaldo local recuperado; los reintentos conservarán sus identificadores.'); void sync_pending();
    } catch(error) { notice('No se recuperó el respaldo: '+error.message); }
}

function stockPlaceLabel(place) {return place ? [place.location,place.detail].filter(Boolean).join(' · ') : '';}
let stockReviewState=null,stockReviewController=null,stockReviewBusy=false;
const STOCK_REVIEW_KEY='mercado-stock-review-v1';
function persistStockReview() {localStorage.setItem(STOCK_REVIEW_KEY,JSON.stringify(stockReviewState));}
function stockReviewEntries(products,data) {
    const families=new Map();
    const familyKey=p=>JSON.stringify([catalogLabelKey(p.product_name,'product_name'),catalogLabelKey(p.product_ptype,''),catalogLabelKey(p.product_psubtype,'')]);
    for(const product of products) {
        const key=familyKey(product);if(!families.has(key))families.set(key,[]);
        families.get(key).push(...productStorageLocations(product));
    }
    const entries=[];
    for(const product of products) {
        const paths=new Set([...families.get(familyKey(product)).map(stockPlaceLabel),...data.lots.filter(l=>l.product_id===product.id).map(l=>l.location)].filter(Boolean));
        for(const path of paths) {
            const parts=path.split(' · '),room=parts.shift();
            entries.push({productId:product.id,path,room,detail:parts.join(' · '),label:product.product_all});
        }
    }
    return entries.sort((a,b)=>a.detail.localeCompare(b.detail,'es',{sensitivity:'base'}) || a.label.localeCompare(b.label,'es',{sensitivity:'base'}));
}
async function openStockReview() {
    if(!db) return;
    try {
        if(!stockReviewState) {
            try {const stored=JSON.parse(localStorage.getItem(STOCK_REVIEW_KEY));if(stored && Array.isArray(stored.entries) && Number.isInteger(stored.index))stockReviewState=stored;}catch{}
        }
        const entries=stockReviewEntries(await localRead('catalog'),await projectedStock());
        const rooms=[...new Set(entries.map(entry=>entry.room))].sort((a,b)=>a.localeCompare(b,'es'));
        $('stock_review_rooms').replaceChildren();
        for(const room of rooms) {
            const button=document.createElement('button');button.type='button';button.textContent=room;
            button.onclick=async()=>{if(stockReviewBusy)return;stockReviewState={room,entries:entries.filter(entry=>entry.room===room),index:0,drafts:{}};persistStockReview();await renderStockReview();};
            $('stock_review_rooms').append(button);
        }
        $('stock_review').hidden=false;
        if(stockReviewState) await renderStockReview();
        else {$('stock_review_progress').textContent=rooms.length?'Elegí una habitación para comenzar.':'Asigná ubicaciones a los productos para comenzar.';$('stock_review_card').replaceChildren();$('stock_review_actions').hidden=true;}
        $('stock_review').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){notice('No se abrió la revisión: '+error.message);}
}
function closeStockReview() {if(stockReviewBusy)return;$('stock_review').hidden=true;void renderStock({forceLocations:true});}
async function renderStockReview() {
    stockReviewController=null;
    const state=stockReviewState;if(!state)return;
    const products=await localRead('catalog'),data=await projectedStock();
    const root=$('stock_review_card');root.replaceChildren();
    for(const button of $('stock_review_rooms').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.textContent===state.room));
    $('stock_review_actions').hidden=false;
    $('stock_review_previous').disabled=state.index===0;
    const done=state.index>=state.entries.length;
    $('stock_review_save').disabled=done;
    $('stock_review_actions').querySelector('button[onclick="stepStockReview(1)"]').disabled=done;
    if(done){$('stock_review_progress').textContent=state.room+' · Revisión completada';return;}
    const entry=state.entries[state.index],product=products.find(p=>p.id===entry.productId);
    $('stock_review_progress').textContent=entry.room+' · '+(entry.detail || 'Sin sublugar')+' · '+(state.index+1)+' de '+state.entries.length;
    const card=document.createElement('article');card.className='cart-card stock-location-card stock-card-selected stock-review-single';
    appendText(card,product?.product_all || entry.label,'strong');
    if(product?.unit_status==='confirmed') {
        const variant=document.createElement('div');variant.className='stock-variant';card.append(variant);
        const draftKey=JSON.stringify([entry.productId,entry.path]);
        const draft=state.drafts?.[draftKey];
        stockReviewController=addQuickStockCount(variant,product,data,[],{locationPath:entry.path,draft,onDraft:value=>{state.drafts ||= {};state.drafts[draftKey]=value;persistStockReview();}});
        card.querySelector('.stock-count-save').hidden=true;
        $('stock_review_save').disabled=!stockReviewController;
    }else {appendText(card,product?'Confirmá la unidad del producto antes de contarlo.':'Este producto ya no está disponible. Podés omitirlo.');$('stock_review_save').disabled=true;}
    root.append(card);
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)card.animate([{opacity:0,transform:'translateX(24px)'},{opacity:1,transform:'translateX(0)'}],{duration:220,easing:'ease-out'});
}
async function stepStockReview(direction) {
    if(stockReviewBusy || !stockReviewState)return;
    stockReviewBusy=true;
    try {
        const card=$('stock_review_card').firstElementChild;
        if(card && !matchMedia('(prefers-reduced-motion: reduce)').matches)await card.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX('+(-direction*24)+'px)'}],{duration:160,easing:'ease-in'}).finished;
        stockReviewState.index=Math.max(0,Math.min(stockReviewState.entries.length,stockReviewState.index+direction));persistStockReview();await renderStockReview();
    }finally{stockReviewBusy=false;}
}
async function saveStockReviewCard() {
    if(stockReviewBusy || !stockReviewController)return;
    stockReviewBusy=true;$('stock_review_save').disabled=true;
    let success=false;
    try {success=await stockReviewController.save();}finally{stockReviewBusy=false;$('stock_review_save').disabled=false;}
    if(success)await stepStockReview(1);
}
function addQuickStockCount(variant,product,data,places,options={}) {
    let lots=data.lots.filter(l=>l.product_id===product.id);
    let paths=[...new Set([...productStorageLocations(product).map(stockPlaceLabel),...places.map(stockPlaceLabel),...lots.map(l=>l.location)].filter(Boolean))];
    if(options.locationPath) paths=[options.locationPath];
    else if(selectedStockLocation) paths=paths.filter(path=>places.some(place=>stockPlaceLabel(place)===path && catalogLabelKey(place.location,'')===selectedStockLocation && (selectedStockDetail===null || place.detail===selectedStockDetail)));
    if(!paths.length) return;
    const controls=document.createElement('div');controls.className='stock-quick-count';
    const location=document.createElement('select');location.setAttribute('aria-label','Ubicación del conteo');for(const path of paths)location.add(new Option(path,path));location.hidden=paths.length===1;
    const occupiedPath=paths.find(path=>lots.filter(l=>l.location===path).reduce((sum,l)=>sum+balanceOf(data,l.id),0n)>0n);
    if(occupiedPath) location.value=occupiedPath;
    const counter=document.createElement('div');counter.className='stock-quick-counter';
    const minus=document.createElement('button'),plus=document.createElement('button'),save=document.createElement('button');
    for(const button of [minus,plus,save])button.type='button';
    minus.textContent='−';plus.textContent='+';save.textContent='Guardar';save.hidden=true;
    minus.setAttribute('aria-label','Restar una unidad');plus.setAttribute('aria-label','Sumar una unidad');
    const byContainer=product.sale_mode==='package' && product.content_unit!=='unit';
    const fraction=document.createElement('button');fraction.type='button';fraction.textContent='f';fraction.className='stock-fraction-toggle';fraction.hidden=!byContainer;fraction.setAttribute('aria-label','Sumar y restar cuartos de envase');fraction.setAttribute('aria-pressed','false');fraction.title='Cambiar entre 1 envase y ¼ de envase';
    const clear=document.createElement('button');clear.type='button';clear.textContent='x';clear.className='stock-count-zero';clear.setAttribute('aria-label','Dejar el conteo en cero');
    const open=document.createElement('button');open.type='button';open.textContent='!';open.className='stock-open-product';open.setAttribute('aria-label','Ver '+product.product_all+' en Productos');open.onclick=()=>void showProductActions(product.id);
    save.className='stock-count-save';
    let fractionMode=false;
    fraction.onclick=()=>{fractionMode=!fractionMode;fraction.setAttribute('aria-pressed',String(fractionMode));minus.classList.toggle('stock-fraction-step',fractionMode);plus.classList.toggle('stock-fraction-step',fractionMode);minus.setAttribute('aria-label',fractionMode?'Restar un cuarto de envase':'Restar un envase');plus.setAttribute('aria-label',fractionMode?'Sumar un cuarto de envase':'Sumar un envase');};
    const physicalPerCount=byContainer ? scaledDecimal(product.package_content,6,true) : 1000000n;
    const quantity=document.createElement('input');quantity.type='text';quantity.inputMode=product.sale_mode==='fractional' ? 'decimal' : 'numeric';quantity.readOnly=product.sale_mode!=='fractional';quantity.setAttribute('aria-label','Contar '+product.product_all+' en '+(byContainer ? 'envases' : product.content_unit));
    const unit=document.createElement('span');unit.textContent=byContainer ? 'envases' : product.content_unit==='unit' ? 'unidades' : product.content_unit;
    let expected=0n,initialCount=0n;
    const changed=()=>{let dirty=true;try{const value=scaledDecimal(quantity.value,6);dirty=value!==initialCount;minus.disabled=value===0n;}catch{}save.hidden=!dirty;variant.classList.toggle('stock-count-dirty',dirty);options.onDraft?.({value:quantity.value,expected:decimalText(expected,6),dirty});};
    const reset=()=>{expected=lots.filter(l=>l.location===location.value).reduce((sum,l)=>sum+balanceOf(data,l.id),0n);initialCount=byContainer ? roundedDivide(expected*1000000n,physicalPerCount) : expected;quantity.value=decimalText(initialCount,6).replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'').replace('.',',');changed();};
    const adjust=direction=>{try{const value=scaledDecimal(quantity.value,6)+BigInt(direction)*(fractionMode?250000n:1000000n);quantity.value=decimalText(value<0n?0n:value,6).replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'').replace('.',',');changed();}catch(error){notice(error.message);}};
    minus.onclick=()=>adjust(-1);plus.onclick=()=>adjust(1);quantity.oninput=changed;location.onchange=reset;
    clear.onclick=()=>{quantity.value='0';changed();};
    save.onclick=async()=>{
        save.disabled=true;
        try {
            const count=scaledDecimal(quantity.value,6);if(product.content_unit==='unit'&&count%1000000n)throw Error('Ingresá unidades enteras');
            const value=roundedDivide(count*physicalPerCount,1000000n);
            const success=await stockAction(async()=>{
                await queueOperation('stock_count',{product_id:product.id,location:location.value,quantity:decimalText(value,6),expected_balance:decimalText(expected,6),expires_on:null,...eventFields()});
                data=await projectedStock();lots=data.lots.filter(l=>l.product_id===product.id);expected=value;initialCount=count;changed();
            },{preserveLocationDrafts:true});
            return success;
        }catch(error){notice('No se guardó: '+error.message);return false;}finally{save.disabled=false;}
    };
    counter.append(minus,quantity,unit,plus,fraction,clear,open,save);controls.append(location,counter);variant.append(controls);reset();
    if(options.draft?.dirty) {quantity.value=options.draft.value;expected=scaledDecimal(options.draft.expected,6);changed();}
    return {save:()=>save.onclick(),dirty:()=>variant.classList.contains('stock-count-dirty')};
}
async function openStockDistribution(card,products,mode) {
    card.querySelector('.stock-distribution-form')?.remove();
    const form=document.createElement('form');form.className='stock-distribution-form';
    const product=document.createElement('select');product.setAttribute('aria-label','Presentación');
    for(const row of products) product.add(new Option(row.product_all,row.id));
    const location=document.createElement('select');location.setAttribute('aria-label',mode==='count'?'Ubicación del recuento':'Ubicación de destino');
    const source=document.createElement('select');source.setAttribute('aria-label','Lote de origen');source.hidden=mode!=='transfer';
    const quantity=document.createElement('input');quantity.type='text';quantity.inputMode='decimal';quantity.placeholder=mode==='count'?'Cantidad encontrada (incluye cero)':'Cantidad a mover';quantity.setAttribute('aria-label',quantity.placeholder);
    const expiry=document.createElement('input');expiry.type='date';expiry.setAttribute('aria-label','Vencimiento de existencias nuevas');expiry.hidden=mode!=='count';
    const info=document.createElement('p');info.className='cart-meta';
    const status=document.createElement('p');status.setAttribute('role','status');
    const save=document.createElement('button');save.type='submit';save.textContent=mode==='count'?'Guardar recuento':'Mover';
    const cancel=document.createElement('button');cancel.type='button';cancel.className='stock-location-cancel';cancel.textContent='Cancelar';cancel.onclick=()=>{form.remove();void renderStock({forceLocations:true});};
    const actions=document.createElement('div');actions.className='stock-location-editor-actions';actions.append(cancel,save);
    let snapshot=null;
    const update=async()=>{
        snapshot=await projectedStock();const row=products.find(r=>r.id===product.value);
        const lots=snapshot.lots.filter(l=>l.product_id===row.id);
        source.replaceChildren();for(const lot of lots.filter(l=>balanceOf(snapshot,l.id)>0n)) source.add(new Option(lot.location+' · '+formatDisplayDecimal(String(Number(decimalText(balanceOf(snapshot,lot.id),6))))+' '+lot.unit+' · '+(lot.expires_on || 'Sin vencimiento'),lot.id));
        const choices=[...new Set([...productStorageLocations(row).map(stockPlaceLabel),...lots.map(l=>l.location)])];location.replaceChildren();for(const label of choices)location.add(new Option(label,label));
        quantity.value='';info.textContent=mode==='count'?'Ingresá lo encontrado en '+row.content_unit+'. Ajusta el stock, no lo suma. Si aparecen existencias nuevas, podés indicar su vencimiento.':'Cantidad en '+row.content_unit+'. Conserva el vencimiento del lote de origen.';
    };
    product.onchange=()=>void update();form.append(product,source,location,quantity,expiry,info,actions,status);card.append(form);await update();
    form.onsubmit=async event=>{
        event.preventDefault();save.disabled=true;
        try {
            await stockAction(async()=>{
                const row=products.find(r=>r.id===product.value);if(!location.value)throw Error('Primero asigná una ubicación al producto');
                const count=scaledDecimal(quantity.value,6,mode==='transfer');if(row.content_unit==='unit'&&count%1000000n)throw Error('Ingresá unidades enteras');
                if(mode==='count') {
                    const expected=snapshot.lots.filter(l=>l.product_id===row.id&&l.location===location.value).reduce((sum,l)=>sum+balanceOf(snapshot,l.id),0n);
                    await queueOperation('stock_count',{product_id:row.id,location:location.value,quantity:decimalText(count,6),expected_balance:decimalText(expected,6),expires_on:expiry.value || null,...eventFields()});
                } else {
                    const lot=snapshot.lots.find(l=>l.id===source.value);if(!lot)throw Error('Elegí un lote de origen');
                    await queueOperation('stock_transfer',{lot_id:lot.id,quantity:decimalText(count,6),expected_balance:decimalText(balanceOf(snapshot,lot.id),6),location:location.value,...eventFields()});
                }
            });
        }catch(error){status.textContent=error.message;}finally{save.disabled=false;}
    };
    form.scrollIntoView({behavior:'smooth',block:'center'});
}
