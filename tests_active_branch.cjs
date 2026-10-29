const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
 for(const width of [390,1280]) {
 const page=await browser.newPage({serviceWorkers:'block',viewport:{width,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let mapSyncRequests=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/api/maps')mapSyncRequests++;});
 const product={id:'234ac292-f29c-4fcf-9e2e-7345499b7f87',product_name:'Tomates',product_class:'Almacén',product_brand:'Prueba',product_all:'Tomates',presentation:'0.400000',normal_price:'1000.0000',sale_mode:'package',content_unit:'g',package_content:'400.000000',unit_status:'confirmed',revision:1};
 const branch={id:'234ac292-f29c-4fcf-9e2e-7345499b7f88',name:'Super',address:'Prueba',revision:1};
 await page.route('http://127.0.0.1:8765/**',async r=>{
 const url=new URL(r.request().url());
 if(url.pathname==='/api/catalog') return r.fulfill({json:[product]});
 if(url.pathname.startsWith('/api/')) return r.fulfill({status:503,json:{detail:'Sin conexión'}});
 const file=path.join(process.cwd(),url.pathname==='/home' ? 'index.html' : url.pathname.slice(1));
 if(fs.existsSync(file)) return r.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});
 return r.fulfill({status:404,body:''});
 });
 await page.goto('http://127.0.0.1:8765/home');await page.waitForFunction(()=>db && !syncing);

 await page.evaluate(async({product,branch})=>{
 await localTransaction(['catalog','shopping_cache'],tx=>{tx.objectStore('catalog').put(product);tx.objectStore('shopping_cache').put({id:'snapshot',branches:[branch,{...branch,id:'234ac292-f29c-4fcf-9e2e-7345499b7f89',name:'Otro súper'}],barcodes:[],documents:[]});});
 localStorage.setItem('mercado-branch-map-v1:'+branch.id,JSON.stringify({version:2,rows:16,cols:16,precision:1,cells:Array.from({length:256},(_,i)=>i===0?1:0),shelves:[{id:'a',name:'Almacén',color:'#0f7a66',cells:[0]}],assignments:{[product.id]:'a'}}));
 },{product,branch});

 await page.locator('#active_branch_toggle').click();
 await page.locator('#active_branch_select').selectOption(branch.id);
 await page.waitForFunction(id=>window.mercadoActiveBranch===id,branch.id);
 await page.waitForFunction(()=>document.getElementById('active_branch_picker').hidden);
 assert.equal(await page.locator('#active_branch_toggle').getAttribute('aria-expanded'),'false');
 for(const id of ['purchase_branch','shelf_branch','route_branch'])assert.equal(await page.locator('#'+id).inputValue(),branch.id);
 assert.equal(await page.evaluate(()=>mercadoMapProducts.context().branch),branch.id);
 await page.locator('#tab-walk').click();await page.waitForFunction(id=>document.getElementById('walk_branch').value===id,branch.id);
 await page.locator('#walk_map g[role=button]').click();assert.equal(await page.locator('#walk_cards .product-card').count(),1);
 await page.locator('#active_branch_toggle').click();await page.locator('#active_branch_select').selectOption('234ac292-f29c-4fcf-9e2e-7345499b7f89');
 await page.waitForFunction(()=>window.mercadoActiveBranch==='234ac292-f29c-4fcf-9e2e-7345499b7f89');
 await page.waitForFunction(()=>document.getElementById('walk_branch').value==='234ac292-f29c-4fcf-9e2e-7345499b7f89');
 assert.equal(await page.locator('#walk_products').isVisible(),false);
 for(const id of ['purchase_branch','shelf_branch','route_branch'])assert.equal(await page.locator('#'+id).inputValue(),'234ac292-f29c-4fcf-9e2e-7345499b7f89');
 // Cambiar desde otro selector también actualiza la selección general.
 await page.evaluate(async()=>{await choosePurchaseBranch('');});
 assert.equal(await page.locator('#active_branch_select').inputValue(),'');
 assert.equal(await page.locator('#market').inputValue(),'');
 assert.equal(await page.evaluate(()=>mercadoMapProducts.context().branch),'');
 await page.locator('#active_branch_toggle').click();await page.locator('#active_branch_select').selectOption(branch.id);
 await page.waitForFunction(()=>document.getElementById('active_branch_picker').hidden);
 await page.reload();await page.waitForFunction(()=>db&&!syncing);
 await page.waitForFunction(id=>window.mercadoActiveBranch===id,branch.id);
 for(const id of ['purchase_branch','shelf_branch','route_branch'])assert.equal(await page.locator('#'+id).inputValue(),branch.id);
 await page.locator('#active_branch_toggle').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#active_branch_picker').isVisible(),false);
 await page.locator('#active_branch_toggle').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#active_branch_select').press('ArrowDown');assert.equal(await page.locator('#panel-products').isVisible(),true);
 await page.keyboard.press('Escape');
 await page.locator('#tab-settings').click();
 assert.equal(await page.locator('#panel-settings #sync_all_now').isVisible(),true);
 assert.equal(await page.locator('#panel-maps #map_sync_now').count(),0);
 assert.equal(await page.locator('#panel-settings #map_sync_status').count(),1);
 assert.equal(await page.locator('#panel-settings #map_sync_conflict').count(),1);
 await page.locator('[data-menu-section="maps"]').uncheck();assert.equal(await page.locator('#tab-maps').isVisible(),false);
 const before=mapSyncRequests;await page.locator('#sync_all_now').click();
 await page.waitForFunction(()=>!document.getElementById('sync_all_now').disabled);
 assert.ok((await page.locator('#map_sync_status').innerText()).startsWith('Sin sincronizar:'));
 assert.equal(await page.locator('#map_sync_now').count(),0);
 assert.ok(mapSyncRequests>before);assert.equal(await page.locator('#panel-settings').isVisible(),true);
 assert.deepEqual(errors,[]);await page.close();}
 console.log('Supermercado general: teléfono/escritorio, compras, precios, lista, mapas, Recorrer, restauración y teclado OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
