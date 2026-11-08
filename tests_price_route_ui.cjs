const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
 for(const width of [320,390,1280]) {
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
 await page.goto('http://127.0.0.1:8765/home');await page.addStyleTag({content:'*,html{scroll-behavior:auto!important}'});await page.waitForFunction(()=>db && !syncing);

 await page.evaluate(async({product,other,branch})=>{
 await localTransaction(['catalog','shopping_cache'],tx=>{tx.objectStore('catalog').put(product);tx.objectStore('catalog').put(other);tx.objectStore('shopping_cache').put({id:'snapshot',branches:[branch],barcodes:[],documents:[]});});
 await MercadoAvailability.set(branch.id,[product.id,...(typeof other==='undefined'?[]:[other.id])],'available');
 localStorage.setItem('mercado-branch-map-v1:'+branch.id,JSON.stringify({version:2,rows:16,cols:16,precision:1,cells:Array.from({length:256},(_,i)=>i<2?1:0),shelves:[{id:'a',name:'Almacén',color:'#0f7a66',cells:[0,1]}],assignments:{[product.id]:'a',[other.id]:'a'}}));
 },{product,other,branch});


 await page.evaluate(async({product,other,branch})=>{
 const key='mercado-branch-map-v1:'+branch.id,map=JSON.parse(localStorage.getItem(key));map.placements={[product.id]:{cell:0,order:0},[other.id]:{cell:1,order:0}};localStorage.setItem(key,JSON.stringify(map));
 await choosePurchaseBranch(branch.id);showModule('walk');await openWalk();
 },{product,other,branch});
 await page.getByRole('switch',{name:'Recorrido automático'}).check();
 const mark=async(x,y)=>{await page.locator('#walk_auto_map').scrollIntoViewIfNeeded();const point=await page.evaluate(({x,y})=>{const svg=document.querySelector('#walk_auto_map svg'),p=new DOMPoint(x*24+12,y*24+12).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y};},{x,y});await page.mouse.click(point.x,point.y);};
 await page.click('#walk_auto_start');await mark(0,1);await page.click('#walk_auto_end');await mark(2,1);
 assert.equal(await page.locator('#walk_auto_setup input:visible').count(),0);
 const sizes=await page.locator('.walk-endpoint-buttons button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));assert.ok(Math.abs(sizes[0]-sizes[1])<1);
 await page.screenshot({path:'price-route-setup-'+width+'.png',fullPage:true});
 await page.click('#walk_auto_calculate');
 assert.equal(await page.locator('#walk_auto_stop_badge').innerText(),'01 / 02');
 assert.equal(await page.locator('#walk_auto_progress').getAttribute('aria-valuenow'),'0');
 assert.equal(await page.locator('#walk_cards .product-card').count(),1);
 assert.equal(await page.locator('#walk_cards .product-card').getAttribute('data-product-id'),product.id);
 await page.locator('#walk_cards .product-card').click();
 assert.ok(await page.locator('#walk_cards button').filter({hasText:'Mismo precio'}).isVisible());
 await page.locator('#walk_cards button').filter({hasText:'Mismo precio'}).click();
 await page.waitForFunction(()=>!saving);
 assert.ok((await page.evaluate(()=>localRead('outbox'))).some(op=>op.kind==='shelf_price'));
 assert.equal(await page.locator('#walk_auto_map .walk-auto-current-path').count(),1);
 await page.screenshot({path:'price-route-preview-'+width+'.png',fullPage:true});
 await page.click('#walk_auto_next');
 assert.equal(await page.locator('#walk_cards .product-card').getAttribute('data-product-id'),other.id);
 await page.evaluate(()=>openWalk());
 assert.equal(await page.locator('#walk_auto_stop_badge').innerText(),'02 / 02');
 assert.equal(await page.locator('#walk_auto_progress').getAttribute('aria-valuenow'),'50');
 const beforeRestart=await page.evaluate(async()=>({outbox:await localRead('outbox'),catalog:await localRead('catalog')}));
 await page.getByRole('button',{name:'Reiniciar recorrido',exact:true}).click();
 assert.equal(await page.getByRole('switch',{name:'Recorrido automático'}).isChecked(),true);
 assert.ok(await page.locator('#walk_auto_start').isVisible());
 assert.equal(await page.locator('#walk_auto_live').isVisible(),false);
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('prices-mode')),false);
 assert.equal(await page.locator('#walk_auto_sr').inputValue(),'2');
 assert.equal(await page.locator('#walk_auto_ec').inputValue(),'3');
 assert.deepEqual(await page.evaluate(async()=>({outbox:await localRead('outbox'),catalog:await localRead('catalog')})),beforeRestart);
 await page.click('#walk_auto_calculate');
 assert.equal(await page.locator('#walk_auto_stop_badge').innerText(),'01 / 02');
 assert.equal(await page.locator('#walk_cards .walk-reviewed').count(),0);
 await page.click('#walk_auto_next');
 await page.click('#walk_auto_previous');assert.equal(await page.locator('#walk_cards .walk-reviewed').count(),1);
 await page.click('#walk_auto_next');await page.click('#walk_auto_next');
 assert.equal(await page.locator('#walk_auto_phase').textContent(),'Revisión terminada');
 assert.equal(await page.locator('#walk_auto_progress').getAttribute('aria-valuenow'),'100');
 assert.ok(await page.locator('#walk_auto_next').isDisabled());
 await page.click('#walk_auto_restart');
 assert.ok(await page.locator('#walk_auto_calculate').isVisible());
 await page.click('#walk_auto_calculate');
 assert.equal(await page.locator('#walk_cards .walk-reviewed').count(),0);
 await page.getByRole('switch',{name:'Recorrido automático'}).uncheck();
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('prices-mode')),false);
 assert.equal(await page.locator('#prices_mode_toggle').getAttribute('aria-pressed'),'false');
 // Route warnings keep inaccessible products visible to the user.
 await page.evaluate(()=>{const api=mercadoMapProducts,key=api.storageKey(mercadoActiveBranch),map=JSON.parse(localStorage.getItem(key));map.access={'0':[]};delete map.placements[Object.keys(map.placements)[1]];localStorage.setItem(key,JSON.stringify(map));return openWalk();});
 await page.getByRole('switch',{name:'Recorrido automático'}).check();
 await page.click('#walk_auto_calculate');assert.equal(await page.locator('#walk_auto_warnings li').count(),2);
 await page.getByRole('switch',{name:'Recorrido automático'}).uncheck();
 await page.getByRole('switch',{name:'Recorrido automático'}).check();
 await page.click('#walk_auto_start');await mark(0,0);
 assert.ok((await page.locator('#save_status').innerText()).includes('cuadrado libre'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);await page.close();
 }
 console.log('OK: price route at mobile/desktop widths, price actions, progress, restart without data changes, return, completion, inaccessible and unlocated warnings, invalid endpoints.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
