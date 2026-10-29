// Las ubicaciones son propias de cada sucursal y apuntan a la identidad de la zona.
(function(){
    const el=id=>document.getElementById('map_'+id),api=window.mercadoMapProducts,availability=window.MercadoAvailability;
    let active=false,rows=[],selected=new Set(),currentBranch=null,generation=0,visible=[],pendingZone=null;
    const menuCells=new Map();
    async function assignHere(branch,ids,zone){
        const before=api.context(),target=before.zones.find(g=>g.id===zone);if(!target||before.branch!==branch)return false;
        // El mapa elige únicamente región; el cuadrado se conserva o se elige en el selector.
        const destinations=ids.map(id=>{
            const chosen=menuCells.get(id),saved=before.assignments[id]===zone?before.placements[id]:null;
            const cell=chosen?.zone===zone?chosen.cell:saved&&target.cells.includes(saved.cell)?saved.cell:null;
            return [id,cell===null||!target.cells.includes(cell)?null:cell];
        });
        if(!await api.assign(branch,ids,zone))return false;
        const groups=new Map(),current=api.context();
        for(const [id,cell] of destinations){
            if(cell===null&&!current.placements[id]||cell!==null&&current.placements[id]?.cell===cell)continue;
            if(!groups.has(cell))groups.set(cell,[]);groups.get(cell).push(id);
        }
        for(const [cell,products] of groups)if(!api.place(branch,products,cell))return false;
        return true;
    }
    const assigningProducts=new Set();
    const fields=[['category','product_class','Todas las categorías']];
    const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
    function options(select,entries,first,value=select.value){
        select.replaceChildren(new Option(first,''));for(const [id,label] of entries)select.add(new Option(label,id));
        select.value=entries.some(([id])=>id===value)?value:'';
    }
    function zoneOptions(select,zones,first,value=select.value){options(select,zones.map(g=>[g.id,g.name.replace(/[&\n]+/g,' · ')]),first,value);}
    function updateSelection(){
        const count=visible.filter(row=>selected.has(row.id)).length;
        el('product_select_all').checked=visible.length>0&&count===visible.length;
        el('product_select_all').indeterminate=count>0&&count<visible.length;
        el('product_select_all').disabled=!visible.length;
        el('product_selection').textContent=selected.size+' seleccionados';
        const state=api.context(),target=state.zones.find(g=>g.id===pendingZone);
        el('product_zone_target').textContent=target?'Destino: '+target.name.replace(/[&\n]+/g,' · '):'Tocá una zona del mapa';
        el('product_zone_target').style.borderColor=target?.color||'';
        el('product_apply').disabled=!selected.size||!state.ready||!target;
        el('product_clear_selection').disabled=!selected.size;el('product_apply_availability').disabled=!selected.size||!state.branch;
    }
    function render(){
        if(!active)return;
        const state=api.context();
        el('product_map_empty').hidden=state.ready;
        if(currentBranch!==state.branch){currentBranch=state.branch;menuCells.clear();selected.clear();pendingZone=null;el('product_zone_filter').value='';}
        const availabilityRecords=availability.forBranch(state.branch),recordFor=id=>availabilityRecords[id]||{status:'unknown',confirmed_at:null};
        const zoneIds=new Set(state.zones.map(g=>g.id));
        if(pendingZone!==null&&pendingZone!==''&&!zoneIds.has(pendingZone))pendingZone=null;
        for(const [id,choice] of menuCells)if(state.assignments[id]!==choice.zone||choice.cell!==null&&!state.zones.find(g=>g.id===choice.zone)?.cells.includes(choice.cell))menuCells.delete(id);
        const assignment=id=>zoneIds.has(state.assignments[id])?state.assignments[id]:'';
        const hideAssigned=el('product_hide_assigned').checked;
        let candidates=el('product_only_available').checked?rows.filter(row=>recordFor(row.id).status==='available'):rows;
        if(hideAssigned)candidates=candidates.filter(row=>!assignment(row.id)&&recordFor(row.id).status!=='unavailable');
        for(const [id,field,all] of fields){
            const control=el('product_'+id),values=[...new Set(candidates.map(r=>r[field]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base',numeric:true}));
            options(control,values.map(v=>[v,v]),all);
            if(control.value)candidates=candidates.filter(r=>r[field]===control.value);
        }
        const zoneFilter=el('product_zone_filter'),previous=zoneFilter.value;
        const pickedZone=state.zones.find(g=>g.id===pendingZone),viewedZone=state.zones.find(g=>g.id===previous);
        options(zoneFilter,[['__unassigned__','Sin zona'],...(viewedZone?[[viewedZone.id,viewedZone.name]]:[])],'Todas las zonas',previous);
        el('product_zone_picker').hidden=!!viewedZone;
        const toggle=el('product_zone_toggle');toggle.hidden=!viewedZone;
        if(viewedZone){toggle.textContent='Viendo: '+viewedZone.name.replace(/[&\n]+/g,' · ');toggle.setAttribute('aria-pressed','true');toggle.style.borderLeft='8px solid '+viewedZone.color;toggle.title='Quitar el filtro de esta zona sin cambiar el destino';}
        const viewButton=el('product_zone_view');viewButton.hidden=!pickedZone||pickedZone.id===viewedZone?.id;
        if(pickedZone){viewButton.textContent='Ver zona '+pickedZone.name.replace(/[&\n]+/g,' · ');viewButton.title='Ver productos de '+pickedZone.name+' (cambia la consulta, no asigna productos)';}
        const query=normalize(el('product_search').value.trim());
        visible=state.branch?candidates.filter(r=>(!el('product_availability_filter').value||recordFor(r.id).status===el('product_availability_filter').value)&&(!hideAssigned||(!assignment(r.id)&&recordFor(r.id).status!=='unavailable'))&&(!query||normalize([productLabel(r),r.product_class].join(' ')).includes(query))&&(!zoneFilter.value||(zoneFilter.value==='__unassigned__'?!assignment(r.id):assignment(r.id)===zoneFilter.value))):[];
        const ids=new Set(rows.map(r=>r.id));selected=new Set([...selected].filter(id=>ids.has(id)));
        el('product_help').textContent=!state.branch?'Elegí una sucursal para consultar sus productos.':!state.zones.length?'Todavía no hay zonas. Crealas en Dibujar → Nombrar góndolas.':visible.length+' de '+rows.length+' productos · '+rows.filter(r=>!assignment(r.id)).length+' sin zona';
        const list=el('product_list');list.replaceChildren();
        for(const row of visible){
            const entry=document.createElement('div');entry.className='map-product-row';entry.dataset.productId=row.id;
            const availabilityRecord=recordFor(row.id);entry.dataset.availability=availabilityRecord.status;
            const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(row.id);check.setAttribute('aria-label','Seleccionar '+productLabel(row));check.onchange=()=>{if(check.checked)selected.add(row.id);else selected.delete(row.id);render();};
            const label=document.createElement('span');label.className='map-product-description';
            const dimensions=document.createElement('span');dimensions.className='map-product-dimensions';
            productLabel(row).split(' · ').forEach((text,index)=>{const part=document.createElement('span');part.className='map-product-dimension';part.textContent=(index?'· ':'')+text;dimensions.append(part);});label.append(dimensions);
            const zone=document.createElement('select');zone.setAttribute('aria-label','Zona de '+productLabel(row));const preview=selected.has(row.id)&&pendingZone!==null,displayZone=preview?pendingZone:assignment(row.id);zoneOptions(zone,state.zones,'Sin asignar',displayZone);
            if(preview&&displayZone!==assignment(row.id)){const hint=document.createElement('small');hint.className='map-assignment-preview-note';hint.textContent='Pendiente de asignar';label.append(hint);entry.classList.add('has-zone-preview');}
            const color=state.zones.find(g=>g.id===displayZone)?.color;if(color)zone.style.borderLeft='8px solid '+color;
            zone.onchange=async()=>{selected.delete(row.id);const ok=await api.assign(state.branch,[row.id],zone.value);if(!ok){zone.value=assignment(row.id);el('status').textContent='No se pudo guardar la asignación. Volvé a intentarlo.';}};
            const edit=document.createElement('button');edit.type='button';edit.className='map-product-edit';edit.textContent='Editar';edit.setAttribute('aria-label','Editar '+productLabel(row));edit.onclick=()=>void editFromAssignment(row.id);
            const availabilityField=document.createElement('div');availabilityField.className='map-product-availability';
            const availabilitySelect=document.createElement('select');availabilitySelect.setAttribute('aria-label','Disponibilidad de '+productLabel(row));for(const [value,text] of Object.entries(availability.labels))availabilitySelect.add(new Option(text,value));availabilitySelect.value=availabilityRecord.status;
            availabilitySelect.onchange=async()=>{try{selected.delete(row.id);await availability.set(state.branch,[row.id],availabilitySelect.value);render();el('availability_feedback').textContent='Disponibilidad guardada para esta sucursal.';}catch(error){el('availability_feedback').textContent='No se guardó: '+error.message;render();}};
            const info=document.createElement('small');info.className='map-availability-detail';
            info.textContent=availabilityRecord.error?'Cambió en otro dispositivo. Revisá el estado del servidor ('+availability.labels[availabilityRecord.server_status]+') y volvé a confirmar.':availabilityRecord.confirmed_at?'Confirmado '+new Date(availabilityRecord.confirmed_at).toLocaleDateString('es-AR')+(availabilityRecord.pending?' · pendiente de sincronizar':''):availabilityRecord.status==='available'?'Disponible por ubicación conocida':'Disponibilidad sin confirmar';
            const assignButton=document.createElement('button');assignButton.type='button';assignButton.className='map-product-assign';assignButton.textContent=assigningProducts.has(row.id)?'Guardando…':'Asignar';assignButton.setAttribute('aria-label','Asignar '+productLabel(row));
            assignButton.disabled=!pendingZone||!state.zones.some(g=>g.id===pendingZone)||assigningProducts.has(row.id);assignButton.title=pendingZone?'Asignar este producto a la zona elegida en el mapa':'Elegí primero una zona del mapa';
            assignButton.onclick=async()=>{
                const target=pendingZone;if(!target||assigningProducts.has(row.id))return;
                assigningProducts.add(row.id);render();
                try{if(await assignHere(state.branch,[row.id],target)){selected.delete(row.id);el('availability_feedback').textContent=productLabel(row)+' asignado a '+(state.zones.find(g=>g.id===target)?.name||'la zona elegida')+'.';}else el('availability_feedback').textContent='No se pudo guardar la asignación.';}
                catch(error){el('availability_feedback').textContent='No se guardó: '+error.message;}
                finally{assigningProducts.delete(row.id);render();}
            };
            const actions=document.createElement('div');actions.className='map-product-availability-actions';actions.append(availabilitySelect,assignButton);availabilityField.append(actions,info);
            const location=document.createElement('div');location.className='map-cell-controls';
            const currentZone=state.zones.find(g=>g.id===assignment(row.id)),place=state.placements[row.id];
            const cellSelect=document.createElement('select');cellSelect.setAttribute('aria-label','Cuadrado de '+productLabel(row));cellSelect.add(new Option('Sin cuadrado',''));for(const [index,cell] of (currentZone?.cells||[]).entries())cellSelect.add(new Option('Cuadrado '+(index+1)+' · F'+(Math.floor(cell/state.cols)+1)+' C'+(cell%state.cols+1),String(cell)));cellSelect.value=place?String(place.cell):'';cellSelect.disabled=!currentZone;
            cellSelect.onchange=()=>{const cell=cellSelect.value===''?null:Number(cellSelect.value);menuCells.set(row.id,{zone:currentZone.id,cell});if(!api.place(state.branch,[row.id],cell)){menuCells.delete(row.id);el('status').textContent='No se pudo guardar el cuadrado.';}};
            const field=document.createElement('label');field.className='map-cell-field';const caption=document.createElement('span');caption.textContent='Cuadrado';field.append(caption,cellSelect);
            const orderControls=document.createElement('div');orderControls.className='map-cell-order';
            const hint=document.createElement('small');hint.textContent=!currentZone?'Elegí primero una región':place?'Posición '+(place.order+1):'Elegí un cuadrado para ordenar';orderControls.append(hint);location.append(field,orderControls);
            const peers=Object.keys(state.placements).filter(id=>state.assignments[id]===currentZone?.id&&state.placements[id].cell===place?.cell).sort((a,b)=>state.placements[a].order-state.placements[b].order||a.localeCompare(b));
            for(const [symbol,move,text] of [['↑',-1,'Subir'],['↓',1,'Bajar']]){const control=document.createElement('button');control.type='button';control.textContent=symbol;control.title=text;control.setAttribute('aria-label',text+' '+productLabel(row));const index=peers.indexOf(row.id);control.disabled=!place||(move<0?index<=0:index>=peers.length-1);control.onclick=()=>api.place(state.branch,[row.id],place.cell,move);orderControls.append(control);}
            entry.append(check,label,zone,edit,availabilityField,location);list.append(entry);
        }
        if(state.ready&&!visible.length){const empty=document.createElement('p');empty.textContent='No hay productos que coincidan con estos filtros.';list.append(empty);}
        updateSelection();
    }
    const returnButton=document.createElement('button');returnButton.type='button';returnButton.id='map_product_editor_return';returnButton.textContent='← Volver a asignar';returnButton.hidden=true;returnButton.onclick=()=>void closeProductEditor();document.getElementById('product_editor').prepend(returnButton);
    async function editFromAssignment(id){
        const sidebar=document.querySelector('.map-product-assignment'),viewport=el('viewport');
        const saved={scroll:sidebar.scrollTop,mapX:viewport.scrollLeft,mapY:viewport.scrollTop};
        try{
            await editProduct(id);
            if(document.getElementById('product_editor').hidden)return;
            returnButton.hidden=false;
            window.mapProductEditorReturn=async()=>{
                returnButton.hidden=true;showModule('maps',{scroll:false});workspaceLayout();
                await load();
                await new Promise(resolve=>requestAnimationFrame(()=>{sidebar.scrollTop=saved.scroll;viewport.scrollLeft=saved.mapX;viewport.scrollTop=saved.mapY;resolve();}));
            };
        }catch(error){el('status').textContent='No se pudo abrir el producto: '+error.message;}
    }
    async function load(){
        const token=++generation;
        try {const catalog=await localRead('catalog');if(token!==generation)return;rows=unifyCatalogLabels(catalog);render();}
        catch(_){if(token===generation)el('product_help').textContent='No se pudo abrir el catálogo. Volvé a entrar en Asignar productos.';}
    }
    let contextHome=null;
    function workspaceLayout(){
        const shown=active&&!document.getElementById('panel-maps').hidden;
        document.body.classList.toggle('map-assignment-workspace',shown);
        if(shown){const nav=document.getElementById('navbar').getBoundingClientRect();el('products_view').style.setProperty('--map-workspace-top',Math.min(Math.max(12,nav.bottom+10),window.innerHeight*.3)+'px');}
    }
    window.addEventListener('resize',workspaceLayout);
    new MutationObserver(workspaceLayout).observe(document.getElementById('panel-maps'),{attributes:true,attributeFilter:['hidden']});
    function switchView(view){
        const products=view==='products',zones=view==='zones';active=products;
        el('drawing_view').hidden=products||zones;el('products_view').hidden=!products;el('zones_view').hidden=!zones;
        for(const [id,current] of [['view_draw','draw'],['view_products','products'],['view_zones','zones']])el(id).setAttribute('aria-pressed',String(view===current));
        const context=el('view_draw').closest('.map-option-card');
        if(!contextHome){contextHome=document.createComment('Vista del mapa');context.before(contextHome);}
        if(products)document.querySelector('.map-product-assignment').prepend(context);else contextHome.after(context);
        workspaceLayout();
        const destination=products?el('product_map_canvas'):zones?el('zones_map_home'):el('drawing_map_home');destination.append(el('surface'));
        api.setReadOnly(products||zones);
        if(zones)el('zones_card').open=true;
        if(products){render();void load();}
    }
    el('view_draw').onclick=()=>switchView('draw');el('view_products').onclick=()=>switchView('products');el('view_zones').onclick=()=>switchView('zones');
    for(const [id] of fields)el('product_'+id).onchange=render;
    el('product_category').onchange=()=>{
        selected.clear();
        render();
        if(el('product_category').value)selected=new Set(visible.map(row=>row.id));
        render();
    };
    el('product_hide_assigned').onchange=()=>{render();const shown=new Set(visible.map(r=>r.id));selected=new Set([...selected].filter(id=>shown.has(id)));render();};
    el('product_availability_filter').onchange=()=>{el('product_only_available').checked=el('product_availability_filter').value==='available';selected.clear();render();};
    el('product_only_available').onchange=()=>{el('product_availability_filter').value=el('product_only_available').checked?'available':'';selected.clear();render();};
    el('product_zone_toggle').onclick=()=>{el('product_zone_filter').value='';render();};
    el('product_zone_view').onclick=()=>{
        const zone=api.context().zones.find(g=>g.id===pendingZone);if(!zone)return;
        selected.clear();for(const [id] of fields)el('product_'+id).value='';el('product_search').value='';el('product_hide_assigned').checked=false;
        el('product_zone_filter').add(new Option(zone.name,zone.id));el('product_zone_filter').value=zone.id;render();
    };
    el('product_search').oninput=render;el('product_zone_filter').onchange=render;
    el('product_reset').onclick=()=>{selected.clear();el('product_only_available').checked=true;el('product_availability_filter').value='available';el('product_hide_assigned').checked=false;for(const [id] of fields)el('product_'+id).value='';el('product_search').value='';el('product_zone_filter').value='';render();};
    el('product_select_all').onchange=event=>{for(const row of visible){if(event.target.checked)selected.add(row.id);else selected.delete(row.id);}render();};
    el('product_clear_selection').onclick=()=>{selected.clear();render();};
    el('product_apply').onclick=async()=>{
        const state=api.context(),ids=[...selected],zone=pendingZone;
        if(!zone||!state.zones.some(g=>g.id===zone))return;
        if(await assignHere(state.branch,ids,zone)){selected.clear();render();el('status').textContent=ids.length+' productos guardados '+(zone?'en la zona elegida.':'sin zona asignada.');}
        else el('status').textContent='No se pudieron guardar las asignaciones. Volvé a intentarlo.';
    };
    el('product_apply_availability').onclick=async()=>{
        const state=api.context(),ids=[...selected],status=el('product_bulk_availability').value;if(!ids.length||!state.branch)return;
        try{await availability.set(state.branch,ids,status);selected.clear();render();el('availability_feedback').textContent=ids.length+' productos marcados como '+availability.labels[status].toLocaleLowerCase('es')+'.';}
        catch(error){el('availability_feedback').textContent='No se guardó la disponibilidad: '+error.message;}
    };
    let availabilityRenderPending=false;
    document.addEventListener('mercado-availability-change',()=>{if(document.getElementById('map_assignment_select_menu')?.matches(':popover-open'))availabilityRenderPending=true;else render();});
    document.addEventListener('toggle',event=>{if(event.target.id==='map_assignment_select_menu'&&!event.target.matches(':popover-open')&&availabilityRenderPending){availabilityRenderPending=false;render();}},true);
    document.addEventListener('mercado-map-zone-picked',event=>{
        if(!active)return;const state=api.context(),zone=state.zones.find(g=>g.id===event.detail);if(!zone)return;
        pendingZone=zone.id;
        api.highlightZone(zone.id);
        el('status').textContent='Destino: '+zone.name+'. La zona consultada no cambió. Pulsá Asignar para guardar.';
    });
    document.addEventListener('mercado-map-change',render);
})();
