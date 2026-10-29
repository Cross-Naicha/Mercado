// La resolución describe el mismo piso: cada celda se subdivide sin ampliar el mapa.
(function () {
    const el=id=>document.getElementById('map_'+id),canvas=el('canvas'),ctx=canvas.getContext('2d');
    const palette=['#0f7a66','#449b52','#216348','#79b86b','#368b80','#a0c785'];
    let selecting=false,readOnly=false,activeShelf=null,drawingZoom='1',assignmentZone=null;
    let mode='draw',selection=null,selectionStart=null;
    let map=null,branch='',visited=new Set(),history=[],drawing=false,last=null,changed=false,cursor={x:0,y:0};
    const key=id=>'mercado-branch-map-v1:'+id;
    const blank=()=>({version:2,rows:16,cols:16,precision:1,nextZone:1,nextLetters:{},assignments:{},shelves:[],cells:Array(256).fill(0)});
    function validate(value) {
        if(value?.version===1 && [16,32,64,128].includes(value.size)) value={...value,version:2,rows:value.size,cols:value.size,precision:value.size/16};
        if(!value || value.version!==2 || !Number.isInteger(value.rows) || !Number.isInteger(value.cols) || value.rows<1 || value.cols<1 || value.rows>128 || value.cols>128 || ![1,2,4,8].includes(value.precision) || !Array.isArray(value.cells) || value.cells.length!==value.rows*value.cols || value.cells.some(v=>v!==0&&v!==1)) throw Error('El archivo no contiene un mapa válido');
        const shelves=value.shelves??[];
        if(!Array.isArray(shelves)||shelves.length>16384||shelves.some(g=>!g||typeof g.id!=='string'||typeof g.name!=='string'||!g.name.trim()||g.name.length>60||(g.orientation!==undefined&&!['horizontal','vertical'].includes(g.orientation))||(g.color!==undefined&&!palette.includes(g.color))||!Array.isArray(g.cells)||g.cells.some(i=>!Number.isInteger(i)||i<0||i>=value.cells.length||value.cells[i]!==1)))throw Error('Los nombres de góndola no son válidos');
        if(new Set(shelves.map(g=>g.id)).size!==shelves.length||new Set(shelves.flatMap(g=>g.cells)).size!==shelves.reduce((n,g)=>n+g.cells.length,0))throw Error('Hay góndolas superpuestas');
        const assignments=value.assignments??{};
        if(typeof assignments!=='object'||assignments===null||Array.isArray(assignments)||Object.entries(assignments).some(([id,zone])=>!id||typeof zone!=='string'))throw Error('Las asignaciones del mapa no son válidas');
        const zoneIds=new Set(shelves.map(g=>g.id));
        const nextLetters=value.nextLetters??{};
        if(!nextLetters||typeof nextLetters!=='object'||Array.isArray(nextLetters)||Object.entries(nextLetters).some(([letter,n])=>! /^[A-ZÑ]$/.test(letter)||!Number.isSafeInteger(n)||n<1))throw Error('Numeración de zonas inválida');
        return {nextLetters:{...nextLetters},assignments:Object.fromEntries(Object.entries(assignments).filter(([,zone])=>zoneIds.has(zone))),nextZone:Math.max(Number.isSafeInteger(value.nextZone)&&value.nextZone>0?value.nextZone:1,...shelves.map(g=>{const match=/^Zona (\d+)$/.exec(g.name);return match?Number(match[1])+1:1;})),shelves:shelves.map((g,i)=>({id:g.id,name:g.name,orientation:g.orientation||'horizontal',color:g.color||palette[i%palette.length],cells:[...g.cells]})),version:2,rows:value.rows,cols:value.cols,precision:value.precision,cells:[...value.cells]};
    }
    function status(message) {el('status').textContent=message;}
    function save() {
        const ids=new Set(map.shelves.map(g=>g.id));map.assignments=Object.fromEntries(Object.entries(map.assignments||{}).filter(([,zone])=>ids.has(zone)));
        try {localStorage.setItem(key(branch),JSON.stringify(map));status('Mapa guardado en este dispositivo.');document.dispatchEvent(new Event('mercado-map-saved'));return true;}
        catch (_) {status('No se pudo guardar. Exportá el mapa antes de salir.');return false;}
    }
    function remember() {history.push(JSON.stringify(map));if(history.length>25)history.shift();}
    function render() {
        const enabled=!!map;
        for(const id of ['undo','refine','zoom','export','import','expand','side','count','position','mode'])el(id).disabled=!enabled;
        el('clear_zones').disabled=!enabled||!map.shelves.length;
        el('undo').disabled=!enabled||!history.length;el('refine').disabled=!enabled||(map.rows*2>128||map.cols*2>128||map.precision>=8);
        el('viewport').hidden=!enabled;el('naming').hidden=!enabled||mode!=='name';
        el('name_save').disabled=!enabled||!selectedCells().length;
        el('selection_count').textContent=selectedCells().length+' celdas seleccionadas';
        renderShelfList();
        updateSeriesPreview();
        document.dispatchEvent(new Event("mercado-map-change"));
        if(!enabled){el('resolution').textContent='Elegí una sucursal para empezar.';return;}
        const phone=window.matchMedia('(pointer: coarse) and (max-width: 1100px)').matches;
        let scale=1;
        if(readOnly){
            const available=Math.max(40,el('surface').clientWidth-2),height=Math.max(100,window.innerHeight-240);
            scale=Math.min(1,available/(32/map.precision*map.cols),height/(32/map.precision*map.rows));
        }else if(phone){
            const available=Math.max(80,el('viewport').parentElement.clientWidth-42);
            const landscape=window.innerWidth>window.innerHeight;
            scale=Math.min(1,available/(32/map.precision*map.cols),landscape?Math.max(100,window.innerHeight-140)/(32/map.precision*map.rows):1);
        }
        const cell=32/map.precision*Number(el('zoom').value)*scale,width=cell*map.cols,height=cell*map.rows,dpr=window.devicePixelRatio||1;
        canvas.parentElement.style.setProperty('--map-preview-width',width+'px');
        canvas.style.width=width+'px';canvas.style.height=height+'px';canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
        ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
        ctx.fillStyle='#0f7a66';map.cells.forEach((value,i)=>{if(value)ctx.fillRect((i%map.cols)*cell,Math.floor(i/map.cols)*cell,cell,cell);});
        for(const g of map.shelves){ctx.fillStyle=g.color;for(const i of g.cells)ctx.fillRect((i%map.cols)*cell,Math.floor(i/map.cols)*cell,cell,cell);}
        ctx.strokeStyle='#dce5dd';ctx.lineWidth=.6;ctx.beginPath();for(let i=0;i<=map.cols;i++){ctx.moveTo(i*cell,0);ctx.lineTo(i*cell,height);}for(let i=0;i<=map.rows;i++){ctx.moveTo(0,i*cell);ctx.lineTo(width,i*cell);}ctx.stroke();
        if(readOnly&&assignmentZone){const zone=map.shelves.find(g=>g.id===assignmentZone);if(zone){ctx.strokeStyle='#c7782e';ctx.lineWidth=2;for(const i of zone.cells)ctx.strokeRect((i%map.cols)*cell+1,Math.floor(i/map.cols)*cell+1,Math.max(0,cell-2),Math.max(0,cell-2));}}
        for(const shelf of map.shelves){
            if(!shelf.cells.length)continue;
            const xs=shelf.cells.map(i=>i%map.cols),ys=shelf.cells.map(i=>Math.floor(i/map.cols));
            const x=(Math.min(...xs)+Math.max(...xs)+1)*cell/2,y=(Math.min(...ys)+Math.max(...ys)+1)*cell/2;
            ctx.save();ctx.translate(x,y);if(shelf.orientation==='vertical')ctx.rotate(-Math.PI/2);
            ctx.font='bold '+(phone?Math.max(9,13*scale):13)+'px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
            const lines=shelf.name.split(/[&\n]/).map(line=>line.trim()).filter(Boolean),lineHeight=phone?Math.max(11,17*scale):17,w=Math.max(...lines.map(line=>ctx.measureText(line).width))+12,h=lines.length*lineHeight+6;
            ctx.fillStyle='rgba(255,255,255,.92)';ctx.fillRect(-w/2,-h/2,w,h);ctx.fillStyle='#09584a';
            lines.forEach((line,i)=>ctx.fillText(line,0,(i-(lines.length-1)/2)*lineHeight));ctx.restore();
        }
        for(const i of selectedCells()){const x=i%map.cols,y=Math.floor(i/map.cols);ctx.fillStyle='rgba(199,120,46,.4)';ctx.fillRect(x*cell,y*cell,cell,cell);ctx.strokeStyle='#c7782e';ctx.lineWidth=2;ctx.strokeRect(x*cell+1,y*cell+1,cell-2,cell-2);}
        if(!readOnly&&document.activeElement===canvas){ctx.strokeStyle='#c7782e';ctx.lineWidth=2;ctx.strokeRect(cursor.x*cell+1,cursor.y*cell+1,cell-2,cell-2);}
        el('resolution').textContent=map.rows+' filas × '+map.cols+' columnas · '+map.precision+'× de precisión por lado';
        updateInsertion();
        for(const [id,total] of [['columns',map.cols],['rows',map.rows]]) {
            const ruler=el(id);ruler.replaceChildren();
            ruler.style[id==='columns'?'gridTemplateColumns':'gridTemplateRows']=`repeat(${total}, ${cell}px)`;
            for(let i=1;i<=total;i++){const label=document.createElement('span');label.textContent=i;ruler.append(label);}
        }
        el('coordinate').textContent='Fila '+(cursor.y+1)+' · Columna '+(cursor.x+1);
        canvas.setAttribute('aria-label',readOnly?'Mapa de consulta de las zonas, no editable.':'Mapa editable. Fila '+(cursor.y+1)+', columna '+(cursor.x+1)+'. Usá las flechas para moverte y espacio para pintar.');
    }
    window.openMapEditor=async function () {
        try {
            if(typeof db==='undefined'||!db){status('Los datos se están abriendo. Volvé a entrar en Mapa en unos segundos.');return;}
            const state=await shoppingState(),select=el('branch');
            select.replaceChildren(new Option('Elegí una sucursal',''));
            for(const b of state.branches)select.add(new Option(b.name+(b.address?' · '+b.address:''),b.id));
            select.value=branch;
            if(window.mercadoActiveBranch!==undefined&&window.mercadoActiveBranch!==branch){select.value=window.mercadoActiveBranch;select.onchange();}
            if(branch&&!state.branches.some(b=>b.id===branch)){branch='';map=null;history=[];}
            if(branch){const saved=localStorage.getItem(key(branch));if(saved)window.mercadoMapProducts.receive(branch,JSON.parse(saved));}
            document.dispatchEvent(new Event('mercado-map-open'));
            render();
        }catch(error){status('No se pudieron leer las sucursales: '+error.message);}
    };
    el('branch').onchange=()=>{
        finish();branch=el('branch').value;history=[];selection=null;cursor={x:0,y:0};map=null;
        if(branch){try {const saved=localStorage.getItem(key(branch));map=saved?validate(JSON.parse(saved)):blank();status(saved?'Mapa recuperado de este dispositivo.':'Nuevo mapa de 16 × 16.');}catch(_){status('No se pudo abrir el mapa guardado. Conservamos sus datos; podés importar un respaldo.');}}
        render();document.dispatchEvent(new Event('mercado-map-open'));
        if(window.mercadoActiveBranch!==branch)void choosePurchaseBranch(branch);
    };
    document.addEventListener('mercado-active-branch-change',()=>{if(window.mercadoActiveBranch!==branch)void openMapEditor();});
    el('clear_zones').onclick=()=>{
        if(!map||!map.shelves.length)return;
        finish();remember();const before=history[history.length-1];
        map.shelves=[];map.assignments={};selection=null;el('name').value='';
        if(!save()){map=JSON.parse(before);history.pop();render();return;}
        render();status('Se quitaron todas las zonas. El dibujo se conservó. Podés usar Deshacer.');
    };
    el('undo').onclick=()=>{if(history.length){map=JSON.parse(history.pop());selection=null;cursor.x=Math.min(cursor.x,map.cols-1);cursor.y=Math.min(cursor.y,map.rows-1);save();render();}};
    el('refine').onclick=()=>{
        if(!map||map.rows*2>128||map.cols*2>128||map.precision>=8)return;remember();const old=map,cols=old.cols*2,rows=old.rows*2;
        selection=null;map={version:2,rows,cols,nextZone:old.nextZone,nextLetters:old.nextLetters,assignments:old.assignments,shelves:old.shelves.map(g=>({...g,cells:g.cells.flatMap(i=>{const x=(i%old.cols)*2,y=Math.floor(i/old.cols)*2;return [y*cols+x,y*cols+x+1,(y+1)*cols+x,(y+1)*cols+x+1];})})),precision:old.precision*2,cells:Array.from({length:rows*cols},(_,i)=>old.cells[Math.floor(Math.floor(i/cols)/2)*old.cols+Math.floor((i%cols)/2)])};cursor.x*=2;cursor.y*=2;save();render();
    };
    function updateInsertion() {
        const side=el('side').value,insert=side==='row'||side==='column';
        el('position_label').hidden=!insert;
        if(map)el('position').max=(side==='row'?map.rows:map.cols)+1;
    }
    el('side').onchange=updateInsertion;
    el('expand').onclick=()=>{
        if(!map)return;
        const count=Number(el('count').value),side=el('side').value,vertical=side==='top'||side==='bottom'||side==='row';
        if(!Number.isInteger(count)||count<1||count>128){status('Ingresá una cantidad entera entre 1 y 128.');return;}
        const rows=map.rows+(vertical?count:0),cols=map.cols+(vertical?0:count);
        if(rows>128||cols>128){status('El mapa admite hasta 128 filas y 128 columnas.');return;}
        const insert=side==='row'||side==='column',position=Number(el('position').value),limit=vertical?map.rows:map.cols;
        if(insert&&(!Number.isInteger(position)||position<1||position>limit+1)){status('Elegí una posición entre 1 y '+(limit+1)+'.');return;}
        const at=insert?position-1:(side==='top'||side==='left'?0:limit);
        remember();const cells=Array(rows*cols).fill(0);
        for(let y=0;y<map.rows;y++)for(let x=0;x<map.cols;x++){
            const nx=x+(!vertical&&x>=at?count:0),ny=y+(vertical&&y>=at?count:0);
            cells[ny*cols+nx]=map.cells[y*map.cols+x];
        }
        if(vertical&&cursor.y>=at)cursor.y+=count;
        if(!vertical&&cursor.x>=at)cursor.x+=count;
        const shelves=map.shelves.map(g=>({...g,cells:g.cells.map(i=>{const x=i%map.cols,y=Math.floor(i/map.cols);return (y+(vertical&&y>=at?count:0))*cols+x+(!vertical&&x>=at?count:0);})}));
        selection=null;map={...map,rows,cols,cells,shelves};save();render();
    };
    el('zoom').onchange=()=>{el('phone_zoom').value=el('zoom').value;render();};
    el('phone_zoom').onchange=()=>{el('zoom').value=el('phone_zoom').value;render();};
    let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(map&&!document.getElementById('panel-maps').hidden)render();},100);});
    function paint(x,y){const i=y*map.cols+x;if(selecting){if(map.cells[i]&&!visited.has(i)){visited.add(i);if(selection.has(i))selection.delete(i);else selection.add(i);}return;}if(!visited.has(i)){visited.add(i);map.cells[i]=1-map.cells[i];if(!map.cells[i])map.shelves=map.shelves.map(g=>({...g,cells:g.cells.filter(c=>c!==i)})).filter(g=>g.cells.length);changed=true;}}
    function point(event){const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(map.cols-1,Math.floor((event.clientX-r.left)/r.width*map.cols))),y:Math.max(0,Math.min(map.rows-1,Math.floor((event.clientY-r.top)/r.height*map.rows)))};}
    function stroke(p){if(last){let x=last.x,y=last.y,dx=Math.abs(p.x-x),dy=-Math.abs(p.y-y),sx=x<p.x?1:-1,sy=y<p.y?1:-1,err=dx+dy;while(true){paint(x,y);if(x===p.x&&y===p.y)break;const e=2*err;if(e>=dy){err+=dy;x+=sx;}if(e<=dx){err+=dx;y+=sy;}}}else paint(p.x,p.y);last=p;cursor=p;render();}
    function finish(){if(selecting){selecting=false;last=null;render();return;}if(selectionStart){selectionStart=null;render();return;}if(!drawing)return;drawing=false;last=null;if(changed)save();else history.pop();changed=false;render();}
    canvas.onpointerdown=event=>{if(readOnly||!map||event.button!==0||drawing)return;event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);if(mode==='name'){if(el('selection_tool').value==='cells'){if(!(selection instanceof Set))selection=new Set();visited.clear();selecting=true;last=null;stroke(point(event));return;}selectionStart=point(event);selection={x:selectionStart.x,y:selectionStart.y,w:1,h:1};render();return;}remember();visited.clear();drawing=true;changed=false;stroke(point(event));};
    canvas.onpointermove=event=>{if(selecting){stroke(point(event));return;}if(selectionStart){const p=point(event);selection={x:Math.min(p.x,selectionStart.x),y:Math.min(p.y,selectionStart.y),w:Math.abs(p.x-selectionStart.x)+1,h:Math.abs(p.y-selectionStart.y)+1};cursor=p;render();return;}if(drawing)stroke(point(event));};
    canvas.onpointerup=finish;canvas.onpointercancel=finish;canvas.onlostpointercapture=finish;
    canvas.onfocus=render;canvas.onblur=render;
    canvas.onkeydown=event=>{if(readOnly||!map)return;const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(moves[event.key]){event.preventDefault();cursor.x=Math.max(0,Math.min(map.cols-1,cursor.x+moves[event.key][0]));cursor.y=Math.max(0,Math.min(map.rows-1,cursor.y+moves[event.key][1]));render();}else if(event.key===' '||event.key==='Enter'){event.preventDefault();if(mode==='name'){if(el('selection_tool').value==='cells'){if(!(selection instanceof Set))selection=new Set();selecting=true;visited.clear();paint(cursor.x,cursor.y);selecting=false;}else selection={x:cursor.x,y:cursor.y,w:1,h:1};render();return;}remember();visited.clear();paint(cursor.x,cursor.y);save();render();}};
    function selectedCells(){
        if(!map||!selection)return [];
        if(selection instanceof Set)return [...selection].filter(i=>map.cells[i]);
        const cells=[];for(let y=selection.y;y<selection.y+selection.h;y++)for(let x=selection.x;x<selection.x+selection.w;x++){const i=y*map.cols+x;if(map.cells[i])cells.push(i);}return cells;
    }
    function colorOptions(select,current){
        select.replaceChildren();palette.forEach((color,i)=>select.add(new Option('Verde '+(i+1),color)));select.value=current;select.style.borderLeft='12px solid '+current;
        select.onchange=()=>{select.style.borderLeft='12px solid '+select.value;};
    }
    function nextColor(){return palette.find(c=>!map?.shelves.some(g=>g.color===c))||palette[(map?.shelves.length||0)%palette.length];}
    colorOptions(el('color'),palette[0]);
    el('selection_tool').onchange=()=>{finish();selection=null;render();};
    el('mode').onchange=()=>{finish();mode=el('mode').value;selection=null;if(mode==='name')colorOptions(el('color'),nextColor());render();};
    el('name_cancel').onclick=()=>{selection=null;el('name').value='';render();};
    el('name_save').onclick=()=>{
        if(!map||!selection)return;let name=el('name').value.trim();
        if(name.length>60){status('El nombre admite hasta 60 caracteres.');return;}
        const cells=selectedCells();
        if(!cells.length){status('Seleccioná celdas de góndola para formar la región.');return;}
        const existing=map.shelves.find(g=>nameKey(g.name)===nameKey(name));
        const selected=new Set(cells);
        if(map.shelves.some(g=>g!==existing&&g.cells.some(i=>selected.has(i)))){status('La selección incluye celdas de otra zona. Quitalas de la selección para extender esta zona.');return;}
        remember();
        if(existing)existing.cells=[...new Set([...existing.cells,...cells])];
        else {name=el('auto_series').checked&&!name.split(/[&\n]/).some(p=>p.trim())?seriesName(true):zoneName(name);map.shelves.push({id:crypto.randomUUID(),name,orientation:el('orientation').value,color:el('color').value,cells});}
        selection=null;el('name').value='';if(!el('keep_orientation').checked)el('orientation').value='horizontal';saveLabelPreferences();colorOptions(el('color'),nextColor());save();render();

    };
    const preferencesKey='mercado-map-label-preferences-v1';
    for(const letter of 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ')el('series_letter').add(new Option(letter,letter));
    try{const prefs=JSON.parse(localStorage.getItem(preferencesKey)||'{}');el('auto_series').checked=!!prefs.autoSeries;el('keep_orientation').checked=!!prefs.keepOrientation;if(/^[A-ZÑ]$/.test(prefs.letter))el('series_letter').value=prefs.letter;if(prefs.keepOrientation&&['horizontal','vertical'].includes(prefs.orientation))el('orientation').value=prefs.orientation;}catch(_){}
    function saveLabelPreferences(){try{localStorage.setItem(preferencesKey,JSON.stringify({autoSeries:el('auto_series').checked,letter:el('series_letter').value,keepOrientation:el('keep_orientation').checked,orientation:el('orientation').value}));}catch(_){} }
    function seriesName(advance=false){
        const letter=el('series_letter').value;let number=map?.nextLetters?.[letter]||1;
        const used=new Set((map?.shelves||[]).map(g=>nameKey(g.name)));
        while(used.has(nameKey(letter+number)))number++;
        if(advance){map.nextLetters??={};map.nextLetters[letter]=number+1;}
        return letter+number;
    }
    function updateSeriesPreview(){el('series_reset').disabled=!map||!el('auto_series').checked;el('series_reset').textContent='Reiniciar numeración '+el('series_letter').value;el('series_letter').disabled=!el('auto_series').checked;el('series_preview').textContent=el('auto_series').checked?'Siguiente: '+seriesName():'';}
    el('series_reset').onclick=()=>{
        if(!map||!el('auto_series').checked)return;
        remember();const before=history[history.length-1],letter=el('series_letter').value;
        map.nextLetters??={};map.nextLetters[letter]=1;
        if(!save()){map=JSON.parse(before);history.pop();render();return;}
        render();status('Numeración '+letter+' reiniciada. Siguiente: '+seriesName()+'. Se omiten los nombres que ya existen. Podés usar Deshacer.');
    };
    for(const id of ['auto_series','series_letter','keep_orientation','orientation'])el(id).addEventListener('change',()=>{saveLabelPreferences();updateSeriesPreview();});
    function nameKey(name){return name.normalize('NFC').split(/[&\n]/).map(part=>part.trim().replace(/\s+/g,' ')).filter(Boolean).join(' & ').toLocaleLowerCase('es');}
    function zoneName(name){
        if(name.split(/[&\n]/).some(part=>part.trim()))return name;
        let number=map.nextZone||1;
        while(map.shelves.some(g=>g.name==='Zona '+number))number++;
        map.nextZone=number+1;return 'Zona '+number;
    }
    function renderShelfList(){
        const list=el('shelves');list.replaceChildren();
        if(!map)return;
        if(!map.shelves.some(g=>g.id===activeShelf))activeShelf=null;
        if(!map.shelves.length){const empty=document.createElement('p');empty.textContent='Todavía no hay zonas nombradas.';list.append(empty);return;}
        const grid=document.createElement('div');grid.className='map-zone-grid';grid.setAttribute('aria-label','Seleccionar zona');
        for(const g of map.shelves){
            const button=document.createElement('button');button.type='button';button.className='map-zone-button';button.textContent=g.name.replace(/[&\n]+/g,' · ');button.title=g.name;button.style.setProperty('--zone-color',g.color);button.setAttribute('aria-pressed',String(g.id===activeShelf));button.setAttribute('aria-controls','map_zone_editor');
            button.onclick=()=>{activeShelf=activeShelf===g.id?null:g.id;renderShelfList();};grid.append(button);
        }
        list.append(grid);
        const observer=new ResizeObserver(()=>{
            if(!grid.isConnected){observer.disconnect();return;}
            const width=grid.clientWidth;if(!width)return;
            const max=Math.max(1,Math.min(8,Math.floor((width+8)/118))),rows=Math.ceil(map.shelves.length/max),columns=Math.ceil(map.shelves.length/rows);
            grid.style.gridTemplateColumns=`repeat(${columns}, minmax(0,1fr))`;
            const missing=rows*columns-map.shelves.length;
            const old=grid.querySelectorAll('.map-zone-slot');if(old.length!==missing){old.forEach(n=>n.remove());for(let i=0;i<missing;i++){const slot=document.createElement('span');slot.className='map-zone-slot';slot.setAttribute('aria-hidden','true');grid.append(slot);}}
        });observer.observe(grid);
        // Stop observing detached grids even when their hidden card is not resized.
        if(renderShelfList.observer)renderShelfList.observer.disconnect();renderShelfList.observer=observer;
        const editor=document.createElement('div');editor.id='map_zone_editor';editor.className='map-zone-editor';editor.hidden=!activeShelf;list.append(editor);
        const g=map.shelves.find(g=>g.id===activeShelf);if(!g)return;
        const heading=document.createElement('h3');heading.textContent='Editar '+g.name.replace(/[&\n]+/g,' · ');editor.append(heading);
        const row=document.createElement('div');row.className='map-tools';
        const input=document.createElement('textarea');input.rows=2;input.value=g.name;input.maxLength=60;input.setAttribute('aria-label','Nombre de góndola '+g.name);
        const color=document.createElement('select');color.setAttribute('aria-label','Color de góndola '+g.name);colorOptions(color,g.color);color.onchange=()=>{remember();g.color=color.value;save();render();};
        const orientation=document.createElement('select');orientation.setAttribute('aria-label','Orientación de etiqueta '+g.name);orientation.add(new Option('Horizontal','horizontal'));orientation.add(new Option('Vertical','vertical'));orientation.value=g.orientation||'horizontal';
        const rename=document.createElement('button');rename.type='button';rename.textContent='Guardar etiqueta';rename.onclick=()=>{const name=input.value.trim();if(name.length>60){status('El nombre admite hasta 60 caracteres.');return;}remember();const existing=map.shelves.find(other=>other!==g&&nameKey(other.name)===nameKey(name));if(existing){existing.cells=[...new Set([...existing.cells,...g.cells])];map.assignments=Object.fromEntries(Object.entries(map.assignments||{}).map(([id,zone])=>[id,zone===g.id?existing.id:zone]));map.shelves=map.shelves.filter(other=>other!==g);activeShelf=existing.id;}else {g.name=zoneName(name);g.orientation=orientation.value;}save();render();};
        const remove=document.createElement('button');remove.type='button';remove.textContent='Quitar nombre';remove.onclick=()=>{remember();map.shelves=map.shelves.filter(s=>s.id!==g.id);activeShelf=null;save();render();};
        row.append(input,color,orientation,rename,remove);editor.append(row);
    }
    el('export').onclick=()=>{if(!map)return;const url=URL.createObjectURL(new Blob([JSON.stringify(map)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='mercado-mapa-'+branch+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    el('import').onchange=async event=>{const file=event.target.files[0],target=branch;if(!file||!map)return;try{if(file.size>2000000)throw Error('El archivo es demasiado grande');const imported=validate(JSON.parse(await file.text()));if(branch!==target)return;remember();map=imported;selection=null;cursor={x:0,y:0};save();render();}catch(error){status(error.message);}finally{event.target.value='';}};
    window.mercadoMapProducts={
        zoneAt:(clientX,clientY)=>{if(!map||!readOnly)return null;const r=canvas.getBoundingClientRect();if(clientX<r.left||clientX>=r.right||clientY<r.top||clientY>=r.bottom)return null;const x=Math.floor((clientX-r.left)/r.width*map.cols),y=Math.floor((clientY-r.top)/r.height*map.rows);return map.shelves.find(g=>g.cells.includes(y*map.cols+x))?.id||null;},
        highlightZone:id=>{assignmentZone=id;render();},
        setReadOnly:value=>{finish();const next=!!value;if(next&&!readOnly){drawingZoom=el('zoom').value;el('zoom').value='1';}else if(!next&&readOnly)el('zoom').value=drawingZoom;readOnly=next;el('phone_zoom').value=el('zoom').value;canvas.tabIndex=readOnly?-1:0;canvas.classList.toggle('map-readonly',readOnly);el('viewport').classList.toggle('map-preview',readOnly);render();},
        canReceive:()=>!drawing&&!selecting&&!selectionStart&&!selection&&!document.activeElement?.matches('#map_shelves textarea,#map_name'),
        storageKey:key,
        validate,
        receive:(id,value)=>{
            if(branch!==id)return;
            if(drawing||selecting||selectionStart||selection||document.activeElement?.matches('#map_shelves textarea,#map_name'))return;
            map=validate(value);history=[];cursor={x:Math.min(cursor.x,map.cols-1),y:Math.min(cursor.y,map.rows-1)};render();
        },
        context:()=>({branch,ready:!!map,zones:map?map.shelves.map(g=>({id:g.id,name:g.name,color:g.color})):[],assignments:{...(map?.assignments||{})}}),
        assign:async(expectedBranch,productIds,zone)=>{
            if(!map||branch!==expectedBranch||!productIds.length||zone&&!map.shelves.some(g=>g.id===zone))return false;
            if(zone){try{await window.MercadoAvailability.set(expectedBranch,productIds,'available');}catch(error){status('No se pudo guardar la disponibilidad: '+error.message);return false;}}
            if(!map||branch!==expectedBranch)return false;
            remember();const before=history[history.length-1];
            for(const id of productIds){if(zone)map.assignments[id]=zone;else delete map.assignments[id];}
            if(!save()){map=JSON.parse(before);history.pop();return false;}
            render();return true;
        }
    };
    render();
})();
