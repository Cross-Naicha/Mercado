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

 const save=page.locator('#map_zone_editor').getByRole('button',{name:'Guardar',exact:true});
 assert.equal(await save.isDisabled(),true);
 assert.equal(await save.getAttribute('aria-disabled'),'true');
 assert.equal(await save.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(229, 231, 230)');
 const untouched=await page.evaluate(()=>JSON.stringify(mercadoMapProducts.context()));await save.evaluate(node=>node.click());assert.equal(await page.evaluate(()=>JSON.stringify(mercadoMapProducts.context())),untouched);
 const color=page.getByRole('combobox',{name:'Color de góndola Almacén',exact:true});
 await color.selectOption('#449b52');assert.equal(await save.isEnabled(),true);await color.selectOption('#0f7a66');assert.equal(await save.isDisabled(),true);
 await page.evaluate(({product,other})=>{mercadoMapProducts.place(mercadoActiveBranch,[product.id],0);mercadoMapProducts.place(mercadoActiveBranch,[other.id],2);},{product,other});
 const before=await page.evaluate(()=>mercadoMapProducts.context());
 await page.locator('#map_zone_editor textarea').fill('Conservas');
 await color.selectOption('#449b52');await page.getByRole('combobox',{name:'Orientación de etiqueta Almacén',exact:true}).selectOption('vertical');
 await page.getByRole('combobox',{name:'Extremo de entrada',exact:true}).selectOption('last');await page.getByRole('button',{name:'Retrasar sección',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>mercadoMapProducts.context()),before);
 await save.click();assert.equal(await save.isDisabled(),true);
 const after=await page.evaluate(()=>mercadoMapProducts.context());
 assert.equal(after.zones[1].name,'Conservas');assert.equal(after.zones[1].color,'#449b52');assert.equal(after.zones[1].entry,'last');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(mercadoMapProducts.storageKey(mercadoActiveBranch))).shelves[1].orientation),'vertical');
 assert.deepEqual(after.placements,before.placements);assert.deepEqual(after.assignments,before.assignments);
 await page.locator('#map_zone_editor textarea').fill('Otro nombre');await page.locator('#map_zone_editor').getByRole('button',{name:'Descartar',exact:true}).click();
 assert.equal(await page.locator('#map_zone_editor textarea').inputValue(),'Conservas');assert.equal(await save.isDisabled(),true);
 assert.deepEqual(errors,[]);await page.close();}
 console.log('Guardar zona: botón deshabilitado sin cambios, campos en borrador, guardado conjunto, ubicaciones conservadas y descarte OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
