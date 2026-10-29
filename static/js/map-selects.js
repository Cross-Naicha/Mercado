// Desplegables del área de asignación con el mismo estilo del selector de sucursal.
(function(){
    const root=document.querySelector('.map-product-assignment'),bindings=new WeakMap();
    const menu=document.createElement('div');menu.id='map_assignment_select_menu';menu.className='map-branch-menu';menu.setAttribute('popover','auto');menu.setAttribute('role','listbox');document.body.append(menu);
    let current=null,frame;
    function update(select){
        let button=bindings.get(select);
        if(!button){button=document.createElement('button');button.type='button';button.className='map-styled-picker';button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',menu.id);select.hidden=true;select.tabIndex=-1;select.after(button);bindings.set(select,button);
            let closeOnClick=false;
            button.addEventListener('pointerdown',()=>{closeOnClick=menu.matches(':popover-open')&&current?.select===select;},{capture:true});
            button.addEventListener('pointercancel',()=>{closeOnClick=false;});
            button.onclick=event=>{const close=event.detail!==0&&closeOnClick;closeOnClick=false;if(close){if(menu.matches(':popover-open'))menu.hidePopover();button.setAttribute('aria-expanded','false');return;}open(select,button);};
            button.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open(select,button);}};
            select.addEventListener('change',()=>update(select));
        }
        const text=select.selectedOptions[0]?.textContent||'Elegí una opción';button.textContent=text;button.title=text;button.disabled=select.disabled;button.setAttribute('aria-label',(select.getAttribute('aria-label')||select.parentElement.firstChild?.textContent?.trim()||'Seleccionar')+': '+text);
        button.style.borderLeft=select.style.borderLeft;
    }
    function positionMenu(){
        if(!current?.button.isConnected)return;
        const rect=current.button.getBoundingClientRect(),below=innerHeight-rect.bottom-14,above=rect.top-14;menu.style.width=rect.width+'px';menu.style.left=Math.max(6,Math.min(rect.left,innerWidth-rect.width-6))+'px';menu.style.maxHeight=Math.max(80,Math.min(320,Math.max(below,above)))+'px';
        if(below>=Math.min(180,above)){menu.style.top=rect.bottom+6+'px';menu.style.bottom='auto';}else{menu.style.top='auto';menu.style.bottom=innerHeight-rect.top+6+'px';}
    }
    function open(select,button){
        if(menu.matches(':popover-open')){current?.button.setAttribute('aria-expanded','false');menu.hidePopover();if(current?.select===select){current=null;return;}}
        current={select,button};menu.replaceChildren();menu.setAttribute('aria-label',select.getAttribute('aria-label')||'Seleccionar opción');
        for(const option of select.options){const item=document.createElement('button');item.type='button';item.textContent=option.textContent;item.disabled=option.disabled;item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.selected));item.onclick=()=>{select.value=option.value;menu.hidePopover();select.dispatchEvent(new Event('change',{bubbles:true}));if(button.isConnected){update(select);button.focus();}};menu.append(item);}
        positionMenu();
        menu.showPopover();button.setAttribute('aria-expanded','true');menu.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});
    }
    menu.addEventListener('toggle',()=>{if(!menu.matches(':popover-open'))current?.button.setAttribute('aria-expanded','false');});
    menu.onkeydown=event=>{const items=[...menu.querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(i+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}};
    function refresh(){frame=null;root.querySelectorAll('select:not(#map_branch)').forEach(update);if(current&&!current.select.isConnected)menu.hidePopover();}
    function schedule(){if(!frame)frame=requestAnimationFrame(refresh);}
    new MutationObserver(changes=>{if(changes.some(c=>c.target.nodeName==='SELECT'||c.target.closest?.('select')||[...c.addedNodes].some(n=>n.nodeType===1&&(n.matches('select')||n.querySelector('select')))))schedule();}).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
    document.addEventListener('mercado-map-change',schedule);window.addEventListener('resize',()=>{if(menu.matches(':popover-open'))menu.hidePopover();});root.addEventListener('scroll',()=>{if(menu.matches(':popover-open'))positionMenu();},{passive:true});refresh();
})();
