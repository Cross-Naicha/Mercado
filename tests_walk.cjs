const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
 for(const width of [390,1280]) {
 const page=await browser.newPage({serviceWorkers:'block',viewport:{width,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
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
 await localTransaction(['catalog','shopping_cache'],tx=>{tx.objectStore('catalog').put(product);tx.objectStore('shopping_cache').put({id:'snapshot',branches:[branch],barcodes:[],documents:[]});});
 await MercadoAvailability.set(branch.id,[product.id,...(typeof other==='undefined'?[]:[other.id])],'available');
 localStorage.setItem('mercado-branch-map-v1:'+branch.id,JSON.stringify({version:2,rows:16,cols:16,precision:1,cells:Array.from({length:256},(_,i)=>i<2?1:0),shelves:[{id:'a',name:'Almacén',color:'#0f7a66',cells:[0]},{id:'b',name:'Bebidas',color:'#449b52',cells:[1]}],assignments:{[product.id]:'a'}}));
 },{product,branch});
 await page.locator('#tab-walk').click();await page.locator('#walk_branch option[value="'+branch.id+'"]').waitFor({state:'attached'});await page.locator('#active_branch_toggle').click();await page.locator('#active_branch_select').selectOption(branch.id);await page.waitForFunction(()=>document.getElementById('active_branch_picker').hidden);
 assert.equal(await page.locator('#walk_branch').isVisible(),false);
 assert.equal(await page.locator('#walk_zone').isVisible(),false);
 assert.equal(await page.locator('#walk_zones button').count(),2);
 const sizes=await page.locator('#walk_zones button').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
 assert.deepEqual(sizes[0],sizes[1]);
 await page.locator('#walk_zones').getByRole('button',{name:'Bebidas',exact:true}).click();
 assert.equal(await page.locator('#walk_title').innerText(),'Productos · Bebidas');
 assert.equal(await page.locator('#walk_title').isVisible(),true);
 await page.locator('#walk_clear').click();
 await page.locator('#walk_zones').getByRole('button',{name:'Almacén',exact:true}).click();
 assert.equal(await page.locator('#walk_title').innerText(),'Productos · Almacén');
 assert.equal(await page.locator('#walk_zones').isVisible(),false);
 assert.equal(await page.locator('#walk_cards .product-card').count(),1);
 assert.equal(await page.locator('#walk_controls').isVisible(),false);
 assert.equal(await page.locator('#walk_status').isVisible(),false);
 assert.equal(await page.locator('#walk_filter_mode').innerText(),'Por recorrido');
 await page.locator('#walk_filter_mode').click();assert.equal(await page.locator('#walk_filter_mode').innerText(),'Por fecha');
 await page.locator('#walk_filter_mode').click();assert.equal(await page.locator('#walk_filter_mode').innerText(),'Por tipo');
 await page.locator('#walk_filters').getByRole('button',{name:'Almacén',exact:true}).click();
 assert.equal(await page.locator('#walk_cards .product-card').count(),1);
 await page.locator('#walk_filters').getByRole('button',{name:'Tomates',exact:true}).click();
 assert.equal(await page.locator('#walk_filters .combined-filter').innerText(),'Almacén · Tomates');
 await page.locator('#walk_filters .combined-filter').click();
 assert.equal(await page.locator('#walk_filters .combined-filter').innerText(),'Almacén');
 await page.locator('#walk_filter_mode').click();assert.equal(await page.locator('#walk_filter_mode').innerText(),'Por marca');
 await page.locator('#walk_filters').getByRole('button',{name:'Prueba',exact:true}).click();
 assert.equal(await page.locator('#walk_cards .product-card').count(),1);
 await page.locator('#walk_clear').click();assert.equal(await page.locator('#walk_filter_mode').innerText(),'Por recorrido');

 await page.locator('#walk_search').fill('inexistente');assert.equal(await page.locator('#walk_cards .product-card').count(),0);
 await page.locator('#walk_search').fill('');await page.locator('#walk_cards .product-card').click();assert.equal(await page.locator('#walk_cards .product-row-actions').isVisible(),true);await page.locator('#walk_cards button').first().click();await page.locator('#panel-products').waitFor({state:'visible'});
 await page.locator('.walk-return').click();assert.equal(await page.locator('#walk_cards .product-card').count(),1);

 // El mismo menú funciona en ambos catálogos y conserva modos excluyentes.
 assert.equal(await page.locator('#panel-walk #products_floating_menu').count(),1);
 await page.locator('#products_floating_toggle').click();await page.locator('#history_mode_toggle').click();
 assert.equal(await page.locator('#products_floating_toggle').getAttribute('aria-expanded'),'false');
 assert.equal(await page.locator('#history_mode_toggle').getAttribute('aria-pressed'),'true');
 await page.locator('#walk_cards .product-card').click();await page.locator('#walk_cards .price-history').waitFor({state:'visible'});
 assert.equal(await page.locator('#walk_cards .product-row-actions').isVisible(),false);
 await page.locator('#products_floating_toggle').click();await page.locator('#prices_mode_toggle').click();
 assert.equal(await page.locator('#history_mode_toggle').getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('#walk_cards .price-history').count(),0);
 await page.locator('#walk_cards .product-card').click();
 await page.getByRole('button',{name:'Mismo precio',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('save_status').textContent.includes('Nueva observación guardada'));
 const savedPrice=await page.evaluate(async()=> (await localRead('outbox')).find(op=>op.kind==='shelf_price'));
 assert.equal(savedPrice.payload.branch_id,branch.id);
 await page.locator('#walk_cards .product-card').click();
 await page.getByRole('button',{name:'Registrar distinto precio de Tomates'}).click();
 await page.locator('#shelf_price_form').waitFor({state:'visible'});assert.equal(await page.locator('#shelf_branch').inputValue(),branch.id);
 await page.evaluate(()=>closeShelfPrice());await page.locator('.walk-return').click();
 await page.locator('#products_floating_toggle').click();await page.locator('#prices_mode_toggle').click();
 await page.locator('#products_floating_toggle').click();await page.keyboard.press('Escape');
 assert.equal(await page.locator('#products_floating_toggle').getAttribute('aria-expanded'),'false');
 await page.locator('#products_floating_toggle').click();await page.locator('#walk_search').click();
 assert.equal(await page.locator('#products_floating_toggle').getAttribute('aria-expanded'),'false');
 await page.locator('#products_floating_toggle').click();await page.locator('#new_product_floating').click();
 await page.locator('#panel-new').waitFor({state:'visible'});await page.locator('#return_products_floating').click();
 await page.locator('#panel-walk').waitFor({state:'visible'});
 await page.locator('#products_floating_toggle').click();await page.locator('#products_scroll_top').click();
 assert.equal(await page.locator('#products_floating_toggle').getAttribute('aria-expanded'),'false');
 await page.locator('#tab-products').click();assert.equal(await page.locator('#panel-products #products_floating_menu').count(),1);
 await page.locator('#tab-walk').click();await page.locator('#walk_cards .product-card').waitFor({state:'visible'});
 await page.locator('#walk_clear').click();assert.equal(await page.locator('#walk_map').isVisible(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);await page.close();}
 console.log('Recorrer: teléfono y escritorio, mapa, tarjetas, menú compartido, modos, precios por sucursal y regreso OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
