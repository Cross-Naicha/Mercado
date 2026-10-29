// Consulta del mapa local: elegir una zona nunca modifica sus asignaciones.
(function(){
    const el=id=>document.getElementById('walk_'+id);
    let map=null,mapBranch='',rows=[],generation=0;
    let organizing=false;
    function updateOrganize(){document.documentElement.classList.toggle('walk-organize-mode',organizing);el('organize_toggle').setAttribute('aria-pressed',String(organizing));}
    window.setWalkOrganize=async()=>{
        const next=!organizing;
        if(next){await setPricesMode(false);await setHistoryMode(false);}
        organizing=next;updateOrganize();cards();
    };
    const orderDrafts=new Map();
    const draftKey=()=>mapBranch+':'+el('zone').value;
    function getDraft(){const key=draftKey(),zone=el('zone').value;if(!orderDrafts.has(key)){const base=Object.fromEntries(Object.entries(map.placements).filter(([id])=>map.assignments[id]===zone));orderDrafts.set(key,{base:structuredClone(base),placements:structuredClone(base)});}return orderDrafts.get(key);}
    function finishDraft(){const draft=orderDrafts.get(draftKey());const encode=value=>JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));if(draft&&encode(draft.base)===encode(draft.placements))orderDrafts.delete(draftKey());el('order_status').textContent='';cards();}
    function changeSquare(id,cell){
        const draft=getDraft();if(cell===null)delete draft.placements[id];else{const others=Object.entries(draft.placements).filter(([other,p])=>other!==id&&p.cell===cell);draft.placements[id]={cell,order:Math.max(-1,...others.map(([,p])=>p.order))+1};}
        const cells=new Set(Object.values(draft.placements).map(p=>p.cell));for(const cell of cells)Object.keys(draft.placements).filter(id=>draft.placements[id].cell===cell).sort((a,b)=>draft.placements[a].order-draft.placements[b].order||a.localeCompare(b)).forEach((id,order)=>draft.placements[id].order=order);
        finishDraft();
    }
    function changeOrder(id,neighbor){
        const zone=el('zone').value,key=draftKey();
        if(!orderDrafts.has(key)){const base=Object.fromEntries(Object.entries(map.placements).filter(([product])=>map.assignments[product]===zone));orderDrafts.set(key,{base:structuredClone(base),placements:structuredClone(base)});}
        const draft=orderDrafts.get(key),cell=draft.placements[id].cell;
        const peers=Object.keys(draft.placements).filter(product=>draft.placements[product].cell===cell).sort((a,b)=>draft.placements[a].order-draft.placements[b].order||a.localeCompare(b));
        const a=peers.indexOf(id),b=peers.indexOf(neighbor);[peers[a],peers[b]]=[peers[b],peers[a]];
        peers.forEach((product,order)=>draft.placements[product].order=order);
        if(JSON.stringify(draft.base)===JSON.stringify(draft.placements))orderDrafts.delete(key);
        el('order_status').textContent='';cards();
        [...el('cards').querySelectorAll('.product-card')].find(card=>card.dataset.productId===id)?.focus({preventScroll:true});
    }
    el('order_save').onclick=async()=>{
        const key=draftKey(),draft=orderDrafts.get(key);if(!draft)return;
        if(!window.mercadoMapProducts.saveOrder(mapBranch,el('zone').value,draft.base,draft.placements)){el('order_status').textContent='El mapa cambió o no se pudo guardar. Tus cambios siguen aquí; descartalos para cargar el orden vigente.';return;}
        orderDrafts.delete(key);await openWalk();el('order_status').textContent='Cambios guardados. Se sincronizarán con los otros dispositivos.';
    };
    el('order_discard').onclick=()=>{orderDrafts.delete(draftKey());el('order_status').textContent='';cards();};
    const reviewedByZone=new Map();
    function reviewedProducts(){
        const key='mercado-walk-reviewed-v1:'+mapBranch+':'+el('zone').value;
        if(!reviewedByZone.has(key)){
            let saved=[];try{const value=JSON.parse(sessionStorage.getItem(key)||'[]');if(Array.isArray(value))saved=value.filter(id=>typeof id==='string');}catch(_){}
            reviewedByZone.set(key,new Set(saved));
        }
        return {key,ids:reviewedByZone.get(key)};
    }
    function directionKey(){return 'mercado-walk-direction:'+mapBranch+':'+el('zone').value;}
    function isReverse(){try{const saved=sessionStorage.getItem(directionKey());return saved?saved==='reverse':map?.shelves.find(zone=>zone.id===el('zone').value)?.entry==='last';}catch(_){return map?.shelves.find(zone=>zone.id===el('zone').value)?.entry==='last';}}
    function setDirection(reverse){try{sessionStorage.setItem(directionKey(),reverse?'reverse':'forward');}catch(_){}cards();}
    function chooseSection(id){
        const zone=map?.shelves.find(zone=>zone.id===id);if(!zone)return;
        el('zone').value=id;try{sessionStorage.setItem(directionKey(),zone.entry==='last'?'reverse':'forward');}catch(_){}
        el('route_complete').hidden=true;el('order_status').textContent='';cards();
        requestAnimationFrame(()=>{const top=window.scrollY+el('title').getBoundingClientRect().top-document.getElementById('navbar').getBoundingClientRect().height-16;window.scrollTo({top:Math.max(0,top),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});el('title').focus({preventScroll:true});});
    }
    el('previous_section').onclick=()=>{const index=map.shelves.findIndex(zone=>zone.id===el('zone').value);if(index>0)chooseSection(map.shelves[index-1].id);};
    el('next_section').onclick=()=>{const index=map.shelves.findIndex(zone=>zone.id===el('zone').value);if(index<map.shelves.length-1)chooseSection(map.shelves[index+1].id);else{el('route_complete').hidden=false;el('next_section').disabled=true;}};
    function routeMap(zone,activeCell=null){
        const cells=[...zone.cells].sort((a,b)=>a-b),reverse=isReverse(),count=cells.length;
        el('direction_status').textContent=(reverse?count+' → 1':'1 → '+count)+' · Tocá un extremo para elegir la entrada';
        const host=el('direction_map');host.replaceChildren();if(!count)return;
        const xs=cells.map(i=>i%map.cols),ys=cells.map(i=>Math.floor(i/map.cols)),left=Math.min(...xs),top=Math.min(...ys),right=Math.max(...xs),bottom=Math.max(...ys);
        const vertical=bottom-top>right-left,displayCols=vertical?bottom-top+1:right-left+1,displayRows=vertical?right-left+1:bottom-top+1;
        el('cardinal_start').textContent=vertical?'Norte':'Oeste';el('cardinal_end').textContent=vertical?'Sur':'Este';
        host.setAttribute('aria-label','Región en horizontal: '+(vertical?'Norte a la izquierda, Sur a la derecha':'Oeste a la izquierda, Este a la derecha'));
        const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`-2 -2 ${displayCols*32+4} ${displayRows*32+4}`);svg.dataset.axis=vertical?'north-south':'west-east';
        for(const [index,cell] of cells.entries()){
            const x=vertical?Math.floor(cell/map.cols)-top:cell%map.cols-left,y=vertical?right-cell%map.cols:Math.floor(cell/map.cols)-top;
            const rect=document.createElementNS(ns,'rect');for(const [key,value] of Object.entries({x:x*32+1,y:y*32+1,width:30,height:30,rx:3,fill:cell===activeCell?'#c7782e':zone.color,stroke:cell===activeCell?'#70450f':'#fff','stroke-width':cell===activeCell?2:1}))rect.setAttribute(key,value);
            const text=document.createElementNS(ns,'text');text.setAttribute('x',x*32+16);text.setAttribute('y',y*32+17);text.setAttribute('text-anchor','middle');text.setAttribute('dominant-baseline','middle');text.setAttribute('fill','white');text.setAttribute('font-size',12);text.textContent=index+1;
            const group=document.createElementNS(ns,'g');group.append(rect,text);
            if(index===0||index===count-1){
                const last=index!==0,chosen=last?reverse:!reverse;group.classList.add('walk-entry-endpoint');group.dataset.endpoint=last?'last':'first';group.setAttribute('role','button');group.setAttribute('tabindex','0');group.setAttribute('aria-label','Entrar por cuadrado '+(index+1));group.setAttribute('aria-pressed',String(chosen));
                if(chosen){rect.setAttribute('stroke','#c7782e');rect.setAttribute('stroke-width','2.5');if(cell!==activeCell)rect.setAttribute('fill','#09584a');text.setAttribute('font-weight','bold');}
                const title=document.createElementNS(ns,'title');title.textContent='Entrar por '+(index+1);group.append(title);
                const choose=()=>{setDirection(last);el('direction_map').querySelector('[data-endpoint="'+(last?'last':'first')+'"]')?.focus({preventScroll:true});};
                group.onclick=choose;group.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();choose();}};
            }svg.append(group);
        }host.append(svg);
    }
    const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
    const label=zone=>zone.name.replace(/[&\n]+/g,' · ');
    function cards(){
        const zone=map?.shelves.find(z=>z.id===el('zone').value);
        el('products').hidden=!zone;el('controls').hidden=true;el('zones').hidden=!!zone||!map?.shelves.length;el('status').hidden=!!zone;el('change').hidden=true;el('map').hidden=!!zone||!map;el('back_map').hidden=!zone||document.getElementById('panel-walk').hidden;document.getElementById('products_floating_menu').classList.toggle('has-map-back',!!zone&&!document.getElementById('panel-walk').hidden);
        el('cards').replaceChildren();el('cards').classList.remove('product-highlighted');
        if(!zone)return;
        el('title').textContent='Productos · '+label(zone);
        const placements=organizing?(orderDrafts.get(draftKey())?.placements||map.placements):map.placements;el('order_changes').hidden=!organizing||!orderDrafts.has(draftKey());
        const sectionIndex=map.shelves.findIndex(item=>item.id===zone.id);el('section_progress').textContent=(sectionIndex+1)+' / '+map.shelves.length;el('previous_section').disabled=sectionIndex===0;el('next_section').disabled=false;el('next_section').textContent=sectionIndex===map.shelves.length-1?'Terminar recorrido ✓':'Siguiente sección →';
        routeMap(zone);
        const available=window.MercadoAvailability.forBranch(mapBranch);
        const assigned=rows.filter(row=>map.assignments[row.id]===zone.id&&available[row.id]?.status==='available');
        const reviewed=reviewedProducts();
        const visible=assigned.slice().sort((a,b)=>Number(reviewed.ids.has(a.id))-Number(reviewed.ids.has(b.id)));
        visible.sort((a,b)=>{
            const reviewedOrder=Number(reviewed.ids.has(a.id))-Number(reviewed.ids.has(b.id));if(reviewedOrder)return reviewedOrder;
            const pa=placements[a.id],pb=placements[b.id];if(!pa||!pb)return Number(!pa)-Number(!pb);
            return (isReverse()?-1:1)*(pa.cell-pb.cell||pa.order-pb.order);
        });
        el('status').textContent=assigned.length+' productos en esta zona';
        let lastGroup=null;
        for(const row of visible){
            const position=placements[row.id],groupKey=(reviewed.ids.has(row.id)?'reviewed:':'pending:')+(position?.cell??'none');
            if(groupKey!==lastGroup){const heading=document.createElement('h3');heading.className='walk-square-heading';heading.textContent=(position?'Cuadrado '+([...zone.cells].sort((a,b)=>a-b).indexOf(position.cell)+1):'Sin cuadrado')+(reviewed.ids.has(row.id)?' · Revisados':'');el('cards').append(heading);lastGroup=groupKey;}
            const card=document.createElement('article');card.className='product-card walk-card';card.dataset.productId=row.id;
            const isReviewed=reviewed.ids.has(row.id);card.classList.toggle('walk-reviewed',isReviewed);
            if(isReviewed){card.style.setProperty('--card-background','#e7e9e8','important');card.style.setProperty('--card-ink','#626a66','important');}
            const title=document.createElement('strong');title.textContent=row.product_all||productLabel(row);
        const price=document.createElement('div');price.className='product-last-price';
        const best=row.best_price;
        const value=best?.price ?? row.last_price ?? row.normal_price;
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
        const date=best?.date || row.last_price_date || row.normal_date;
        if(value!=null && date) {
            const age=Math.max(0,priceAgeDays(date));
            if(Number.isFinite(age)) {
                price.dataset.freshness=age<=7?'fresh':age<=14?'recent':'old';
                price.title='Precio registrado hace '+age+' día'+(age===1?'':'s');
                price.setAttribute('aria-label',formatProductPrice(value)+'. '+price.title);
            }
        }
        caption.textContent='';
        const market=best ? best.market : row.last_price_market,conditions=best ? best.conditions : row.last_price_conditions;
        if(market)caption.textContent=market;
        if(date){const days=Math.max(0,priceAgeDays(date));caption.textContent+=(caption.textContent?' · ':'')+days+(days===1?' día':' días');}
        if(conditions && conditions!=='none')caption.textContent+=' · '+conditions.replace('offer','Oferta').replace('2_50%','Segunda al 50%').replace('2_80%','Segunda al 80%').replace('special','Promoción especial');
        const description=best ? best.description : row.last_price_description;
        if(description)caption.textContent+=' · '+description;
        else if(best?.promotion && !conditions)caption.textContent+=' · Promoción';
        if(best ? best.pending : row.last_price_pending) caption.textContent+=' · Pendiente de sincronizar';
        if(value==null) caption.textContent='';
            const actions=document.createElement('div');actions.className='product-row-actions';
            const button=document.createElement('button');button.type='button';button.textContent='Opciones';button.setAttribute('aria-label','Ver acciones de '+productLabel(row));button.onclick=async()=>{await showProductActions(row.id);back.hidden=false;};
            const cart=document.createElement('button');cart.type='button';cart.className='product-cart-button';cart.title='Agregar al carrito';cart.setAttribute('aria-label','Agregar al carrito');
            cart.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3h2l2.5 12h11l2-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>';
            cart.onclick=()=>useProduct('purchase',row.id);
            actions.append(button,cart);
            if(pricesMode){
                button.textContent='Distinto precio';button.setAttribute('aria-label','Registrar distinto precio de '+productLabel(row));button.onclick=async()=>{await openShelfPrice(row);$('shelf_branch').value=el('branch').value;back.hidden=false;};
                cart.textContent='Mismo precio';cart.className='';cart.title='Registrar mismo precio';cart.setAttribute('aria-label','Mismo precio');cart.disabled=(row.last_price??row.normal_price)==null;
                cart.onclick=async()=>{await renderShelfLocals();$('shelf_branch').value=el('branch').value;await recordSameShelfPrice(row.id);if(!document.getElementById('panel-products').hidden)back.hidden=false;await refreshCards();};
                const exit=document.createElement('button');exit.type='button';exit.className='prices-mode-exit';exit.textContent='$';exit.setAttribute('aria-label','Desactivar modo Precios');exit.onclick=()=>setPricesMode(false);actions.append(exit);
            }
            const eye=document.createElement('button');eye.type='button';eye.className='walk-eye';eye.setAttribute('aria-pressed',String(isReviewed));
            eye.title=isReviewed?'Volver a pendientes':'Marcar como revisado';eye.setAttribute('aria-label',eye.title+': '+productLabel(row));
            eye.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(isReviewed?'<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c7 0 10 7 10 7a18 18 0 0 1-3 4M6.2 6.2C3.4 8.1 2 12 2 12s3 7 10 7a11 11 0 0 0 5.8-1.8"/>':'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>')+'</svg>';
            eye.onclick=()=>{
                const next=card.nextElementSibling,previous=card.previousElementSibling;
                if(isReviewed)reviewed.ids.delete(row.id);else reviewed.ids.add(row.id);
                try{sessionStorage.setItem(reviewed.key,JSON.stringify([...reviewed.ids]));}catch(_){}
                cards();
                // Al enviarlo al fondo, el foco sigue en el siguiente pendiente.
                const target=!isReviewed?(next&&!reviewed.ids.has(next.dataset.productId)?next:previous):null;
                const id=target?.dataset.productId||row.id;
                const destination=[...el('cards').querySelectorAll('.product-card')].find(item=>item.dataset.productId===id);
                destination?.focus({preventScroll:true});
            };
            actions.insertBefore(eye,actions.children[2]||null);
            if(historyMode)actions.classList.add('history-hidden-actions');
            card.tabIndex=0;card.setAttribute('aria-expanded','false');card.setAttribute('aria-label',title.textContent+'. Activar para mostrar acciones');
            const toggle=()=>{const opening=!card.classList.contains('actions-visible');for(const item of el('cards').querySelectorAll('.product-card')){item.classList.remove('actions-visible');item.setAttribute('aria-expanded','false');}card.classList.toggle('actions-visible',opening);card.setAttribute('aria-expanded',String(opening));el('cards').classList.toggle('product-highlighted',opening);if(opening){routeMap(zone,placements[row.id]?.cell??null);centerProductCard(card);}};
            card.onclick=event=>{if(!event.target.closest('button,input,select,textarea,a,form,.price-history'))toggle();};card.onkeydown=event=>{if(event.target===card&&['Enter',' '].includes(event.key)){event.preventDefault();toggle();}};
            const orderControls=document.createElement('div');orderControls.className='walk-card-order';
            const peers=visible.filter(candidate=>position&&placements[candidate.id]?.cell===position.cell&&reviewed.ids.has(candidate.id)===isReviewed),index=peers.findIndex(candidate=>candidate.id===row.id);
            for(const [symbol,step,text] of [['↑',-1,'Subir'],['↓',1,'Bajar']]){const control=document.createElement('button');control.type='button';control.textContent=symbol;control.setAttribute('aria-label',text+' '+productLabel(row));control.title=text;control.disabled=!position||!peers[index+step];control.onclick=()=>changeOrder(row.id,peers[index+step].id);orderControls.append(control);}
            const squareField=document.createElement('label');squareField.className='walk-organize-square';squareField.textContent='Cuadrado';
            const square=document.createElement('select');square.setAttribute('aria-label','Cuadrado de '+productLabel(row));square.add(new Option('Sin cuadrado',''));[...zone.cells].sort((a,b)=>a-b).forEach((cell,index)=>square.add(new Option('Cuadrado '+(index+1),String(cell))));square.value=position?String(position.cell):'';square.onchange=()=>changeSquare(row.id,square.value===''?null:Number(square.value));squareField.append(square);
            if(organizing){card.append(orderControls);actions.classList.add('history-hidden-actions');}
            card.append(title,price,caption);
            if(organizing){
                card.append(squareField);
                const unavailable=document.createElement('button');unavailable.type='button';unavailable.className='walk-unavailable';unavailable.textContent='No disponible en este súper';unavailable.setAttribute('aria-label','Marcar no disponible: '+productLabel(row));
                unavailable.onclick=async()=>{
                    const branch=mapBranch,previous=window.MercadoAvailability.get(branch,row.id).status;unavailable.disabled=true;
                    try{
                        await window.MercadoAvailability.set(branch,[row.id],'unavailable');
                        el('order_status').textContent=productLabel(row)+' marcado como no disponible. Se sincronizará automáticamente. ';
                        const undo=document.createElement('button');undo.type='button';undo.className='walk-availability-undo';undo.textContent='Deshacer';
                        undo.onclick=async()=>{undo.disabled=true;try{await window.MercadoAvailability.set(branch,[row.id],previous);el('order_status').textContent='Disponibilidad restaurada.';}catch(error){undo.disabled=false;el('order_status').append(' No se pudo restaurar: '+error.message);}};el('order_status').append(undo);
                    }catch(error){unavailable.disabled=false;el('order_status').textContent='No se pudo guardar la disponibilidad: '+error.message;}
                };card.append(unavailable);
            }
            card.append(actions);if(historyMode)card.append(renderPriceHistory(row));el('cards').append(card);
        }
        if(!visible.length){const empty=document.createElement('p');empty.textContent='No hay productos disponibles para este súper en esta zona.';el('cards').append(empty);}
    }
    function draw(){
        const host=el('map'),zones=el('zones');host.replaceChildren();zones.replaceChildren();if(!map)return;
        const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${map.cols*24} ${map.rows*24}`);svg.setAttribute('aria-label','Mapa del supermercado. Elegí una zona.');
        const node=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))n.setAttribute(key,value);return n;};
        svg.append(node('rect',{width:map.cols*24,height:map.rows*24,fill:'#fff'}));
        map.cells.forEach((v,i)=>{if(v)svg.append(node('rect',{x:i%map.cols*24,y:Math.floor(i/map.cols)*24,width:24,height:24,fill:'#d5e4dc',stroke:'#fff','stroke-width':.4}));});
        for(const zone of map.shelves){
            const group=node('g',{role:'button',tabindex:0,'aria-label':'Ver productos de '+label(zone)});
            for(const i of zone.cells)group.append(node('rect',{x:i%map.cols*24,y:Math.floor(i/map.cols)*24,width:24,height:24,fill:zone.color,stroke:'#fff','stroke-width':.4}));
            if(zone.cells.length){
                const xs=zone.cells.map(i=>i%map.cols),ys=zone.cells.map(i=>Math.floor(i/map.cols));
                const x=(Math.min(...xs)+Math.max(...xs)+1)*12,y=(Math.min(...ys)+Math.max(...ys)+1)*12;
                const vertical=zone.orientation==='vertical',lines=zone.name.split(/[&\n]/).map(line=>line.trim()).filter(Boolean);
                const labelGroup=node('g',{class:'walk-map-label',transform:`translate(${x} ${y})${vertical?' rotate(-90)':''}`,'data-orientation':vertical?'vertical':'horizontal'});
                const fontSize=13,lineHeight=17,measure=document.createElement('canvas').getContext('2d');measure.font='bold '+fontSize+'px "Segoe UI",sans-serif';
                const width=Math.max(0,...lines.map(line=>measure.measureText(line).width))+12,height=lines.length*lineHeight+6;
                labelGroup.append(node('rect',{x:-width/2,y:-height/2,width,height,fill:'rgba(255,255,255,.92)'}));
                const text=node('text',{'text-anchor':'middle','dominant-baseline':'middle',fill:'#09584a','font-family':'Segoe UI, sans-serif','font-size':fontSize,'font-weight':'bold'});
                lines.forEach((line,index)=>{const span=node('tspan',{x:0,y:(index-(lines.length-1)/2)*lineHeight});span.textContent=line;text.append(span);});
                labelGroup.append(text);group.append(labelGroup);
            }
            const choose=()=>chooseSection(zone.id);
            const button=document.createElement('button');button.type='button';button.textContent=label(zone);button.title=label(zone);button.style.borderLeftColor=zone.color;button.onclick=choose;zones.append(button);
            group.onclick=choose;group.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();choose();}};svg.append(group);
        }
        host.append(svg);
    }
    function loadMap(){
        map=null;mapBranch=el('branch').value;el('zone').replaceChildren(new Option('Tocá una zona del mapa',''));
        try{const raw=localStorage.getItem('mercado-branch-map-v1:'+el('branch').value);if(raw)map=window.mercadoMapProducts.validate(JSON.parse(raw));}catch(_){el('status').textContent='No se pudo abrir el mapa guardado.';}
        if(map)for(const zone of map.shelves)el('zone').add(new Option(label(zone),zone.id));
        el('status').textContent=!el('branch').value?'Elegí un supermercado con el botón S de la barra superior para ver su mapa.':!map||!map.shelves.length?'Esta sucursal todavía no tiene zonas. Podés crearlas en Mapa.':'Tocá la zona donde estás para ver sus productos.';
        draw();cards();
    }
    async function refreshCards(){const catalog=await catalogWithPrices();rows=catalog;cards();}
    document.addEventListener('mercado-module-leave',event=>{if(event.detail.id==='walk'){organizing=false;updateOrganize();el('order_status').textContent='';cards();}});
    document.addEventListener('mercado-catalog-mode-change',()=>{if(pricesMode||historyMode){organizing=false;updateOrganize();}cards();});
    window.openWalk=async()=>{
        const token=++generation,previous=window.mercadoActiveBranch??el('branch').value;
        try{const state=await shoppingState(),catalog=await catalogWithPrices();if(token!==generation)return;rows=catalog;
            el('branch').replaceChildren(new Option('Elegí una sucursal',''));for(const branch of state.branches)el('branch').add(new Option(branch.name+(branch.address?' · '+branch.address:''),branch.id));
            el('branch').value=previous;const zone=map&&el('branch').value===mapBranch?el('zone').value:'';loadMap();if(map?.shelves.some(z=>z.id===zone)){el('zone').value=zone;cards();}
        }catch(_){el('status').textContent='Los datos todavía se están abriendo. Volvé a entrar en Recorrer.';}
    };
    el('branch').onchange=()=>{loadMap();if(window.mercadoActiveBranch!==el('branch').value)void choosePurchaseBranch(el('branch').value);};
    document.addEventListener('mercado-active-branch-change',()=>{if(el('branch').value!==window.mercadoActiveBranch){void openWalk();}});
    el('zone').onchange=cards;
    el('back_map').onclick=()=>el('change').click();
    el('change').onclick=()=>{
        el('zone').value='';el('route_complete').hidden=true;cards();el('status').textContent='Tocá la zona donde estás.';el('zones').querySelector('button')?.focus({preventScroll:true});
        requestAnimationFrame(()=>{
            const bounds=el('map').getBoundingClientRect(),screen=window.visualViewport;
            const top=Math.max(document.getElementById('navbar').getBoundingClientRect().bottom,screen?.offsetTop||0)+12;
            const bottom=(screen?.offsetTop||0)+(screen?.height||window.innerHeight)-12;
            const offset=Math.max(0,(bottom-top-bounds.height)/2);
            window.scrollTo({top:Math.max(0,window.scrollY+bounds.top-top-offset),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
        });
    };
    window.captureWalkReturn=function(id){
        if(document.getElementById('panel-walk').hidden)return;
        const saved={branch:mapBranch,zone:el('zone').value,scroll:window.scrollY,top:[...el('cards').querySelectorAll('.product-card')].find(card=>card.dataset.productId===id)?.getBoundingClientRect().top};
        window.productActionReturn=async()=>{
            window.productActionReturn=null;back.hidden=true;
            await closeProductActions(false);await closeShelfPrice(false);await closeProductEditor(false);
            showModule('walk',{scroll:false});await openWalk();
            if(mapBranch===saved.branch&&map?.shelves.some(zone=>zone.id===saved.zone)){el('zone').value=saved.zone;cards();}
            await new Promise(resolve=>requestAnimationFrame(resolve));
            const card=[...el('cards').querySelectorAll('.product-card')].find(card=>card.dataset.productId===id);
            const top=card&&saved.top!==undefined?window.scrollY+card.getBoundingClientRect().top-saved.top:saved.scroll;
            window.scrollTo({top:Math.max(0,top),behavior:'instant'});card?.focus({preventScroll:true});
        };
    };
    const back=document.createElement('button');back.type='button';back.className='walk-return';back.textContent='Volver a Recorrer';back.hidden=true;back.onclick=()=>{if(window.productActionReturn)void window.productActionReturn();else{back.hidden=true;showModule('walk');}};document.getElementById('panel-products').prepend(back);
    document.addEventListener('mercado-availability-change',cards);
    document.addEventListener('mercado-map-change',()=>{if(!document.getElementById('panel-walk').hidden)void openWalk();});
})();
