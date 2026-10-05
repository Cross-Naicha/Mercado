// Paneles conservados en el DOM: cambiar de módulo no borra formularios ni datos.
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
    returnProductsButton.onclick=()=>showModule('products');document.body.append(returnProductsButton);
    const notice=document.getElementById('save_status');notice.className='app-notice';notice.hidden=true;header.after(notice);
    nav.replaceChildren();nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Módulos de Mercado');
    for(const [id,label] of [...definitions.map(([id,label]) => [id,label]),['settings','Ajustes']]) {
        const button=document.createElement('button');button.id='tab-'+id;button.type='button';button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls','panel-'+id);
        button.onclick=() => showModule(id);nav.append(button);
    }
    for(const panel of panels.values()) {const title=panel.querySelector('h1,h2');if(title) title.classList.add('module-title');}
    const sectionModules={search_section:'products',compare_section:'compare',instances_section:'purchase',cart_section:'cart',stock_section:'stock',list_section:'list',assistant_section:'scan',stores_section:'stores',register_section:'new',location_form:'stores'};
    window.showModule=function(id,{scroll=true,focus=false}={}) {
        if(!panels.has(id)) return;
        returnProductsButton.hidden=id==='products';
        if(id==='compare') compareCardControls.append(returnProductsButton);
        else document.body.append(returnProductsButton);
        if(id!=='scan' && typeof stopScanner==='function') stopScanner();
        for(const [key,panel] of panels) {
            panel.hidden=key!==id;
            const button=document.getElementById('tab-'+key);button.setAttribute('aria-selected',String(key===id));button.tabIndex=key===id ? 0 : -1;
        }
        const selected=document.getElementById('tab-'+id);
        nav.scrollTo({left:selected.offsetLeft-nav.clientWidth/2+selected.clientWidth/2,behavior:'smooth'});
        if(focus) selected.focus();
        if(scroll) window.scrollTo({top:0,behavior:'instant'});
    };
    window.openModuleSection=function(section) {showModule(sectionModules[section] || 'products');};
    nav.addEventListener('keydown',event => {
        const buttons=[...nav.querySelectorAll('[role="tab"]')],current=buttons.indexOf(event.target);
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
