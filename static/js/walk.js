// Consulta del mapa local: elegir una zona nunca modifica sus asignaciones.
(function(){
    const el=id=>document.getElementById('walk_'+id);
    let map=null,mapBranch='',rows=[],generation=0;
    let organizing=false;
    let automatic=null,autoMode=false,autoIndex=0,autoSignature='',endpointBranch='';
    const autoStop=()=>automatic?.stops[autoIndex];
    function routeSignature(){return JSON.stringify([map,rows.map(row=>[row.id,window.MercadoAvailability.get(mapBranch,row.id).status])]);}
    function autoMap(){
        el('auto_start').setAttribute('aria-pressed',String(el('auto_pick').value==='start'));el('auto_end').setAttribute('aria-pressed',String(el('auto_pick').value==='end'));
        const host=el('auto_map');host.replaceChildren();if(!map)return;
        const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`-2 -2 ${map.cols*24+4} ${map.rows*24+4}`);
        const node=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
        svg.setAttribute('role','img');svg.setAttribute('aria-label',automatic?'Camino hasta la próxima parada del recorrido':'Mapa para elegir inicio y final');
        const defs=node('defs',{}),pattern=node('pattern',{id:'walk-auto-grid',width:24,height:24,patternUnits:'userSpaceOnUse'});
        pattern.append(node('path',{d:'M24 0H0V24',fill:'none',stroke:'#e6ede8','stroke-width':.7}));defs.append(pattern);svg.append(defs);
        svg.append(node('rect',{width:map.cols*24,height:map.rows*24,fill:'#f9fbf9'}),node('rect',{width:map.cols*24,height:map.rows*24,fill:'url(#walk-auto-grid)'}));
        map.cells.forEach((v,i)=>{if(v)svg.append(node('rect',{x:i%map.cols*24+1,y:Math.floor(i/map.cols)*24+1,width:22,height:22,rx:3,fill:'#b9d2c1'}));});
        if(!automatic)for(const zone of map.shelves){
            if(zone.cells.length<2)continue;
            const xs=zone.cells.map(i=>i%map.cols),ys=zone.cells.map(i=>Math.floor(i/map.cols)),x=(Math.min(...xs)+Math.max(...xs)+1)*12,y=(Math.min(...ys)+Math.max(...ys)+1)*12;
            const name=node('text',{x,y:y+3,'text-anchor':'middle',fill:'#365947','font-size':9,'font-weight':600,'pointer-events':'none'});
            name.textContent=zone.name.replace(/[&\n]+/g,' · ');
            const width=(Math.max(...xs)-Math.min(...xs)+1)*24-6;
            if(name.textContent.length*5>width){name.setAttribute('textLength',width);name.setAttribute('lengthAdjust','spacingAndGlyphs');}svg.append(name);
        }
        const center=i=>`${i%map.cols*24+12},${Math.floor(i/map.cols)*24+12}`;
        if(automatic){const route=[automatic.start,...automatic.stops.flatMap(stop=>stop.path.slice(1)),...automatic.finish.slice(1)];svg.append(node('polyline',{class:'walk-auto-full-path',points:route.map(center).join(' '),fill:'none',stroke:'#cad9d0','stroke-width':3,'stroke-linejoin':'round','stroke-linecap':'round'}));}
        const path=automatic?(autoStop()?.path||automatic.finish):[];
        if(path.length)svg.append(node('polyline',{class:'walk-auto-current-path',points:path.map(center).join(' '),fill:'none',stroke:'var(--primary)','stroke-width':4,'stroke-linejoin':'round','stroke-linecap':'round'}));
        for(const [n,stop] of (automatic?.stops||[]).entries()){
            const x=stop.cell%map.cols*24+12,y=Math.floor(stop.cell/map.cols)*24+12;
            svg.append(node('circle',{cx:x,cy:y,r:8.5,fill:n===autoIndex?'var(--primary)':n<autoIndex?'#e8efea':'#fff',stroke:n===autoIndex?'var(--primary)':'#95b39f','stroke-width':1}));
            const text=node('text',{x,y:y+3,'text-anchor':'middle',fill:n===autoIndex?'#fff':'#365947','font-size':9,'font-weight':700});text.textContent=n+1;svg.append(text);
        }
        window.MercadoBoundaries.svg(svg,map,24);
        for(const [prefix,color,text] of [['s','#176b58','I'],['e','#b07136','F']]){const r=Number(el('auto_'+prefix+'r').value)-1,c=Number(el('auto_'+prefix+'c').value)-1;if(Number.isInteger(r)&&Number.isInteger(c)&&r>=0&&r<map.rows&&c>=0&&c<map.cols&&!map.cells[r*map.cols+c]){svg.append(node('circle',{cx:c*24+12,cy:r*24+12,r:10,fill:color,stroke:'#fff','stroke-width':2}));const label=node('text',{x:c*24+12,y:r*24+16,'text-anchor':'middle',fill:'white','font-size':11,'font-weight':700});label.textContent=text;svg.append(label);}}
        svg.onclick=event=>{if(automatic)return;const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse()),x=Math.floor(point.x/24),y=Math.floor(point.y/24);if(x<0||y<0||x>=map.cols||y>=map.rows)return;if(map.cells[y*map.cols+x]){notice('Elegí un cuadrado libre para caminar.');return;}const prefix=el('auto_pick').value==='start'?'s':'e';el('auto_'+prefix+'r').value=y+1;el('auto_'+prefix+'c').value=x+1;el('auto_pick').value=prefix==='s'?'end':'start';el('auto_status').textContent='';saveEndpoints();autoMap();};
        el('auto_map_hint').textContent=automatic?(autoStop()?'Camino a tu próxima parada':'Camino al final'):'Marcando '+(el('auto_pick').value==='start'?'inicio':'final');
        host.append(svg);
    }
    function saveEndpoints(){try{sessionStorage.setItem('mercado-price-endpoints:'+mapBranch,JSON.stringify(['sr','sc','er','ec'].map(key=>el('auto_'+key).value)));}catch(_){} }
    function autoRefresh(){
        el('auto_start').closest('.walk-endpoint-buttons').hidden=!!automatic;el('auto_calculate').disabled=!map;for(const key of ['sr','sc','er','ec','pick','start','end'])el('auto_'+key).disabled=!!automatic||!map;
        el('auto_toggle').checked=autoMode;el('auto_toggle').disabled=!map;el('auto').hidden=!autoMode;
        for(const key of ['live','metrics','navigation'])el('auto_'+key).hidden=!automatic;
        el('auto_previous').disabled=autoIndex===0;el('auto_next').disabled=!!automatic&&autoIndex>=automatic.stops.length;
        el('auto_pending').hidden=!el('auto_warnings').children.length;
        const pendingCount=el('auto_warnings').children.length;el('auto_pending_count').textContent=pendingCount+(pendingCount===1?' específico pendiente':' específicos pendientes');
        if(automatic){
            const stop=autoStop(),zone=map.shelves.find(z=>z.id===stop?.zone),complete=!stop;
            el('auto_phase').textContent=complete?'Revisión terminada':'En recorrido';
            el('auto_destination').textContent=complete?'Todo revisado':label(zone);
            if(complete&&automatic.missing.length+automatic.unreachable.length)el('auto_destination').textContent='Recorrido terminado';
            el('auto_stop_detail').textContent=stop?'Cuadrado '+([...zone.cells].sort((a,b)=>a-b).indexOf(stop.cell)+1)+' · '+stop.items.length+(stop.items.length===1?' específico':' específicos'):'Seguí el camino hasta el punto final.';
            el('auto_stop_badge').textContent=complete?'✓':String(autoIndex+1).padStart(2,'0')+' / '+String(automatic.stops.length).padStart(2,'0');
            const progress=automatic.stops.length?Math.round(autoIndex/automatic.stops.length*100):100;
            el('auto_progress').setAttribute('aria-valuenow',String(progress));el('auto_progress').setAttribute('aria-valuetext',autoIndex+' de '+automatic.stops.length+' paradas revisadas');el('auto_progress_fill').style.width=progress+'%';
            el('auto_total_stops').textContent=automatic.stops.length;el('auto_total_items').textContent=automatic.stops.reduce((n,s)=>n+s.items.length,0);el('auto_total_steps').textContent=automatic.total;
            el('auto_status').textContent='';el('auto_next').textContent=complete?'Revisión terminada':autoIndex===automatic.stops.length-1?'Finalizar revisión →':'Cuadrado revisado →';
        }
        autoMap();
    }
    function autoNavigate(){const stop=autoStop();el('zone').value=stop?.zone||'';el('route_complete').hidden=true;cards();autoRefresh();}
    el('auto_calculate').onclick=async()=>{
        if(!map)return;
        if(orderDrafts.size){notice('Guardá o descartá los cambios de orden antes de calcular.');return;}
        try{const point=prefix=>{const r=Number(el('auto_'+prefix+'r').value),c=Number(el('auto_'+prefix+'c').value);if(!Number.isInteger(r)||!Number.isInteger(c)||r<1||c<1||r>map.rows||c>map.cols)throw Error('Las coordenadas deben estar dentro del mapa.');return (r-1)*map.cols+c-1;};
            const available=rows.filter(row=>window.MercadoAvailability.get(mapBranch,row.id).status==='available');
            const planned=window.MercadoPricePlanner.plan(map,available,point('s'),point('e'));
            automatic=planned;autoIndex=0;autoSignature=routeSignature();organizing=false;updateOrganize();saveEndpoints();
            el('auto_warnings').replaceChildren();for(const [title,items] of [['Sin cuadrado asignado',planned.missing],['Sin acceso desde el inicio',planned.unreachable]])for(const item of items){const li=document.createElement('li');li.textContent=title+': '+(item.product_all||productLabel(item));el('auto_warnings').append(li);}
            await setPricesMode(true);autoNavigate();
        }catch(error){notice(error.message);}
    };
    async function exitAutomatic(){automatic=null;autoMode=false;el('auto_status').textContent='';await setPricesMode(false);autoRefresh();cards();notice('Recorrido automático cerrado.');}
    el('auto_restart').onclick=async()=>{
        if(!automatic)return;
        // Solo reiniciar las marcas de esta ruta: los precios guardados se conservan.
        for(const stop of automatic.stops){
            const reviewed=reviewedProducts(stop.zone);
            for(const item of stop.items)reviewed.ids.delete(item.id);
            try{sessionStorage.setItem(reviewed.key,JSON.stringify([...reviewed.ids]));}catch(_){}
        }
        automatic=null;autoIndex=0;el('zone').value='';el('auto_pick').value='start';
        el('auto_status').textContent='';el('auto_warnings').replaceChildren();el('auto_pending').open=false;
        await setPricesMode(false);autoRefresh();cards();el('auto_start').focus({preventScroll:true});
    };
    el('auto_toggle').onchange=async()=>{if(!el('auto_toggle').checked){await exitAutomatic();return;}autoMode=true;el('auto_status').textContent='';autoRefresh();cards();};
    el('auto_previous').onclick=()=>{if(autoIndex>0){autoIndex--;autoNavigate();}};
    el('auto_next').onclick=()=>{const stop=autoStop();if(!stop)return;const reviewed=reviewedProducts();for(const item of stop.items)reviewed.ids.add(item.id);try{sessionStorage.setItem(reviewed.key,JSON.stringify([...reviewed.ids]));}catch(_){}autoIndex++;autoNavigate();};
    for(const [key,value] of [['start','start'],['end','end']])el('auto_'+key).onclick=()=>{el('auto_pick').value=value;autoMap();};
    function updateOrganize(){document.documentElement.classList.toggle('walk-organize-mode',organizing);el('organize_toggle').setAttribute('aria-pressed',String(organizing));}
    window.setWalkOrganize=async()=>{
        if(automatic){notice('Salí del recorrido automático para organizar ubicaciones.');return;}
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
        if(!window.mercadoMapProducts.saveOrder(mapBranch,el('zone').value,draft.base,draft.placements)){notice('El mapa cambió o no se pudo guardar. Tus cambios siguen aquí; descartalos para cargar el orden vigente.');return;}
        orderDrafts.delete(key);await openWalk();notice('Cambios guardados. Se sincronizarán con los otros dispositivos.', {success:true});
    };
    el('order_discard').onclick=()=>{orderDrafts.delete(draftKey());el('order_status').textContent='';cards();};
    const reviewedByZone=new Map();
    function reviewedProducts(zone=el('zone').value){
        const key='mercado-walk-reviewed-v1:'+mapBranch+':'+zone;
        if(!reviewedByZone.has(key)){
            let saved=[];try{const value=JSON.parse(sessionStorage.getItem(key)||'[]');if(Array.isArray(value))saved=value.filter(id=>typeof id==='string');}catch(_){}
            reviewedByZone.set(key,new Set(saved));
        }
        return {key,ids:reviewedByZone.get(key)};
    }
    function directionKey(){return 'mercado-walk-direction:'+mapBranch+':'+el('zone').value;}
    function isReverse(){if(automatic)return false;try{const saved=sessionStorage.getItem(directionKey());return saved?saved==='reverse':map?.shelves.find(zone=>zone.id===el('zone').value)?.entry==='last';}catch(_){return map?.shelves.find(zone=>zone.id===el('zone').value)?.entry==='last';}}
    function setDirection(reverse){try{sessionStorage.setItem(directionKey(),reverse?'reverse':'forward');}catch(_){}cards();}
    function chooseSection(id){
        if(automatic)return;
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
        el('products').hidden=!zone||(autoMode&&!automatic);el('controls').hidden=true;el('zones').hidden=autoMode||!!zone||!map?.shelves.length;el('status').hidden=autoMode||!!zone;el('change').hidden=true;el('map').hidden=autoMode||!!zone||!map;el('back_map').hidden=!zone||document.getElementById('panel-walk').hidden;document.getElementById('products_floating_menu').classList.toggle('has-map-back',!!zone&&!document.getElementById('panel-walk').hidden);
        el('cards').replaceChildren();el('cards').classList.remove('product-highlighted');
        el('route').hidden=!!automatic;el('previous_section').parentElement.hidden=!!automatic;
        if(!zone)return;
        el('title').textContent=automatic?'Precios de esta parada':'Productos · '+label(zone);
        const placements=organizing?(orderDrafts.get(draftKey())?.placements||map.placements):map.placements;el('order_changes').hidden=!organizing||!orderDrafts.has(draftKey());
        const sectionIndex=map.shelves.findIndex(item=>item.id===zone.id);el('section_progress').textContent=(sectionIndex+1)+' / '+map.shelves.length;el('previous_section').disabled=sectionIndex===0;el('next_section').disabled=false;el('next_section').textContent=sectionIndex===map.shelves.length-1?'Terminar recorrido ✓':'Siguiente sección →';
        routeMap(zone);
        const available=window.MercadoAvailability.forBranch(mapBranch);
        const stop=autoStop();
        const assigned=rows.filter(row=>map.assignments[row.id]===zone.id&&available[row.id]?.status==='available'&&(!automatic||stop?.items.some(item=>item.id===row.id)));
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
        const {price,caption,recentBest}=renderProductPrice(row);
        const secondPrice=renderSecondProductPrice(row);
        const normalReference = renderNormalProductPrice(row, caption, secondPrice);
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
            card.classList.toggle('has-second-price',Boolean(secondPrice));card.append(title,price);
            if (recentBest) card.append(recentBest);
            card.append(caption);
            if(secondPrice)card.append(secondPrice);
            if (normalReference) card.append(normalReference);
            if(organizing){
                card.append(squareField);
                const unavailable=document.createElement('button');unavailable.type='button';unavailable.className='walk-unavailable';unavailable.textContent='No disponible en este súper';unavailable.setAttribute('aria-label','Marcar no disponible: '+productLabel(row));
                unavailable.onclick=async()=>{
                    const branch=mapBranch,previous=window.MercadoAvailability.get(branch,row.id).status;unavailable.disabled=true;
                    try{
                        await window.MercadoAvailability.set(branch,[row.id],'unavailable');
                        notice(productLabel(row)+' marcado como no disponible. Se sincronizará automáticamente.', {success:true});
                        const undo=document.createElement('button');undo.type='button';undo.className='walk-availability-undo';undo.textContent='Deshacer';
                        undo.onclick=async()=>{undo.disabled=true;try{await window.MercadoAvailability.set(branch,[row.id],previous);undo.remove();notice('Disponibilidad restaurada.', {success:true});}catch(error){undo.disabled=false;notice('No se pudo restaurar: '+error.message);}};el('order_status').replaceChildren(undo);
                    }catch(error){unavailable.disabled=false;notice('No se pudo guardar la disponibilidad: '+error.message);}
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
        window.MercadoBoundaries.svg(svg,map,24);
        host.append(svg);
    }
    function loadMap(){
        map=null;mapBranch=el('branch').value;el('zone').replaceChildren(new Option('Tocá una zona del mapa',''));
        try{const raw=localStorage.getItem('mercado-branch-map-v1:'+el('branch').value);if(raw)map=window.mercadoMapProducts.validate(JSON.parse(raw));}catch(_){el('status').textContent='No se pudo abrir el mapa guardado.';}
        if(map)for(const zone of map.shelves)el('zone').add(new Option(label(zone),zone.id));
        if(endpointBranch!==mapBranch){endpointBranch=mapBranch;automatic=null;autoMode=false;el('auto_warnings').replaceChildren();el('auto_status').textContent='';try{const saved=JSON.parse(sessionStorage.getItem('mercado-price-endpoints:'+mapBranch));['sr','sc','er','ec'].forEach((key,i)=>el('auto_'+key).value=saved?.[i]||1);}catch(_){} }
        if(automatic&&autoSignature!==routeSignature()){automatic=null;el('auto_status').textContent='Cambiaron el mapa o los productos disponibles. Volvé a calcular.';el('auto_warnings').replaceChildren();}
        if(autoStop())el('zone').value=autoStop().zone;
        autoRefresh();
        el('status').textContent=!el('branch').value?'Elegí un supermercado con el botón S de la barra superior para ver su mapa.':!map||!map.shelves.length?'Esta sucursal todavía no tiene zonas. Podés crearlas en Mapa.':'Tocá la zona donde estás para ver sus productos.';
        draw();cards();
    }
    document.addEventListener('mercado-catalog-change',event=>{rows=event.detail.rows;if(!document.getElementById('panel-walk').hidden)cards();});
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
    el('change').onclick=async()=>{
        if(automatic)await exitAutomatic();
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
    document.addEventListener('mercado-availability-change',()=>{if(automatic)void openWalk();else cards();});
    document.addEventListener('mercado-map-change',()=>{if(!document.getElementById('panel-walk').hidden)void openWalk();});
})();
