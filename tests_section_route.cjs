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
 localStorage.setItem('mercado-branch-map-v1:'+branch.id,JSON.stringify({version:2,rows:16,cols:16,precision:1,cells:Array.from({length:256},(_,i)=>i<4?1:0),shelves:[{id:'a',name:'Almacén',color:'#0f7a66',cells:[0,1]},{id:'b',name:'Bebidas',color:'#449b52',cells:[2,3]}],assignments:{[product.id]:'a',[other.id]:'b'}}));
 },{product,other,branch});
 await page.locator('#tab-walk').click();await page.locator('#walk_branch option[value="'+branch.id+'"]').waitFor({state:'attached'});await page.locator('#active_branch_toggle').click();await page.locator('#active_branch_select').selectOption(branch.id);await page.waitForFunction(()=>document.getElementById('active_branch_picker').hidden);
 await page.locator('#walk_map g[role=button]').first().click();




 await page.locator('#tab-maps').click();await page.locator('#map_view_zones').click();
 await page.locator('#map_shelves').getByRole('button',{name:'Almacén',exact:true}).click();
 assert.deepEqual(await page.getByRole('combobox',{name:'Extremo de entrada',exact:true}).locator('option').allTextContents(),['Oeste · Cuadrado 1','Este · Cuadrado 2']);
 await page.getByRole('combobox',{name:'Extremo de entrada',exact:true}).selectOption('last');
 await page.getByRole('button',{name:'Retrasar sección',exact:true}).click();
 await page.locator('#map_zone_editor').getByRole('button',{name:'Guardar',exact:true}).click();
 assert.equal(await page.evaluate(()=>mercadoMapProducts.context().zones[0].id),'b');
 assert.equal(await page.evaluate(()=>mercadoMapProducts.context().zones.find(z=>z.id==='a').entry),'last');
 await page.locator('#tab-walk').click();await page.locator('#walk_back_map').click();
 await page.locator('#walk_zones').getByRole('button',{name:'Bebidas',exact:true}).click();
 assert.equal(await page.locator('#walk_previous_section').isDisabled(),true);assert.equal(await page.locator('#walk_section_progress').innerText(),'1 / 2');
 await page.locator('#walk_next_section').click();assert.equal(await page.locator('#walk_title').innerText(),'Productos · Almacén');assert.equal(await page.locator('#walk_section_progress').innerText(),'2 / 2');
 assert.equal(await page.locator('#walk_direction_map [data-endpoint=last]').getAttribute('aria-pressed'),'true');
 await page.locator('#walk_next_section').click();assert.equal(await page.locator('#walk_route_complete').isVisible(),true);assert.equal(await page.locator('#walk_zone').inputValue(),'a');
 await page.locator('#walk_previous_section').click();assert.equal(await page.locator('#walk_title').innerText(),'Productos · Bebidas');assert.equal(await page.locator('#walk_route_complete').isVisible(),false);
 await page.reload();await page.waitForFunction(()=>db&&!syncing);await page.locator('#tab-walk').click();await page.locator('#walk_zones').getByRole('button',{name:'Almacén',exact:true}).click();
 assert.equal(await page.locator('#walk_direction_map [data-endpoint=last]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#walk_section_progress').innerText(),'2 / 2');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#walk_products').screenshot({path:'section-route-preview-'+width+'.png'});
 await page.locator('#tab-maps').click();await page.locator('#map_view_zones').click();
 await page.evaluate(()=>{const api=mercadoMapProducts,key=api.storageKey(mercadoActiveBranch),value=JSON.parse(localStorage.getItem(key));value.cells[16]=1;value.shelves.find(zone=>zone.id==='a').cells=[0,16];localStorage.setItem(key,JSON.stringify(value));api.receive(mercadoActiveBranch,value);});
 await page.locator('#map_shelves').getByRole('button',{name:'Almacén',exact:true}).click();
 assert.deepEqual(await page.getByRole('combobox',{name:'Extremo de entrada',exact:true}).locator('option').allTextContents(),['Norte · Cuadrado 1','Sur · Cuadrado 2']);
 assert.equal(await page.getByRole('combobox',{name:'Extremo de entrada',exact:true}).inputValue(),'last');
 assert.deepEqual(errors,[]);await page.close();}
 console.log('Recorrido: ordenar zonas, entrada por extremo, avanzar/retroceder, final sin bucle y persistencia en móvil/escritorio OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
