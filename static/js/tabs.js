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
    syncButton.onclick=()=>{showModule('settings');document.getElementById('pending_details').open=true;};header.append(syncButton);
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
        ['stock','Mi stock',document.getElementById('stock_section')],
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
        const panel=document.createElement('section');panel.id='panel-'+id;panel.className='module-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','tab-'+id);
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
    floatingActions.append(scrollTopButton,historyToggle,pricesToggle,newProductButton);floatingMenu.append(floatingActions,floatingToggle);panels.get('products').append(floatingMenu);
    floatingActions.addEventListener('click',event=>{if(event.target.closest('button')) closeFloatingMenu();});
    document.addEventListener('click',event=>{if(!floatingMenu.contains(event.target)) closeFloatingMenu();});
    floatingMenu.addEventListener('keydown',event=>{if(event.key==='Escape') {closeFloatingMenu();floatingToggle.focus();}});

    const settings=document.createElement('section');settings.id='panel-settings';settings.className='module-panel';settings.setAttribute('role','tabpanel');settings.setAttribute('aria-labelledby','tab-settings');settings.append(sync);panels.set('settings',settings);main.append(settings);
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
    returnProductsButton.onclick=()=>showModule(catalogModule);document.body.append(returnProductsButton);
    const stockMenu=document.createElement('div');stockMenu.id='stock_floating_menu';
    const stockActions=document.createElement('div');stockActions.id='stock_floating_actions';stockActions.inert=true;
    const stockToggle=document.createElement('button');stockToggle.id='stock_floating_toggle';stockToggle.type='button';stockToggle.textContent='+';stockToggle.setAttribute('aria-label','Mostrar acciones de stock');stockToggle.setAttribute('aria-expanded','false');stockToggle.setAttribute('aria-controls',stockActions.id);
    const reviewButton=document.getElementById('stock_review_button');reviewButton.textContent='✓';reviewButton.title='Revisar stock';reviewButton.setAttribute('aria-label','Revisar stock');
    const addHere=document.createElement('button');addHere.type='button';addHere.id='stock_add_here';addHere.textContent='N';addHere.title='Agregar producto aquí';addHere.setAttribute('aria-label','Agregar producto aquí');addHere.onclick=()=>startStockProductCreation();
    stockActions.append(addHere,reviewButton);stockMenu.append(stockActions,stockToggle);panels.get('stock').append(stockMenu);
    function closeStockMenu() {stockMenu.classList.remove('is-open');stockActions.inert=true;stockToggle.setAttribute('aria-expanded','false');stockToggle.setAttribute('aria-label','Mostrar acciones de stock');}
    stockToggle.onclick=()=>{
        const open=!stockMenu.classList.contains('is-open');stockMenu.classList.toggle('is-open',open);stockActions.inert=!open;stockToggle.setAttribute('aria-expanded',String(open));stockToggle.setAttribute('aria-label',open ? 'Ocultar acciones de stock' : 'Mostrar acciones de stock');
    };
    stockActions.addEventListener('click',event=>{if(event.target.closest('button'))closeStockMenu();});
    document.addEventListener('click',event=>{if(!stockMenu.contains(event.target))closeStockMenu();});
    stockMenu.addEventListener('keydown',event=>{if(event.key==='Escape') {closeStockMenu();stockToggle.focus();}});
    const notice=document.getElementById('save_status');notice.className='app-notice';notice.hidden=true;header.after(notice);
    const menuKey='mercado-visible-sections-v1';
    let visibleSections=definitions.map(([id])=>id);
    try {const saved=JSON.parse(localStorage.getItem(menuKey));if(Array.isArray(saved))visibleSections=saved.filter(id=>definitions.some(([known])=>known===id));} catch (_) {}
    if(!localStorage.getItem('mercado-map-menu-added')) {if(!visibleSections.includes('maps'))visibleSections.push('maps');try {localStorage.setItem(menuKey,JSON.stringify(visibleSections));localStorage.setItem('mercado-map-menu-added','1');} catch (_) {}}
    if(!localStorage.getItem('mercado-walk-menu-added')) {if(!visibleSections.includes('walk'))visibleSections.push('walk');try {localStorage.setItem(menuKey,JSON.stringify(visibleSections));localStorage.setItem('mercado-walk-menu-added','1');} catch (_) {}}
    nav.replaceChildren();nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Módulos de Mercado');
    const tabStrip=document.createElement('div');tabStrip.className='nav-sections';nav.append(tabStrip);
    for(const [id,label] of [...definitions.map(([id,label]) => [id,label]),['settings','Ajustes']]) {
        const button=document.createElement('button');button.id='tab-'+id;button.type='button';button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls','panel-'+id);
        button.onclick=() => showModule(id);
        if(id==='settings') {
            button.textContent='';button.title='Ajustes';button.setAttribute('aria-label','Ajustes');
            button.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 3-.6 2.1-1.8 1-2.2-.5-2.4 4.2L4.1 11v2l-1.6 1.2 2.4 4.2 2.2-.5 1.8 1 .6 2.1h5l.6-2.1 1.8-1 2.2.5 2.4-4.2-1.6-1.2v-2l1.6-1.2-2.4-4.2-2.2.5-1.8-1-.6-2.1z"/><circle cx="12" cy="12" r="3.2"/></svg>';
            nav.append(button);
        } else {button.hidden=!visibleSections.includes(id);tabStrip.append(button);}
    }
    const menuPreferences=document.createElement('fieldset');menuPreferences.className='menu-preferences';
    const menuLegend=document.createElement('legend');menuLegend.textContent='Secciones del menú';
    const menuHelp=document.createElement('p');menuHelp.textContent='Elegí los accesos que querés ver. Los cambios se guardan en este dispositivo.';
    const menuChoices=document.createElement('div');menuChoices.className='menu-preferences-choices';
    for(const [id,label] of definitions) {
        const row=document.createElement('label'),check=document.createElement('input'),caption=document.createElement('span');
        check.type='checkbox';check.checked=visibleSections.includes(id);check.dataset.menuSection=id;caption.textContent=label;
        check.onchange=()=>{
            visibleSections=[...menuChoices.querySelectorAll('input:checked')].map(input=>input.dataset.menuSection);
            try {localStorage.setItem(menuKey,JSON.stringify(visibleSections));menuHelp.textContent='Configuración guardada en este dispositivo.';} catch (_) {menuHelp.textContent='Configuración aplicada. El navegador no permitió guardarla.';}
            for(const [section] of definitions) document.getElementById('tab-'+section).hidden=!visibleSections.includes(section);
            document.getElementById('tab-settings').tabIndex=0;
        };
        row.append(check,caption);menuChoices.append(row);
    }
    menuPreferences.append(menuLegend,menuHelp,menuChoices);sync.append(menuPreferences);
    for(const panel of panels.values()) {const title=panel.querySelector('h1,h2');if(title) title.classList.add('module-title');}
    const sectionModules={search_section:'products',compare_section:'compare',instances_section:'purchase',cart_section:'cart',stock_section:'stock',list_section:'list',assistant_section:'scan',stores_section:'stores',register_section:'new',location_form:'stores'};
    window.showModule=function(id,{scroll=true,focus=false}={}) {
        if(!panels.has(id)) return;
        document.body.classList.toggle('map-full-width',id==='maps');
        closeFloatingMenu();closeStockMenu();
        if(id==='products'||id==='walk') {catalogModule=id;panels.get(id).append(floatingMenu);}
        returnProductsButton.setAttribute('aria-label',catalogModule==='walk'?'Volver a Recorrer':'Volver a Productos');returnProductsButton.title=returnProductsButton.getAttribute('aria-label');
        returnProductsButton.hidden=id==='products'||id==='walk';
        if(id==='walk' && typeof openWalk==='function') void openWalk();
        if(id==='maps' && typeof openMapEditor==='function') void openMapEditor();
        if(id==='compare') compareCardControls.append(returnProductsButton);
        else if(id==='stock') stockActions.append(returnProductsButton);
        else document.body.append(returnProductsButton);
        if(id!=='scan' && typeof stopScanner==='function') stopScanner();
        for(const [key,panel] of panels) {
            panel.hidden=key!==id;
            const button=document.getElementById('tab-'+key);button.setAttribute('aria-selected',String(key===id));button.tabIndex=key===id ? 0 : -1;
        }
        const selected=document.getElementById('tab-'+id);
        if(!selected.hidden && id!=='settings') tabStrip.scrollTo({left:selected.offsetLeft-tabStrip.offsetLeft-tabStrip.clientWidth/2+selected.clientWidth/2,behavior:'smooth'});
        if(selected.hidden) document.getElementById('tab-settings').tabIndex=0;
        if(focus) (selected.hidden ? document.getElementById('tab-settings') : selected).focus();
        if(scroll) window.scrollTo({top:0,behavior:'instant'});
    };
    window.openModuleSection=function(section) {showModule(sectionModules[section] || 'products');};
    nav.addEventListener('keydown',event => {
        if(!event.target.matches('[role=tab]'))return;
        const buttons=[...nav.querySelectorAll('[role="tab"]')].filter(button=>!button.hidden),current=buttons.indexOf(event.target);
        let next;
        if(event.key==='ArrowRight') next=(current+1)%buttons.length;
        if(event.key==='ArrowLeft') next=(current-1+buttons.length)%buttons.length;
        if(event.key==='Home') next=0;if(event.key==='End') next=buttons.length-1;
        if(next!==undefined) {event.preventDefault();showModule(buttons[next].id.slice(4),{focus:true});}
    });
    // El acceso que antes recorría toda la página abre ahora el módulo de códigos.
    const shortcut=panels.get('products').querySelector('button[onclick*="assistant_section"]');
    if(shortcut) shortcut.onclick=() => showModule('scan');
    showModule('products',{scroll:false});
})();
