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


 await page.evaluate(async()=>{
 syncing=true;
 const operations=[
 {operation_id:'pending-preview-1',entity_id:'p1',kind:'purchase',created_at:new Date().toISOString(),payload:{product:'Leche entera · 1 L',quantity:'2',total_paid:'3400',market:'Supermercado'},error:'Esperando conexión con tu PC'},
 {operation_id:'pending-preview-2',entity_id:'p2',kind:'shelf_price',created_at:new Date().toISOString(),payload:{product:'Aceite de girasol · 900 ml',price:'2500',market:'Supermercado'},error:'Revisá la unidad del producto antes de guardar el precio.',error_status:422},
 {operation_id:'pending-preview-3',entity_id:'p3',kind:'product_edit',created_at:new Date().toISOString(),payload:{product:'Arroz largo fino · 1 kg',brand:'Gallo'}}];
 await localTransaction(['outbox'],tx=>operations.forEach(op=>tx.objectStore('outbox').put(op)));
 await updateStatus();document.getElementById('pending_details').open=true;
 });
 await page.locator('#tab-settings').click();
 assert.equal(await page.locator('#pending_count').innerText(),'3');
 assert.equal(await page.locator('.pending-card').count(),3);
 assert.equal(await page.locator('.pending-card[data-state=attention]').count(),1);
 await page.locator('.pending-card[data-state=attention] .pending-card-details>summary').click();
 assert.equal(await page.locator('.pending-card[data-state=attention] .pending-save').isEnabled(),true);
 await page.evaluate(()=>updateStatus());assert.equal(await page.locator('.pending-card[data-state=attention] details').getAttribute('open'),'');
 await page.locator('.pending-card[data-state=attention] .pending-card-details>summary').click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#pending_details').screenshot({path:'pending-preview-'+width+'.png'});
 await page.evaluate(async()=>{await localTransaction(['outbox'],tx=>tx.objectStore('outbox').clear());await updateStatus();});
 assert.equal(await page.locator('#pending_count').innerText(),'0');assert.equal(await page.locator('.pending-empty strong').innerText(),'Todo al día');
 assert.deepEqual(errors,[]);await page.close();}
 console.log('Pendientes: resumen, tarjetas, estados, corrección, despliegue conservado, vista vacía y ancho móvil/escritorio OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
