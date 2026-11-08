// Paneles conservados en el DOM: cambiar de módulo no borra formularios ni datos.
// Evitar el zoom por gestos en iOS y por doble toque al ajustar existencias.
for(const eventName of ['gesturestart','gesturechange']) document.addEventListener(eventName,event=>event.preventDefault(),{passive:false});
document.addEventListener('dblclick',event=>{if(event.target.closest('.stock-quick-counter'))event.preventDefault();},{passive:false});
(function () {
    const nav=document.getElementById('navbar');
    const sync=document.querySelector('section[aria-label="Guardado y sincronización"]');
    const header=document.createElement('header');header.className='app-status';
    header.hidden=true;
    const syncButton=document.createElement('button');syncButton.type='button';syncButton.id='sync_menu_button';syncButton.textContent='Sincronización';
    syncButton.onclick=()=>openPendingRecords();header.append(syncButton);
    nav.after(header);
    const settingsTitle=document.createElement('h1');settingsTitle.textContent='Ajustes y respaldos';sync.prepend(settingsTitle);
    const listHeading=[...document.querySelectorAll('h2')].find(h => h.textContent==='Lista del súper');
    const storesHeading=[...document.querySelectorAll('h2')].find(h => h.textContent==='Supermercados y locales');
    listHeading.id='list_section';storesHeading.id='stores_section';
    const definitions=[
        ['products','Productos',document.getElementById('search_section')],
        ['compare','Comparar',document.getElementById('compare_section')],
        ['purchase','Agregar',document.getElementById('instances_section')],
        ['cart','Carrito',document.getElementById('cart_section')],
        ['stock','Stock',document.getElementById('stock_section')],
        ['list','Lista del súper',listHeading],
        ['scan','Códigos y fotos',document.getElementById('assistant_section')],
        ['stores','Supermercados',storesHeading],
        ['maps','Mapa',document.getElementById('map_section')],
        ['walk','Recorrer',document.getElementById('walk_section')],
        ['new','Nuevo producto',document.getElementById('register_section')]
    ];
    const nodes=[...document.body.childNodes];
    const panels=new Map();
    const main=document.createElement('main');main.id='modules';
    for(let i=0;i<definitions.length;i++) {
        const [id,label,start]=definitions[i],end=definitions[i+1]?.[2];
        const panel=document.createElement('section');panel.id='panel-'+id;panel.className='module-panel';panel.setAttribute('role','region');panel.setAttribute('aria-label',label);
        const from=nodes.indexOf(start),to=end ? nodes.indexOf(end) : nodes.findIndex((node,index) => index>from && node.nodeName==='SCRIPT');
        for(const node of nodes.slice(from,to<0 ? nodes.length : to)) {
            if(node===sync || node===nav || node===header) continue;
            panel.append(node);
        }
        panels.set(id,panel);main.append(panel);
    }
    const newProductButton=document.createElement('button');
    newProductButton.type='button';newProductButton.id='new_product_floating';newProductButton.textContent='N';
    newProductButton.setAttribute('aria-label','Nuevo producto');newProductButton.title='Nuevo producto';
    newProductButton.onclick=()=>showModule('new');panels.get('products').append(newProductButton);
    const scrollTopButton=document.createElement('button');
    scrollTopButton.type='button';scrollTopButton.id='products_scroll_top';scrollTopButton.textContent='∧';
    scrollTopButton.setAttribute('aria-label','Volver al inicio');scrollTopButton.title='Volver al inicio';
    scrollTopButton.onclick=()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    panels.get('products').append(scrollTopButton);
    const floatingMenu=document.createElement('div');floatingMenu.id='products_floating_menu';
    const floatingActions=document.createElement('div');floatingActions.id='products_floating_actions';floatingActions.inert=true;
    const floatingToggle=document.createElement('button');floatingToggle.type='button';floatingToggle.id='products_floating_toggle';floatingToggle.textContent='+';
    floatingToggle.setAttribute('aria-label','Mostrar acciones');floatingToggle.setAttribute('aria-expanded','false');floatingToggle.setAttribute('aria-controls',floatingActions.id);
    function closeFloatingMenu() {floatingMenu.classList.remove('is-open');floatingToggle.setAttribute('aria-expanded','false');floatingToggle.setAttribute('aria-label','Mostrar acciones');floatingActions.inert=true;}
    floatingToggle.onclick=()=>{
        const open=!floatingMenu.classList.contains('is-open');
        floatingMenu.classList.toggle('is-open',open);floatingToggle.setAttribute('aria-expanded',String(open));floatingToggle.setAttribute('aria-label',open ? 'Ocultar acciones' : 'Mostrar acciones');floatingActions.inert=!open;
    };
    const pricesToggle=document.createElement('button');pricesToggle.type='button';pricesToggle.id='prices_mode_toggle';pricesToggle.textContent='$';pricesToggle.title='Activar modo Precios';pricesToggle.setAttribute('aria-label','Modo Precios');pricesToggle.setAttribute('aria-pressed','false');pricesToggle.onclick=()=>setPricesMode(!pricesMode);
    const historyToggle=document.createElement('button');historyToggle.type='button';historyToggle.id='history_mode_toggle';historyToggle.textContent='↗';historyToggle.title='Modo Histórico';historyToggle.setAttribute('aria-label','Modo Histórico');historyToggle.setAttribute('aria-pressed','false');historyToggle.onclick=()=>setHistoryMode(!historyMode);
    const organizeToggle=document.createElement('button');organizeToggle.type='button';organizeToggle.id='walk_organize_toggle';organizeToggle.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 19V5m-4 4 4-4 4 4M16 5v14m-4-4 4 4 4-4"/></svg>';organizeToggle.title='Modo Organizar';organizeToggle.setAttribute('aria-label','Modo Organizar');organizeToggle.setAttribute('aria-pressed','false');organizeToggle.hidden=true;organizeToggle.onclick=()=>window.setWalkOrganize?.();
    floatingActions.append(organizeToggle,historyToggle,pricesToggle,newProductButton);floatingMenu.append(floatingActions,scrollTopButton,floatingToggle);panels.get('products').append(floatingMenu);
    const mapBack=document.createElement('button');mapBack.id='walk_back_map';mapBack.type='button';mapBack.textContent='<';mapBack.title='Volver al mapa';mapBack.setAttribute('aria-label','Volver al mapa');mapBack.hidden=true;floatingMenu.append(mapBack);mapBack.addEventListener('click',closeFloatingMenu);
    floatingActions.addEventListener('click',event=>{if(event.target.closest('button')) closeFloatingMenu();});
    document.addEventListener('click',event=>{if(!floatingMenu.contains(event.target)) closeFloatingMenu();});
    floatingMenu.addEventListener('keydown',event=>{if(event.key==='Escape') {closeFloatingMenu();floatingToggle.focus();}});

    const settings=document.createElement('section');settings.id='panel-settings';settings.className='module-panel';settings.setAttribute('role','region');settings.setAttribute('aria-label','Ajustes');settings.append(sync);panels.set('settings',settings);main.append(settings);
    header.after(main);
    const clearCompareButton=document.createElement('button');
    clearCompareButton.type='button';clearCompareButton.id='compare_clear_floating';clearCompareButton.textContent='C';clearCompareButton.hidden=true;
    clearCompareButton.setAttribute('aria-label','Borrar todos los campos de comparación');clearCompareButton.title='Borrar comparación';
    clearCompareButton.onclick=()=>clearComparison();
    const compareCardControls=document.createElement('div');compareCardControls.className='compare-card-controls';
    compareCardControls.append(clearCompareButton);document.getElementById('compare_product_b').append(compareCardControls);
    const returnProductsButton=document.createElement('button');
    returnProductsButton.type='button';returnProductsButton.id='return_products_floating';returnProductsButton.textContent='<';
    returnProductsButton.setAttribute('aria-label','Volver a Productos');returnProductsButton.title='Volver a Productos';
    let catalogModule='products';
    returnProductsButton.onclick=()=>{if(window.productActionReturn)void window.productActionReturn();else showModule(catalogModule);};document.body.append(returnProductsButton);
    const stockMenu=document.createElement('div');stockMenu.id='stock_floating_menu';
    const stockActions=document.createElement('div');stockActions.id='stock_floating_actions';stockActions.inert=true;
    const stockToggle=document.createElement('button');stockToggle.id='stock_floating_toggle';stockToggle.type='button';stockToggle.textContent='+';stockToggle.setAttribute('aria-label','Mostrar acciones de stock');stockToggle.setAttribute('aria-expanded','false');stockToggle.setAttribute('aria-controls',stockActions.id);
    const addHere=document.createElement('button');addHere.type='button';addHere.id='stock_add_here';addHere.textContent='N';addHere.title='Agregar producto aquí';addHere.setAttribute('aria-label','Agregar producto aquí');addHere.onclick=()=>startStockProductCreation();
    const stockScrollTop=document.createElement('button');stockScrollTop.type='button';stockScrollTop.id='stock_scroll_top';stockScrollTop.textContent='∧';
    stockScrollTop.setAttribute('aria-label','Volver al inicio');stockScrollTop.title='Volver al inicio';stockScrollTop.onclick=scrollTopButton.onclick;
    stockActions.append(addHere);stockMenu.append(stockActions,stockScrollTop,stockToggle);panels.get('stock').append(stockMenu);
    function closeStockMenu() {stockMenu.classList.remove('is-open');stockActions.inert=true;stockToggle.setAttribute('aria-expanded','false');stockToggle.setAttribute('aria-label','Mostrar acciones de stock');}
    stockToggle.onclick=()=>{
        const open=!stockMenu.classList.contains('is-open');stockMenu.classList.toggle('is-open',open);stockActions.inert=!open;stockToggle.setAttribute('aria-expanded',String(open));stockToggle.setAttribute('aria-label',open ? 'Ocultar acciones de stock' : 'Mostrar acciones de stock');
    };
    stockActions.addEventListener('click',event=>{if(event.target.closest('button'))closeStockMenu();});
    document.addEventListener('click',event=>{if(!stockMenu.contains(event.target))closeStockMenu();});
    stockMenu.addEventListener('keydown',event=>{if(event.key==='Escape') {closeStockMenu();stockToggle.focus();}});
    header.after(document.getElementById('save_status'));
    const menuKey='mercado-visible-sections-v1';
    let visibleSections=definitions.map(([id])=>id);
    try {const saved=JSON.parse(localStorage.getItem(menuKey));if(Array.isArray(saved))visibleSections=saved.filter(id=>definitions.some(([known])=>known===id));} catch (_) {}
    if(!localStorage.getItem('mercado-map-menu-added')) {if(!visibleSections.includes('maps'))visibleSections.push('maps');try {localStorage.setItem(menuKey,JSON.stringify(visibleSections));localStorage.setItem('mercado-map-menu-added','1');} catch (_) {}}
    if(!localStorage.getItem('mercado-walk-menu-added')) {if(!visibleSections.includes('walk'))visibleSections.push('walk');try {localStorage.setItem(menuKey,JSON.stringify(visibleSections));localStorage.setItem('mercado-walk-menu-added','1');} catch (_) {}}
    nav.replaceChildren();nav.setAttribute('role','navigation');nav.setAttribute('aria-label','Secciones de Mercado');
    const sectionToggle=document.createElement('button');sectionToggle.type='button';sectionToggle.id='section_menu_toggle';
    sectionToggle.setAttribute('aria-haspopup','menu');sectionToggle.setAttribute('aria-expanded','false');sectionToggle.setAttribute('aria-controls','section_menu');sectionToggle.title='Cambiar de sección';
    const sectionLabel=document.createElement('span');sectionLabel.id='current_section_label';
    const chevron=document.createElement('span');chevron.className='section-menu-chevron';chevron.textContent='⌄';chevron.setAttribute('aria-hidden','true');sectionToggle.append(sectionLabel,chevron);
    const tabStrip=document.createElement('div');tabStrip.id='section_menu';tabStrip.className='nav-sections';tabStrip.hidden=true;tabStrip.setAttribute('role','menu');tabStrip.setAttribute('aria-label','Secciones');nav.append(sectionToggle,tabStrip);
    function menuButtons() {return [...tabStrip.querySelectorAll('[role="menuitem"]')].filter(button=>!button.hidden);}
    function fitSectionMenu() {
        if(tabStrip.hidden)return;
        tabStrip.style.setProperty('--section-menu-height',Math.max(80,window.innerHeight-tabStrip.getBoundingClientRect().top-12)+'px');
    }
    function closeSectionMenu(restoreFocus=false) {
        tabStrip.hidden=true;sectionToggle.setAttribute('aria-expanded','false');
        if(restoreFocus)sectionToggle.focus({preventScroll:true});
    }
    function focusMenuButton(button) {
        button?.focus({preventScroll:true});button?.scrollIntoView({block:'nearest',behavior:'instant'});
    }
    function openSectionMenu(position='current') {
        tabStrip.hidden=false;sectionToggle.setAttribute('aria-expanded','true');fitSectionMenu();
        const buttons=menuButtons();
        focusMenuButton(position==='last' ? buttons.at(-1) : position==='first' ? buttons[0] : buttons.find(button=>button.getAttribute('aria-current')==='page') || buttons[0]);
    }
    sectionToggle.onclick=()=>{if(tabStrip.hidden)openSectionMenu();else closeSectionMenu();};
    sectionToggle.addEventListener('keydown',event=>{
        if(!['ArrowDown','ArrowUp'].includes(event.key))return;
        event.preventDefault();openSectionMenu(event.key==='ArrowUp'?'last':'first');
    });
    tabStrip.addEventListener('keydown',event=>{
        const buttons=menuButtons(),index=buttons.indexOf(document.activeElement);
        let next;
        if(event.key==='ArrowDown')next=(index+1)%buttons.length;
        if(event.key==='ArrowUp')next=(index-1+buttons.length)%buttons.length;
        if(event.key==='Home')next=0;if(event.key==='End')next=buttons.length-1;
        if(event.key==='Escape'){event.preventDefault();closeSectionMenu(true);}
        else if(event.key==='Tab'){closeSectionMenu(true);}
        else if(next!==undefined){event.preventDefault();focusMenuButton(buttons[next]);}
    });
    document.addEventListener('click',event=>{if(!tabStrip.contains(event.target)&&!sectionToggle.contains(event.target))closeSectionMenu();});
    nav.addEventListener('focusout',event=>{if(event.relatedTarget && !tabStrip.contains(event.relatedTarget) && event.relatedTarget!==sectionToggle)closeSectionMenu();});
    window.addEventListener('resize',fitSectionMenu);
    for(const [id,label] of [...definitions.map(([id,label]) => [id,label]),['settings','Ajustes']]) {
        const button=document.createElement('button');button.id='tab-'+id;button.type='button';button.textContent=label;button.setAttribute('aria-label',label);button.setAttribute('aria-controls','panel-'+id);
        button.onclick=() => {window.productActionReturn=null;showModule(id,{focus:id!=='settings'});};
        if(id==='settings') {
            button.textContent='';button.title='Ajustes';button.setAttribute('aria-label','Ajustes');
            button.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 3-.6 2.1-1.8 1-2.2-.5-2.4 4.2L4.1 11v2l-1.6 1.2 2.4 4.2 2.2-.5 1.8 1 .6 2.1h5l.6-2.1 1.8-1 2.2.5 2.4-4.2-1.6-1.2v-2l1.6-1.2-2.4-4.2-2.2.5-1.8-1-.6-2.1z"/><circle cx="12" cy="12" r="3.2"/></svg>';
            nav.append(button);
        } else {button.hidden=!visibleSections.includes(id);button.setAttribute('role','menuitem');button.tabIndex=-1;tabStrip.append(button);}
    }
    const settingsItem=document.createElement('button');settingsItem.type='button';settingsItem.id='section_settings';settingsItem.textContent='Ajustes';settingsItem.setAttribute('aria-label','Ajustes');settingsItem.setAttribute('role','menuitem');settingsItem.setAttribute('aria-controls','panel-settings');settingsItem.tabIndex=-1;
    settingsItem.onclick=()=>{window.productActionReturn=null;showModule('settings',{focus:true});};tabStrip.append(settingsItem);
    const menuPreferences=document.createElement('fieldset');menuPreferences.className='menu-preferences';
    const menuLegend=document.createElement('legend');menuLegend.textContent='Secciones del menú';
    const menuHelp=document.createElement('p');menuHelp.textContent='Elegí los accesos que querés ver. Los cambios se guardan en este dispositivo.';
    const menuChoices=document.createElement('div');menuChoices.className='menu-preferences-choices';
    for(const [id,label] of definitions) {
        const row=document.createElement('label'),check=document.createElement('input'),caption=document.createElement('span');
        check.type='checkbox';check.checked=visibleSections.includes(id);check.dataset.menuSection=id;caption.textContent=label;
        check.onchange=()=>{
            visibleSections=[...menuChoices.querySelectorAll('input:checked')].map(input=>input.dataset.menuSection);
            try {localStorage.setItem(menuKey,JSON.stringify(visibleSections));notice('Configuración guardada en este dispositivo.', {success:true});} catch (_) {notice('Configuración aplicada. El navegador no permitió guardarla.');}
            for(const [section] of definitions) document.getElementById('tab-'+section).hidden=section!==currentModule && !visibleSections.includes(section);
            document.getElementById('tab-settings').tabIndex=0;
        };
        row.append(check,caption);menuChoices.append(row);
    }
    menuPreferences.append(menuLegend,menuHelp,menuChoices);sync.append(menuPreferences);
    for(const panel of panels.values()) {const title=panel.querySelector('h1,h2');if(title) {title.classList.add('module-title');title.hidden=true;}}
    const sectionModules={search_section:'products',compare_section:'compare',instances_section:'purchase',cart_section:'cart',stock_section:'stock',list_section:'list',assistant_section:'scan',stores_section:'stores',register_section:'new',location_form:'stores'};
    let currentModule=null;
    function updateSectionLabel() {
        const systematic=currentModule==='stock' && !document.getElementById('stock_review').hidden;
        sectionToggle.classList.toggle('stock-systematic',systematic);
        sectionLabel.textContent=systematic ? 'Stock: Sistemático' : definitions.find(([key])=>key===currentModule)?.[1] || 'Ajustes';
    }
    document.addEventListener('mercado-stock-view-change',()=>{if(currentModule==='stock')updateSectionLabel();});
    window.showModule=function(id,{scroll=true,focus=false}={}) {
        if(!panels.has(id)) return;
        if(currentModule!==id&&['products','walk'].includes(currentModule)){window.resetCatalogModes?.();document.dispatchEvent(new CustomEvent('mercado-module-leave',{detail:{id:currentModule}}));}
        if(id==='stock' && currentModule!==id)window.enterStockGeneral?.();
        currentModule=id;
        closeSectionMenu();
        updateSectionLabel();
        organizeToggle.hidden=id!=='walk';mapBack.hidden=id!=='walk'||!document.getElementById('walk_zone').value;floatingMenu.classList.toggle('has-map-back',!mapBack.hidden);
        document.body.classList.toggle('map-full-width',id==='maps');
        closeFloatingMenu();closeStockMenu();
        if(id==='products'||id==='walk') {catalogModule=id;panels.get(id).append(floatingMenu);}
        returnProductsButton.setAttribute('aria-label',catalogModule==='walk'?'Volver a Recorrer':'Volver a Productos');returnProductsButton.title=returnProductsButton.getAttribute('aria-label');
        returnProductsButton.hidden=id==='products'||id==='walk';
        if(id==='walk' && typeof openWalk==='function') void openWalk();
        if(id==='maps' && typeof openMapEditor==='function') void openMapEditor();
        if(id==='compare') compareCardControls.append(returnProductsButton);
        else if(id==='stock') stockActions.append(returnProductsButton);
        else if(id==='cart') document.getElementById('cart_footer_summary').prepend(returnProductsButton);
        else document.body.append(returnProductsButton);
        if(id!=='scan' && typeof stopScanner==='function') stopScanner();
        for(const [key,panel] of panels) {
            panel.hidden=key!==id;
            const button=document.getElementById('tab-'+key);
            button.hidden=key!=='settings' && key!==id && !visibleSections.includes(key);
            if(key===id)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
            button.tabIndex=key==='settings' ? 0 : -1;
        }
        if(id==='settings')settingsItem.setAttribute('aria-current','page');else settingsItem.removeAttribute('aria-current');
        if(focus)sectionToggle.focus({preventScroll:true});
        if(scroll) window.scrollTo({top:0,behavior:'instant'});
    };
    window.openPendingRecords=function({errorsOnly=false}={}) {
        showModule('settings',{scroll:false});
        const pending=document.getElementById('pending_details');
        pending.open=true;
        const error=errorsOnly ? pending.querySelector('.pending-card[data-has-error="true"]') : null;
        (error || pending).scrollIntoView({block:error?'center':'start',behavior:'instant'});
    };
    window.openModuleSection=function(section) {showModule(sectionModules[section] || 'products');};
    // El acceso que antes recorría toda la página abre ahora el módulo de códigos.
    const shortcut=panels.get('products').querySelector('button[onclick*="assistant_section"]');
    if(shortcut) shortcut.onclick=() => showModule('scan');
    showModule('products',{scroll:false});
})();
