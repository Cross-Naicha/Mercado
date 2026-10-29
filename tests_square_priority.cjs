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



 await page.locator('#tab-maps').click();await page.locator('#map_view_products').click();
 await page.evaluate(()=>{document.dispatchEvent(new CustomEvent('mercado-map-zone-picked',{detail:'a'}));document.dispatchEvent(new CustomEvent('mercado-map-cell-picked',{detail:0}));});
 const row=page.locator('.map-product-row[data-product-id="'+product.id+'"]');
 await row.getByRole('button',{name:/^Cuadrado de /}).click();await page.locator('#map_assignment_select_menu').getByRole('option',{name:/^Cuadrado 2 /}).click();
 await row.getByRole('button',{name:/^Asignar /}).click();
 await page.waitForFunction(id=>mercadoMapProducts.context().placements[id]?.cell===1,product.id);
 assert.equal(await page.evaluate(id=>mercadoMapProducts.context().placements[id].cell,product.id),1);
 // El mapa asigna solo región, sin elegir cuadrado para el otro producto.
 await row.locator('input[type=checkbox]').check();
 await page.locator('.map-product-row[data-product-id="'+other.id+'"] input[type=checkbox]').check();
 await page.locator('#map_product_apply').click();
 await page.waitForFunction(()=>document.getElementById('map_status').textContent.includes('2 productos guardados'));
 assert.equal(await page.evaluate(id=>mercadoMapProducts.context().placements[id].cell,product.id),1);
 assert.equal(await page.evaluate(id=>mercadoMapProducts.context().placements[id]??null,other.id),null);
 // Elegir Sin cuadrado explícitamente también prevalece sobre el mapa.
 await row.getByRole('button',{name:/^Cuadrado de /}).click();await page.locator('#map_assignment_select_menu').getByRole('option',{name:'Sin cuadrado',exact:true}).click();
 await row.getByRole('button',{name:/^Asignar /}).click();
 await page.waitForFunction(()=>document.getElementById('map_availability_feedback').textContent.includes('asignado'));
 assert.equal(await page.evaluate(id=>mercadoMapProducts.context().placements[id]??null,product.id),null);
 assert.deepEqual(errors,[]);await page.close();}
 console.log('Prioridad del selector: individual, múltiple, mapa solo región y Sin cuadrado en teléfono/escritorio OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
