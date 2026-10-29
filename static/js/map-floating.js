// Un acceso de edición que vive dentro del plano, con posición propia del dispositivo.
(function(){
    const canvas=document.getElementById('map_canvas'),card=canvas.closest('#map_surface'),mode=document.getElementById('map_mode');
    const button=document.createElement('button');button.type='button';button.id='map_floating_mode';button.hidden=true;card.append(button);
    const zoom=document.getElementById('map_zoom'),zoomControls=document.createElement('div');zoomControls.id='map_corner_zoom';zoomControls.setAttribute('role','group');zoomControls.setAttribute('aria-label','Zoom del mapa');
    const zoomIn=document.createElement('button'),zoomOut=document.createElement('button');
    for(const [control,label,symbol] of [[zoomIn,'Acercar mapa','+'],[zoomOut,'Alejar mapa','−']]){control.type='button';control.setAttribute('aria-label',label);control.title=label;control.textContent=symbol;zoomControls.append(control);}const undo=document.getElementById('map_undo');undo.textContent='↶';undo.title='Deshacer';undo.setAttribute('aria-label','Deshacer');zoomControls.append(undo);card.append(zoomControls);
    function changeZoom(step){const options=[...zoom.options].map(o=>o.value),index=options.indexOf(zoom.value),next=Math.max(0,Math.min(options.length-1,index+step));zoom.value=options[next];zoom.dispatchEvent(new Event('change',{bubbles:true}));}
    zoomIn.onclick=()=>changeZoom(1);zoomOut.onclick=()=>changeZoom(-1);
    function bounds(){const padding=14,size=Math.max(0,Math.min(58,card.clientWidth-padding*2,card.clientHeight-padding*2));return {padding,size,x:Math.max(0,card.clientWidth-size-padding*2),y:Math.max(0,card.clientHeight-size-padding*2)};}
    let position={x:.08,y:.08},drag=null,suppressClick=false;
    try{const saved=JSON.parse(localStorage.getItem('mercado-map-floating-position'));if(Number.isFinite(saved?.x)&&Number.isFinite(saved?.y))position={x:Math.max(0,Math.min(1,saved.x)),y:Math.max(0,Math.min(1,saved.y))};}catch(_){}
    const icons={draw:'<path d="m5 16-1 4 4-1L20 7l-3-3Z"/><path d="m14 7 3 3"/>',name:'<path d="M3 4h8l10 10-7 7L3 10Z"/><circle cx="7.5" cy="8" r="1"/>'};
    function fitViewport(){
        const viewport=document.getElementById('map_viewport');if(document.getElementById('map_zones_view')&&!document.getElementById('map_zones_view').hidden){viewport.style.removeProperty('--map-preview-height');return;}if(!canvas.classList.contains('map-readonly'))return;
        const top=viewport.getBoundingClientRect().top,screen=window.visualViewport;
        const bottom=screen?screen.offsetTop+screen.height:window.innerHeight;
        const workspace=document.body.classList.contains('map-assignment-workspace'),preview=canvas.closest('.map-product-preview');
        const limit=workspace&&preview?Math.min(bottom,preview.getBoundingClientRect().bottom):bottom;
        const available=Math.max(60,Math.floor(limit-Math.max(0,top)-16));
        viewport.style.setProperty('--map-preview-height',available+'px');
    }
    let layoutFrame;function scheduleLayout(){if(layoutFrame)return;layoutFrame=requestAnimationFrame(()=>{layoutFrame=null;fitViewport();});}
    window.addEventListener('scroll',scheduleLayout,{passive:true});window.addEventListener('resize',scheduleLayout);
    window.visualViewport?.addEventListener('resize',scheduleLayout);window.visualViewport?.addEventListener('scroll',scheduleLayout);
    function place(){
        fitViewport();
        const b=bounds();button.style.width=b.size+'px';button.style.height=b.size+'px';
        button.style.left=(b.padding+position.x*b.x)+'px';button.style.top=(b.padding+position.y*b.y)+'px';
    }
    function refresh(){
        const preview=canvas.classList.contains('map-readonly');
        const zoneView=document.getElementById('map_zones_view');const zoomHost=preview&&zoneView?.hidden?document.getElementById('map_preview_header'):card;if(zoomControls.parentElement!==zoomHost)zoomHost.append(zoomControls);card.classList.toggle('map-surface-preview',preview);zoomControls.classList.toggle('map-zoom-horizontal',preview);
        const ready=window.mercadoMapProducts.context().ready;zoomControls.hidden=!ready;const values=[...zoom.options].map(o=>o.value);zoomIn.disabled=zoom.value===values.at(-1);zoomOut.disabled=zoom.value===values[0];button.hidden=!ready||canvas.classList.contains('map-readonly');undo.hidden=canvas.classList.contains('map-readonly');
        const naming=mode.value==='name',label=naming?'Nombrar góndolas':'Dibujar';
        button.dataset.mode=mode.value;button.setAttribute('aria-label','Modo '+label+'. Pulsá para cambiar; arrastrá para mover.');button.title=label+' · Clic para cambiar · Arrastrar para mover';
        button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+icons[naming?'name':'draw']+'</svg>';
        place();
    }
    button.onpointerdown=event=>{
        if(event.button!==0)return;event.preventDefault();event.stopPropagation();
        const r=button.getBoundingClientRect();drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,offsetX:event.clientX-r.left,offsetY:event.clientY-r.top,moved:false};suppressClick=false;button.setPointerCapture(event.pointerId);
    };
    button.onpointermove=event=>{
        if(!drag||drag.id!==event.pointerId)return;
        if(!drag.moved&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<5)return;
        drag.moved=true;button.classList.add('is-dragging');const c=card.getBoundingClientRect(),b=bounds();
        position={x:Math.max(0,Math.min(1,(event.clientX-drag.offsetX-c.left-card.clientLeft-b.padding)/Math.max(1,b.x))),y:Math.max(0,Math.min(1,(event.clientY-drag.offsetY-c.top-card.clientTop-b.padding)/Math.max(1,b.y)))};place();
    };
    function finish(event){if(!drag||event.pointerId!==drag.id)return;suppressClick=drag.moved||event.type==='pointercancel';if(drag.moved){try{localStorage.setItem('mercado-map-floating-position',JSON.stringify(position));}catch(_){}}drag=null;button.classList.remove('is-dragging');}
    button.onpointerup=finish;button.onpointercancel=finish;button.onlostpointercapture=finish;
    button.onclick=event=>{event.stopPropagation();if(suppressClick){suppressClick=false;return;}mode.value=mode.value==='name'?'draw':'name';mode.dispatchEvent(new Event('change',{bubbles:true}));};
    const viewport=document.getElementById('map_viewport');let pan=null;
    viewport.addEventListener('pointerdown',event=>{
        if(!canvas.classList.contains('map-readonly')||event.button!==0)return;
        if(event.target!==canvas)return;
        event.preventDefault();pan={id:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,moved:false};viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener('pointermove',event=>{if(!pan||event.pointerId!==pan.id)return;if(!pan.moved&&Math.hypot(event.clientX-pan.x,event.clientY-pan.y)<5)return;pan.moved=true;viewport.classList.add('is-panning');event.preventDefault();viewport.scrollLeft=pan.left+pan.x-event.clientX;viewport.scrollTop=pan.top+pan.y-event.clientY;});
    function endPan(event){if(pan&&event.pointerId===pan.id){if(!pan.moved&&event.type==='pointerup'){const zone=window.mercadoMapProducts.zoneAt(event.clientX,event.clientY);if(zone){document.dispatchEvent(new CustomEvent('mercado-map-zone-picked',{detail:zone}));}}pan=null;viewport.classList.remove('is-panning');}}
    viewport.addEventListener('pointerup',endPan);viewport.addEventListener('pointercancel',endPan);viewport.addEventListener('lostpointercapture',endPan);
    mode.addEventListener('change',refresh);document.addEventListener('mercado-map-change',refresh);
    new ResizeObserver(place).observe(card);refresh();
})();
