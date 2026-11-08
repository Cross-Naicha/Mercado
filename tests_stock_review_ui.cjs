const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

const places=[['Cocina','Alacena superior grande'],['Cocina','Alacena inferior grande'],['Baño','Estantes'],['Heladera','Congelador'],['Fondo','Armario'],['Despensa','Estante'],['','']];
const products=places.map(([location,detail],index)=>({
    id:'234ac292-f29c-4fcf-9e2e-'+String(index+1).padStart(12,'0'),
    product_name:'Producto '+index,product_all:'Producto '+index,product_brand:'Prueba',
    normal_price:'1000.0000',presentation:'0.500000',sale_mode:'package',content_unit:'g',package_content:'500.000000',
    unit_status:'confirmed',stock_pattern:'stable',revision:1,
    storage_location:location || null,storage_detail:detail || null,
    storage_locations:location ? [{location,detail,role:'daily'}] : []
}));
const irregular={...products[0],id:'234ac292-f29c-4fcf-9e2e-000000000099',product_name:'Irregular',product_all:'Irregular',stock_pattern:'irregular'};

async function openPage(browser,width) {
    const page=await browser.newPage({serviceWorkers:'block',viewport:{width,height:850},reducedMotion:'reduce'});
    await page.route('http://127.0.0.1:8765/**',async route=>{
        const url=new URL(route.request().url());
        if(url.pathname==='/api/catalog')return route.fulfill({json:[...products,irregular]});
        if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{detail:'Sin conexión'}});
        const file=path.join(process.cwd(),url.pathname==='/home' ? 'index.html' : url.pathname.slice(1));
        if(fs.existsSync(file))return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});
        return route.fulfill({status:404,body:''});
    });
    await page.goto('http://127.0.0.1:8765/home');
    await page.waitForFunction(()=>db && !syncing);
    await page.evaluate(async rows=>{
        await localTransaction(['catalog'],tx=>{for(const product of rows)tx.objectStore('catalog').put(product);});
        showModule('stock');
    },[...products,irregular]);
    assert.equal(await page.locator('#stock_review').isVisible(),false,'Stock abre en revisión general');
    assert.equal(await page.locator('#stock_general_button').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#stock_review_button').textContent(),'Revisión sistemática');
    assert.equal(await page.locator('#stock_floating_menu #stock_review_button').count(),0);
    if(process.env.STOCK_REVIEW_PREVIEW_DIR)await page.screenshot({path:path.join(process.env.STOCK_REVIEW_PREVIEW_DIR,'stock-general-'+width+'.png')});
    await page.locator('#stock_review_button').click();await page.waitForFunction(()=>!stockReviewBusy && !$('stock_review').hidden);
    assert.equal(await page.locator('#stock_view_switch').isVisible(),true);
    assert.equal(await page.locator('#stock_review_button').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#stock_general_button').getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('#current_section_label').evaluate(node=>node.scrollWidth<=node.clientWidth),true,'El nombre completo de Stock: Sistemático cabe en la barra');
    return page;
}

(async()=>{
    const browser=await chromium.launch({headless:true,channel:'msedge'});
    try {
        for(const width of [320,390,1280]) {
            const page=await openPage(browser,width),errors=[];
            page.on('pageerror',error=>errors.push(error.message));
            const room=name=>page.locator('#stock_review_rooms > button').filter({has:page.locator('.stock-review-room-name',{hasText:new RegExp('^'+name+'$')})});
            const choose=async name=>{await room(name).click();await page.waitForFunction(name=>!stockReviewBusy && stockReviewState?.room===name,name);};
            const menu=async()=>{await page.click('#stock_review_back');await page.waitForFunction(()=>!stockReviewBusy && !$('stock_review_menu').hidden);};
            const count=page.locator('#stock_review_card .stock-quick-counter input');
            const plus=()=>page.locator('#stock_review_card').getByRole('button',{name:'Sumar una unidad',exact:true}).click();

            assert.equal(await page.locator('#stock_review_menu').isVisible(),true);
            assert.equal(await page.locator('#stock_floating_menu').isVisible(),false,'El menú de habitaciones no muestra flotantes');
            assert.equal(await page.locator('#stock_review_menu_help').isVisible(),false);
            assert.equal(await room('Cocina').locator('.stock-review-room-progress').textContent(),'0/2');
            assert.equal(await room('Cocina').locator('.stock-review-room-percentage').textContent(),'0%');
            const alignment=await room('Cocina').evaluate(button=>{
                const [name,count,bar,percentage]=[...button.children].map(n=>n.getBoundingClientRect());
                const bounds=button.getBoundingClientRect(),panel=document.getElementById('panel-stock').getBoundingClientRect();
                return {fullWidth:Math.abs(bounds.width-panel.width)<2,countAtRight:Math.abs(count.right-percentage.right)<1,nameAndCount:Math.abs(name.y+name.height/2-count.y-count.height/2)<1,barBelow:bar.y>name.bottom,percentageAfterBar:percentage.x>bar.right};
            });
            assert.deepEqual(alignment,{fullWidth:true,countAtRight:true,nameAndCount:true,barBelow:true,percentageAfterBar:true});
            const rooms=page.locator('#stock_review_rooms'),title=page.locator('#stock_review_room_title');
            const beforeScroll=await title.boundingBox(),roomBounds=await rooms.boundingBox();
            assert.ok(roomBounds.y+roomBounds.height<=834,'La lista conserva un margen inferior');
            assert.equal(await page.locator('#stock_review_footer').isVisible(),false,'No hay un botón redundante en el menú de habitaciones');
            assert.equal(await page.locator('#stock_review_button').isVisible(),false);
            assert.equal(await title.textContent(),'Habitaciones');
            assert.equal(await page.locator('#current_section_label').textContent(),'Stock: Sistemático');
            assert.equal(await rooms.evaluate(node=>getComputedStyle(node).scrollbarWidth),'none');
            await rooms.hover();await page.mouse.wheel(0,500);
            await page.waitForFunction(()=>document.getElementById('stock_review_rooms').scrollTop>0);
            assert.deepEqual(await title.boundingBox(),beforeScroll,'Desplazar habitaciones no mueve el encabezado');
            assert.equal(await page.evaluate(()=>window.scrollY),0,'Se desplaza la lista, no la página');
            await rooms.evaluate(node=>node.scrollTop=0);
            await page.setViewportSize({width,height:500});
            const shortList=await rooms.boundingBox();assert.ok(shortList.height>0 && shortList.y+shortList.height<=484);
            await page.setViewportSize({width,height:850});
            assert.equal(await page.locator('#stock_review_layout').isVisible(),false);
            assert.equal(await page.locator('#stock_review_save').isVisible(),false);
            assert.equal(await page.locator('#stock_review_back').isVisible(),false);
            assert.equal(await page.locator('#stock_review_rooms > button').count(),6);
            assert.match(await room('Cocina').textContent(),/0\/2/);
            await choose('Cocina');
            assert.equal(await page.locator('#stock_review_room_title').textContent(),'Cocina');
            assert.equal(await page.locator('#stock_review_back').textContent(),'Habitaciones');
            assert.equal(await page.locator('#stock_review_back').isVisible(),true);
            assert.equal(await page.getByRole('heading',{name:'Cocina',exact:true}).count(),1);
            const generalBounds=await page.locator('#stock_general_button').boundingBox(),titleBounds=await page.locator('#stock_review_room_title').boundingBox();
            assert.ok(titleBounds.x>generalBounds.x+generalBounds.width,'El título de la habitación queda a la derecha de Revisión general');
            assert.equal(await page.locator('#stock_floating_menu').isVisible(),true);
            assert.equal(await page.locator('#stock_review_rooms').isVisible(),false);
            assert.equal(await page.locator('#stock_review_layout .kitchen-layout').isVisible(),true);
            assert.equal(await page.locator('#stock_review_progress').isVisible(),false);
            assert.equal(await page.locator('#stock_review_progress').textContent(),'');
            assert.equal(await page.locator('#stock_review_layout .kitchen-legend-item:visible').count(),1);
            assert.equal(await page.locator('#stock_review_layout .kitchen-legend dt:visible').count(),0);
            assert.equal(await page.locator('#stock_review_layout .kitchen-legend-description').textContent(),'Alacena superior grande');
            assert.equal(await page.locator('#stock_review_save').textContent(),'Siguiente');
            const footer=await page.locator('#stock_review_footer').evaluate(root=>{
                const [exit,next]=[...root.children].map(button=>button.getBoundingClientRect());
                return {sameRow:Math.abs(next.y-exit.y)<1,equalWidths:Math.abs(next.width-exit.width)<1};
            });
            assert.deepEqual(footer,{sameRow:true,equalWidths:true},'Siguiente y Habitaciones comparten la fila por mitades');
            await plus();await plus();assert.equal(await count.inputValue(),'2');
            await page.locator('#stock_general_button').click();
            assert.equal(await page.locator('#stock_review').isVisible(),false);
            assert.equal(await page.locator('#stock_general_button').getAttribute('aria-pressed'),'true');
            await page.locator('#stock_review_button').click();await page.waitForFunction(()=>!stockReviewBusy && !$('stock_review').hidden);
            await choose('Cocina');assert.equal(await count.inputValue(),'2','Cambiar de revisión conserva el borrador');
            await page.evaluate(()=>{showModule('products');showModule('stock');});
            assert.equal(await page.locator('#stock_review').isVisible(),false,'Al volver a Stock se muestra revisión general');
            await page.locator('#stock_review_button').click();await page.waitForFunction(()=>!stockReviewBusy && !$('stock_review').hidden);
            await choose('Cocina');assert.equal(await count.inputValue(),'2','Volver a Stock conserva el avance sistemático');
            if(process.env.STOCK_REVIEW_PREVIEW_DIR)await page.screenshot({path:path.join(process.env.STOCK_REVIEW_PREVIEW_DIR,'stock-review-selected-'+width+'.png'),fullPage:true});
            await page.locator('#stock_review_layout').getByRole('button',{name:'Volver a todos los espacios',exact:true}).click();
            assert.equal(await page.locator('#stock_review_layout .kitchen-legend-item:visible').count(),6);
            assert.equal(await page.locator('#stock_review_layout .kitchen-legend dt:visible').count(),6);
            assert.equal(await count.inputValue(),'2','Volver a las referencias conserva el conteo y la posición');
            assert.equal(await page.evaluate(()=>stockReviewState.index),0);
            await page.click('#stock_review_layout .kitchen-layout button[data-sector="A"]');
            await page.waitForFunction(()=>!stockReviewBusy);
            assert.equal(await page.locator('#stock_review_layout .kitchen-legend-item:visible').count(),1);
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Sin desborde con la referencia y el título activos');
            await menu();await choose('Baño');await plus();await menu();await choose('Cocina');
            assert.equal(await count.inputValue(),'2','Conserva el conteo sin guardar al cambiar de habitación');
            await page.click('#stock_review_save');
            await page.waitForFunction(()=>!stockReviewBusy && stockReviewState.index===1);
            assert.equal(await page.evaluate(async()=>{const op=(await localRead('outbox')).find(op=>op.kind==='stock_count');return op?.payload.quantity;}),'1000.000000');
            await plus();await menu();assert.match(await room('Cocina').textContent(),/1\/2/);
            assert.equal(await room('Cocina').locator('.stock-review-room-percentage').textContent(),'50%');
            await choose('Baño');assert.equal(await count.inputValue(),'1');
            await page.locator('#stock_review_actions').getByRole('button',{name:'Omitir',exact:true}).click();
            await page.waitForFunction(()=>!stockReviewBusy && stockReviewState.index===1);
            await menu();assert.match(await room('Baño').textContent(),/0\/1/,'Omitir no cuenta como revisado');
            await choose('Cocina');assert.equal(await count.inputValue(),'1');
            await page.click('#stock_review_layout button[data-sector="A"]');
            await page.waitForFunction(()=>!stockReviewBusy && stockReviewState.index===0);
            assert.equal(await count.inputValue(),'2');
            await page.click('#stock_review_layout button[data-sector="D"]');
            await page.waitForFunction(()=>!stockReviewBusy && stockReviewState.index===1);
            assert.equal(await count.inputValue(),'1');

            await page.reload();await page.waitForFunction(()=>db && !syncing);
            await page.evaluate(async()=>{showModule('stock');await openStockReview();});
            assert.equal(await page.locator('#stock_review_menu').isVisible(),true,'La entrada siempre es el menú');
            assert.match(await room('Cocina').textContent(),/1\/2/);
            await choose('Cocina');assert.equal(await count.inputValue(),'1','Recupera posición y borrador después de recargar');
            await page.click('#stock_review_save');
            await page.waitForFunction(()=>!stockReviewBusy && stockReviewState.index===2);
            assert.match(await page.locator('#stock_review_progress').textContent(),/Revisión completada/);
            await menu();assert.match(await room('Cocina').textContent(),/2\/2/);
            assert.equal(await room('Cocina').locator('.stock-review-room-percentage').textContent(),'100%');
            await page.locator('#stock_general_button').click();
            assert.equal(await page.locator('#current_section_label').textContent(),'Stock');
            assert.equal(await page.locator('#stock_review').isVisible(),false);
            await page.evaluate(()=>openStockReview());
            assert.equal(await page.locator('#stock_review_menu').isVisible(),true);
            assert.match(await room('Cocina').textContent(),/2\/2/,'Revisión general conserva el avance');
            await choose('Despensa');assert.equal(await page.locator('#stock_review_layout').isVisible(),false);
            await menu();await choose('Sin ubicación');
            assert.equal(await page.locator('.stock-review-location-form').isVisible(),true);
            assert.equal(await page.locator('#stock_review_save').isDisabled(),true);
            await menu();
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Sin desborde horizontal');

            if(process.env.STOCK_REVIEW_PREVIEW_DIR) {
                await page.screenshot({path:path.join(process.env.STOCK_REVIEW_PREVIEW_DIR,'stock-review-menu-'+width+'.png'),fullPage:true});
                await choose('Cocina');
                await page.screenshot({path:path.join(process.env.STOCK_REVIEW_PREVIEW_DIR,'stock-review-room-'+width+'.png'),fullPage:true});
                await menu();
            }
            await page.evaluate(async()=>{
                await localTransaction(['catalog','stock_cache','stock_effects'],tx=>{tx.objectStore('catalog').clear();tx.objectStore('stock_cache').clear();tx.objectStore('stock_effects').clear();});
                await showStockReviewRooms();
            });
            assert.equal(await page.locator('#stock_review_rooms > button').count(),4);
            assert.equal(await page.locator('#stock_review_rooms > button:disabled').count(),4);
            assert.match(await page.locator('#stock_review_menu_help').textContent(),/Asigná ubicaciones/);
            assert.deepEqual(errors,[]);
            await page.close();
        }

        const page=await openPage(browser,390);
        await page.evaluate(()=>{
            const state=stockReviewRooms.get('Cocina');
            state.index=1;state.drafts[stockReviewEntryKey(state.entries[1])]={value:'3',expected:'0.000000',dirty:true};
            localStorage.setItem(STOCK_REVIEW_KEY,JSON.stringify(state));
        });
        await page.reload();await page.waitForFunction(()=>db && !syncing);
        await page.evaluate(async()=>{showModule('stock');await openStockReview();await selectStockReviewRoom('Cocina');});
        assert.equal(await page.locator('#stock_review_card .stock-quick-counter input').inputValue(),'3','Migra el avance del formato anterior');
        assert.equal(await page.evaluate(()=>stockReviewState.index),1);
        assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(STOCK_REVIEW_KEY)).version),2);
        await page.close();
        console.log('OK: menú de habitaciones, diagramas, conteos, avance real, cambio de habitación, recarga, migración y pantalla vacía en teléfono y escritorio.');
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
