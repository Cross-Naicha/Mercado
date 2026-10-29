// Consulta del mapa local: elegir una zona nunca modifica sus asignaciones.
(function(){
    const el=id=>document.getElementById('walk_'+id);
    let map=null,mapBranch='',rows=[],generation=0,filterMode='date',filters=[];
    const reviewedByZone=new Map();
    function reviewedProducts(){
        const key='mercado-walk-reviewed-v1:'+mapBranch+':'+el('zone').value;
        if(!reviewedByZone.has(key)){
            let saved=[];try{const value=JSON.parse(sessionStorage.getItem(key)||'[]');if(Array.isArray(value))saved=value.filter(id=>typeof id==='string');}catch(_){}
            reviewedByZone.set(key,new Set(saved));
        }
        return {key,ids:reviewedByZone.get(key)};
    }
    function resetFilters(){filters=[];el('search').value='';}
    function filterRows(assigned){
        const order=filterMode==='brand'?['product_brand','product_name','product_class']:['product_class','product_name','product_brand'];
        const host=el('filters');host.replaceChildren();
        const labels={date:'Por fecha',type:'Por tipo',brand:'Por marca'};
        const next={date:'type',type:'brand',brand:'date'}[filterMode];
        el('filter_mode').textContent=labels[filterMode];el('filter_mode').setAttribute('aria-label',labels[filterMode]+'. Cambiar a '+labels[next]);
        let result=assigned;
        filters.forEach((value,index)=>{result=result.filter(row=>row[order[index]]===value);});
        if(filters.length){const active=document.createElement('button');active.type='button';active.className='combined-filter';active.textContent=filters.join(' · ');active.setAttribute('aria-pressed','true');active.title='Volver al nivel anterior';active.onclick=()=>{filters.pop();cards();};host.append(active);}
        if(filterMode!=='date'&&filters.length<order.length){
            for(const value of [...new Set(result.map(row=>row[order[filters.length]]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base',numeric:true}))){
                const button=document.createElement('button');button.type='button';button.textContent=value;button.onclick=()=>{filters.push(value);cards();};host.append(button);
            }
        }
        host.hidden=!host.childElementCount;
        if(filterMode==='date')result=[...result].sort((a,b)=>catalogDate(b)-catalogDate(a)||(a.product_all||'').localeCompare(b.product_all||'','es',{numeric:true,sensitivity:'base'}));
        return result;
    }
    const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
    const label=zone=>zone.name.replace(/[&\n]+/g,' · ');
    function cards(){
        const zone=map?.shelves.find(z=>z.id===el('zone').value);
        el('products').hidden=!zone;el('controls').hidden=true;el('zones').hidden=!!zone||!map?.shelves.length;el('status').hidden=!!zone;el('change').hidden=true;el('map').hidden=!!zone||!map;
        el('cards').replaceChildren();el('cards').classList.remove('product-highlighted');
        if(!zone)return;
        el('title').textContent='Productos · '+label(zone);
        const assigned=rows.filter(row=>map.assignments[row.id]===zone.id);
        const query=normalize(el('search').value);
        const reviewed=reviewedProducts();
        const visible=filterRows(assigned).filter(row=>normalize(productLabel(row)+' '+(row.product_class||'')).includes(query)).sort((a,b)=>Number(reviewed.ids.has(a.id))-Number(reviewed.ids.has(b.id)));
        el('status').textContent=assigned.length+' productos en esta zona';
        for(const row of visible){
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
            const toggle=()=>{const opening=!card.classList.contains('actions-visible');for(const item of el('cards').querySelectorAll('.product-card')){item.classList.remove('actions-visible');item.setAttribute('aria-expanded','false');}card.classList.toggle('actions-visible',opening);card.setAttribute('aria-expanded',String(opening));el('cards').classList.toggle('product-highlighted',opening);if(opening)centerProductCard(card);};
            card.onclick=event=>{if(!event.target.closest('button,input,select,textarea,a,form,.price-history'))toggle();};card.onkeydown=event=>{if(event.target===card&&['Enter',' '].includes(event.key)){event.preventDefault();toggle();}};
            card.append(title,price,caption,actions);if(historyMode)card.append(renderPriceHistory(row));el('cards').append(card);
        }
        if(!visible.length){const empty=document.createElement('p');empty.textContent=assigned.length?'No hay productos que coincidan con la búsqueda.':'Esta zona todavía no tiene productos asignados.';el('cards').append(empty);}
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
            if(zone.cells.length){const xs=zone.cells.map(i=>i%map.cols),ys=zone.cells.map(i=>Math.floor(i/map.cols));const text=node('text',{x:(Math.min(...xs)+Math.max(...xs)+1)*12,y:(Math.min(...ys)+Math.max(...ys)+1)*12,'text-anchor':'middle','dominant-baseline':'middle',fill:'#093d33',stroke:'white','stroke-width':4,'paint-order':'stroke','font-size':13,'font-weight':'bold'});text.textContent=label(zone);group.append(text);}
            const choose=()=>{el('zone').value=zone.id;resetFilters();cards();el('title').focus({preventScroll:true});};
            const button=document.createElement('button');button.type='button';button.textContent=label(zone);button.title=label(zone);button.style.borderLeftColor=zone.color;button.onclick=choose;zones.append(button);
            group.onclick=choose;group.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();choose();}};svg.append(group);
        }
        host.append(svg);
    }
    function loadMap(){
        map=null;mapBranch=el('branch').value;el('zone').replaceChildren(new Option('Tocá una zona del mapa',''));el('search').value='';
        try{const raw=localStorage.getItem('mercado-branch-map-v1:'+el('branch').value);if(raw)map=window.mercadoMapProducts.validate(JSON.parse(raw));}catch(_){el('status').textContent='No se pudo abrir el mapa guardado.';}
        if(map)for(const zone of map.shelves)el('zone').add(new Option(label(zone),zone.id));
        el('status').textContent=!el('branch').value?'Elegí un supermercado con el botón S de la barra superior para ver su mapa.':!map||!map.shelves.length?'Esta sucursal todavía no tiene zonas. Podés crearlas en Mapa.':'Tocá la zona donde estás para ver sus productos.';
        draw();cards();
    }
    async function refreshCards(){const catalog=await catalogWithPrices();rows=catalog;cards();}
    document.addEventListener('mercado-catalog-mode-change',cards);
    window.openWalk=async()=>{
        const savedQuery=el('search').value;
        const token=++generation,previous=window.mercadoActiveBranch??el('branch').value;
        try{const state=await shoppingState(),catalog=await catalogWithPrices();if(token!==generation)return;rows=catalog;
            el('branch').replaceChildren(new Option('Elegí una sucursal',''));for(const branch of state.branches)el('branch').add(new Option(branch.name+(branch.address?' · '+branch.address:''),branch.id));
            el('branch').value=previous;const zone=map&&el('branch').value===mapBranch?el('zone').value:'';loadMap();if(map?.shelves.some(z=>z.id===zone)){el('zone').value=zone;el('search').value=savedQuery;cards();}
        }catch(_){el('status').textContent='Los datos todavía se están abriendo. Volvé a entrar en Recorrer.';}
    };
    el('branch').onchange=()=>{resetFilters();filterMode='date';loadMap();if(window.mercadoActiveBranch!==el('branch').value)void choosePurchaseBranch(el('branch').value);};
    document.addEventListener('mercado-active-branch-change',()=>{if(el('branch').value!==window.mercadoActiveBranch){resetFilters();filterMode='date';void openWalk();}});
    el('zone').onchange=()=>{resetFilters();cards();};el('search').oninput=cards;
    el('filter_mode').onclick=()=>{filterMode={date:'type',type:'brand',brand:'date'}[filterMode];filters=[];cards();};
    el('clear').onclick=()=>{if(el('search').value){el('search').value='';cards();el('search').focus();}else if(filters.length||filterMode!=='date'){filters=[];filterMode='date';cards();}else el('change').click();};
    el('change').onclick=()=>{el('zone').value='';cards();el('status').textContent='Tocá la zona donde estás.';el('zones').querySelector('button')?.focus({preventScroll:true});};
    const back=document.createElement('button');back.type='button';back.className='walk-return';back.textContent='Volver a Recorrer';back.hidden=true;back.onclick=()=>{back.hidden=true;showModule('walk');};document.getElementById('panel-products').prepend(back);
    document.addEventListener('mercado-map-change',()=>{if(!document.getElementById('panel-walk').hidden)void openWalk();});
})();
