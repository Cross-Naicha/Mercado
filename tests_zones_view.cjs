const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
 for(const width of [390,1280]) {
 const page=await browser.newPage({serviceWorkers:'block',viewport:{width,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const product={id:'234ac292-f29c-4fcf-9e2e-7345499b7f87',product_name:'Tomates',product_class:'Almacén',product_brand:'Prueba',product_all:'Tomates',presentation:'0.400000',normal_price:'1000.0000',sale_mode:'package',content_unit:'g',package_content:'400.000000',unit_status:'confirmed',revision:1};
 const other={...product,id:'234ac292-f29c-4fcf-9e2e-7345499b7f90',product_name:'Zanahorias',product_all:'Zanahorias'};
 const branch={id:'234ac292-f29c-4fcf-9e2e-7345499b7f88',name:'Super',address:'Prueba',revision:1};
 await page.route('http://127.0.0.1:8765/**',async r=>{
 const url=new URL(r.request().url());
 if(url.pathname==='/api/catalog') return r.fulfill({json:[product,other]});
 if(url.pathname.startsWith('/api/')) return r.fulfill({status:503,json:{detail:'Sin conexión'}});
 const file=path.join(process.cwd(),url.pathname==='/home' ? 'index.html' : url.pathname.slice(1));
 if(fs.existsSync(file)) return r.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});
 return r.fulfill({status:404,body:''});
 });
 await page.goto('http://127.0.0.1:8765/home');await page.waitForFunction(()=>db && !syncing);

 await page.evaluate(async({product,other,branch})=>{
 await localTransaction(['catalog','shopping_cache'],tx=>{tx.objectStore('catalog').put(product);tx.objectStore('catalog').put(other);tx.objectStore('shopping_cache').put({id:'snapshot',branches:[branch],barcodes:[],documents:[]});});
 await MercadoAvailability.set(branch.id,[product.id,...(typeof other==='undefined'?[]:[other.id])],'available');
 localStorage.setItem('mercado-branch-map-v1:'+branch.id,JSON.stringify({version:2,rows:16,cols:16,precision:1,cells:Array.from({length:256},(_,i)=>i<2?1:0),shelves:[{id:'a',name:'Almacén',color:'#0f7a66',cells:[0,1]}],assignments:{[product.id]:'a',[other.id]:'a'}}));
 },{product,other,branch});
 await page.locator('#tab-walk').click();await page.locator('#walk_branch option[value="'+branch.id+'"]').waitFor({state:'attached'});await page.locator('#active_branch_toggle').click();await page.locator('#active_branch_select').selectOption(branch.id);await page.waitForFunction(()=>document.getElementById('active_branch_picker').hidden);
 await page.locator('#walk_map g[role=button]').click();




 await page.evaluate(async({product,other,branch})=>{await MercadoAvailability.set(branch.id,[product.id],'available');await MercadoAvailability.set('another-branch',[other.id],'available');},{product,other,branch});

 await page.locator('#tab-maps').click();
 assert.equal(await page.locator('#map_branch').isVisible(),false);assert.equal(await page.locator('#map_branch_button').count(),0);
 await page.locator('#map_view_zones').click();assert.equal(await page.locator('#map_zones_view').isVisible(),true);
 assert.equal(await page.locator('#map_zones_card').evaluate(node=>node.tagName),'SECTION');
 await page.locator('#map_zones_card>.map-card-heading').click();assert.equal(await page.locator('#map_shelves').isVisible(),true);assert.equal(await page.locator('#map_canvas').getAttribute('tabindex'),'-1');
 await page.evaluate(({product,other})=>{mercadoMapProducts.place(mercadoActiveBranch,[product.id],0);mercadoMapProducts.place(mercadoActiveBranch,[other.id],1);},{product,other});
 const originalLocations=await page.evaluate(()=>mercadoMapProducts.context().placements);
 const originalZone=await page.evaluate(()=>mercadoMapProducts.context().zones[0].id);
 const before=await page.evaluate(()=>JSON.stringify(mercadoMapProducts.context()));
 await page.locator('#map_canvas').click({position:{x:10,y:10}});
 assert.equal(await page.evaluate(()=>JSON.stringify(mercadoMapProducts.context())),before);
 await page.locator('#map_zones_card .map-zone-button').first().click();
 const name=page.locator('#map_zone_editor textarea');
 assert.equal(await name.evaluate(node=>getComputedStyle(node).resize),'none');
 assert.equal(await name.evaluate(node=>node.getBoundingClientRect().height),await page.locator('#map_zone_editor').getByRole('button',{name:'Guardar',exact:true}).evaluate(node=>node.getBoundingClientRect().height));
 await name.fill('Almacén nuevo');await page.locator('#map_zone_editor').getByRole('button',{name:'Guardar',exact:true}).click();
 assert.equal(await page.evaluate(()=>mercadoMapProducts.context().zones[0].name),'Almacén nuevo');
 assert.equal(await page.evaluate(()=>mercadoMapProducts.context().zones[0].id),originalZone);
 assert.deepEqual(await page.evaluate(()=>mercadoMapProducts.context().placements),originalLocations);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem(mercadoMapProducts.storageKey(mercadoActiveBranch))).placements),originalLocations);
 await page.locator('#map_zones_card .map-help-trigger').click();assert.equal(await page.locator('#map_zones_card .map-context-help').isVisible(),true);
 assert.equal(await page.locator('#map_shelves').isVisible(),false);
 await page.locator('#map_zones_card .map-help-back').click();assert.equal(await page.locator('#map_shelves').isVisible(),true);
 assert.equal(await page.locator('#map_zones_card .map-option-content').first().locator(':scope>p:not([id])').count(),0);
 assert.equal(await page.locator('#map_export').isVisible(),false);assert.equal(await page.locator('#map_status').isVisible(),false);
 for(const count of [1,4,7,10,17]){
   await page.evaluate(({count})=>{const raw=JSON.parse(localStorage.getItem('mercado-branch-map-v1:'+mercadoActiveBranch));mercadoMapProducts.receive(mercadoActiveBranch,{...raw,rows:64,cells:Array.from({length:1024},(_,i)=>i<count?1:0),shelves:Array.from({length:count},(_,i)=>({id:'z'+i,name:'Zona '+(i+1),color:'#0f7a66',orientation:'horizontal',cells:[i]})),assignments:{}});},{count});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const layout=await page.locator('#map_shelves .map-zone-grid').evaluate(grid=>{const clear=document.getElementById('map_clear_zones'),viewport=document.getElementById('map_viewport');return {last:grid.lastElementChild===clear,right:Math.abs(grid.getBoundingClientRect().right-clear.getBoundingClientRect().right),blank:grid.querySelectorAll('.map-zone-slot').length,complete:viewport.clientHeight>=document.getElementById('map_canvas').getBoundingClientRect().height,scroll:viewport.scrollHeight-viewport.clientHeight};});
   assert.equal(layout.last,true);assert.ok(layout.right<2);assert.equal(layout.blank,0);assert.equal(layout.complete,true);assert.ok(layout.scroll<=2);
 }
 await page.locator('#map_zones_view').screenshot({path:'zones-view-'+width+'.png'});
 await page.locator('#map_view_products').click();assert.equal(await page.locator('#map_products_view').isVisible(),true);
 await page.locator('#map_view_zones').click();assert.equal(await page.locator('#map_zones_view').isVisible(),true);
 await page.locator('#map_view_draw').click();assert.equal(await page.locator('#map_canvas').getAttribute('tabindex'),'0');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.close();}
 console.log('Zonas: mapa bloqueado, tres vistas, selector general, editar etiqueta, altura fija y ayuda en móvil/escritorio OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
