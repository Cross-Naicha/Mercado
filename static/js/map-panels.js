// Agrupa los controles existentes sin reconstruirlos ni perder su estado.
(function(){
    const el=id=>document.getElementById('map_'+id);
    function card(nodes,title,open=false){
        nodes=nodes.filter(Boolean);if(!nodes.length)return;
        const details=document.createElement('details');details.className='map-option-card';details.open=open;
        const summary=document.createElement('summary');summary.textContent=title;
        const content=document.createElement('div');content.className='map-option-content';
        nodes[0].before(details);details.append(summary,content);content.append(...nodes);return details;
    }
    function range(first,last){const nodes=[];for(let node=first;node;node=node.nextSibling){nodes.push(node);if(node===last)break;}return nodes;}
    const viewCard=card([el('branch').parentElement,el('view_draw').parentElement],'Sucursal y vista',true);
    const viewContent=viewCard.querySelector('.map-option-content');viewContent.classList.add('map-view-row');
    const branchField=el('branch').parentElement;branchField.classList.add('map-branch-field');
    for(const node of [...branchField.childNodes])if(node.nodeType===Node.TEXT_NODE)node.remove();
    el('view_draw').parentElement.classList.add('map-view-buttons');
    const select=el('branch'),branchButton=document.createElement('button'),menu=document.createElement('div');
    select.hidden=true;select.tabIndex=-1;
    branchButton.type='button';branchButton.className='map-branch-button';branchButton.id='map_branch_button';branchButton.setAttribute('aria-haspopup','listbox');branchButton.setAttribute('aria-expanded','false');branchButton.setAttribute('aria-controls','map_branch_menu');
    menu.id='map_branch_menu';menu.className='map-branch-menu';menu.setAttribute('popover','auto');menu.setAttribute('role','listbox');menu.setAttribute('aria-label','Elegir supermercado');
    select.after(branchButton);document.body.append(menu);
    function updateBranchMenu(){
        branchButton.textContent=select.selectedOptions[0]?.textContent||'Elegí una sucursal';branchButton.title=branchButton.textContent;branchButton.setAttribute('aria-label','Sucursal: '+branchButton.textContent);
        menu.replaceChildren();
        for(const option of select.options){const item=document.createElement('button');item.type='button';item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.selected));item.textContent=option.textContent;
            item.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));menu.hidePopover();updateBranchMenu();branchButton.focus();};menu.append(item);}
    }
    function positionMenu(){const r=branchButton.getBoundingClientRect();menu.style.left=r.left+'px';menu.style.top=Math.min(r.bottom+6,window.innerHeight-100)+'px';menu.style.width=r.width+'px';menu.style.maxHeight=Math.max(90,window.innerHeight-r.bottom-18)+'px';}
    let closeBranchOnClick=false;
    branchButton.addEventListener('pointerdown',()=>{closeBranchOnClick=menu.matches(':popover-open');},{capture:true});
    branchButton.addEventListener('pointercancel',()=>{closeBranchOnClick=false;});
    branchButton.onclick=event=>{const close=event.detail!==0&&closeBranchOnClick;closeBranchOnClick=false;if(close){if(menu.matches(':popover-open'))menu.hidePopover();branchButton.setAttribute('aria-expanded','false');return;}updateBranchMenu();if(menu.matches(':popover-open'))menu.hidePopover();else {positionMenu();menu.showPopover();menu.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});}};
    branchButton.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();branchButton.click();}};
    menu.onkeydown=event=>{const items=[...menu.querySelectorAll('button')],index=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}};
    menu.addEventListener('toggle',()=>{branchButton.setAttribute('aria-expanded',String(menu.matches(':popover-open')));});
    new MutationObserver(updateBranchMenu).observe(select,{childList:true,subtree:true,attributes:true});select.addEventListener('change',updateBranchMenu);updateBranchMenu();
    window.addEventListener('resize',()=>{if(menu.matches(':popover-open'))positionMenu();});window.addEventListener('scroll',()=>{if(menu.matches(':popover-open'))menu.hidePopover();},{passive:true});
    const controls=document.createElement('div');controls.hidden=true;controls.id='map_internal_controls';
    const drawingTools=el('mode').closest('.map-tools'),precisionTools=el('refine').closest('.map-tools');
    el('drawing_view').append(controls);
    const phoneLabel=el('phone_zoom').parentElement;
    controls.append(el('mode'),el('zoom'),el('phone_zoom'),el('undo'));
    phoneLabel.remove();drawingTools.remove();precisionTools.before(el('refine'));precisionTools.remove();el('help').remove();
    const expand=document.querySelector('.map-expand');expand.classList.add('map-option-card');
    const expansionBody=document.createElement('div');expansionBody.className='map-option-content';
    expansionBody.append(...[...expand.childNodes].filter(n=>n.nodeName!=='SUMMARY'));expand.append(expansionBody);
    const precisionActions=document.createElement('div');precisionActions.className='map-tools';precisionActions.append(el('refine'));expansionBody.append(precisionActions);
    card([...el('naming').childNodes],'Crear y nombrar zonas',true);
    card(range(el('coordinate').nextElementSibling,el('shelves')),'Zonas y etiquetas existentes');
    const assignment=document.querySelector('.map-product-assignment');
    card(range(assignment.firstElementChild,el('product_help')),'Buscar y filtrar productos',true);
    el('product_search').parentElement.id='map_product_search_field';
    el('product_category').closest('.map-tools').id='map_product_filter_grid';
    card([el('status')],'Guardado local',true);
    card([el('export').closest('.map-tools'),el('export').closest('.map-tools').nextElementSibling],'Importar y exportar mapas');
})();
