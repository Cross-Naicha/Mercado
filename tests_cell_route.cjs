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


 await page.evaluate(async({product,other,branch})=>{
   await openMapEditor();
   const api=mercadoMapProducts;api.place(branch.id,[product.id],0);api.place(branch.id,[other.id],0);
 },{product,other,branch});
 await page.locator('#tab-maps').click();await page.locator('#map_view_products').click();
 const first=page.locator('.map-product-row[data-product-id="'+product.id+'"]');
 assert.equal(await first.locator('.map-cell-controls').count(),1);
 const second=page.locator('.map-product-row[data-product-id="'+other.id+'"]');
 await second.getByRole('button',{name:/^Cuadrado de /}).click();
 await page.locator('#map_assignment_select_menu').getByRole('option',{name:/^Cuadrado 2 /}).click();
 assert.equal(await page.evaluate(id=>mercadoMapProducts.context().placements[id].cell,other.id),1);
 await second.getByRole('button',{name:/^Cuadrado de /}).click();
 await page.locator('#map_assignment_select_menu').getByRole('option',{name:/^Cuadrado 1 /}).click();
 await first.locator('.map-cell-controls').screenshot({path:'square-selector-'+width+'.png'});

 await first.getByRole('button',{name:/^Bajar /}).click();
 assert.equal(await page.evaluate(id=>mercadoMapProducts.context().placements[id].order,product.id),1);
 await page.locator('#tab-walk').click();await page.locator('#walk_cards .product-card').first().waitFor();
 assert.equal(await page.locator('#walk_filter_mode').innerText(),'Por recorrido');
 await page.locator('#walk_products').screenshot({path:'cell-route-preview-'+width+'.png'});
 assert.equal(await page.locator('#walk_cards .product-card').first().getAttribute('data-product-id'),other.id);
 await page.locator('#walk_direction_map [data-endpoint=last]').click();assert.equal(await page.locator('#walk_cards .product-card').first().getAttribute('data-product-id'),product.id);
 // Dos cuadrados: al invertir se invierten cuadrados y posiciones internas.
 await page.evaluate(id=>mercadoMapProducts.place(mercadoActiveBranch,[id],1),other.id);
 await page.waitForFunction(id=>document.querySelector('#walk_cards .product-card')?.dataset.productId===id,other.id);
 await page.locator('#walk_direction_map [data-endpoint=first]').click();assert.equal(await page.locator('#walk_cards .product-card').first().getAttribute('data-product-id'),product.id);
 const card=page.locator('#walk_cards [data-product-id="'+product.id+'"]');await card.click();await card.locator('.walk-eye').click();
 assert.equal(await page.locator('#walk_cards .product-card').last().getAttribute('data-product-id'),product.id);
 assert.equal(await page.locator('#walk_direction_map rect').count(),2);
 // Quitar precisión a un producto lo conserva al final de los ubicados.
 await page.evaluate(id=>mercadoMapProducts.place(mercadoActiveBranch,[id],null),other.id);
 await page.locator('#tab-products').click();await page.locator('#tab-walk').click();
 assert.equal(await page.locator('#walk_cards .walk-product-location').first().innerText(),'Sin cuadrado');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.evaluate(async({product,other})=>{
   const api=mercadoMapProducts;api.place(mercadoActiveBranch,[product.id],0);api.place(mercadoActiveBranch,[other.id],1);
   document.getElementById('map_refine').click();
   if(api.context().placements[other.id].cell!==2)throw Error('Refinar no conservó la ubicación');
   document.getElementById('map_reduce_side').value='left';document.getElementById('map_reduce_count').value='1';document.getElementById('map_reduce_content').checked=true;document.getElementById('map_reduce').click();
   if(api.context().placements[other.id].cell!==1)throw Error('Recortar no trasladó la ubicación');
   if(api.context().placements[product.id])throw Error('La celda eliminada conserva una ubicación inválida');
   if(!api.context().assignments[product.id])throw Error('Se perdió la región del producto');
 },{product,other});
 assert.deepEqual(errors,[]);await page.close();}
 console.log('Cuadrados: asignación, reordenamiento, inversión, pendientes, revisados y mapa numerado en teléfono/escritorio OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
