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


 await page.evaluate(()=>renderShopping());
 await page.locator('#tab-stores').click();
 assert.equal(await page.locator('#branch_cards .product-row-actions button:visible').count(),4);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#branch_search').fill('Otro');
 await page.waitForFunction(()=>document.querySelectorAll('#branch_cards>tr').length===1);
 await page.locator('#branch_search').fill('inexistente');
 await page.waitForFunction(()=>document.getElementById('branch_results').textContent.includes('No encontramos'));
 await page.locator('#branch_search').fill('');
 await page.waitForFunction(()=>document.querySelectorAll('#branch_cards>tr').length===2);

 await page.screenshot({path:'stores-preview-'+width+'.png',fullPage:true});
 assert.equal(await page.locator('#store_route').isVisible(),true);
 for(const detail of await page.locator('#store_route details').all()) {
 await detail.locator('summary').click();
 assert.equal(await detail.getAttribute('open'),'');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await detail.locator('summary').click();
 }
 await page.locator('#location_form summary').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('#location_product').isVisible(),true);
 await page.locator('#store_route').screenshot({path:'route-preview-'+width+'.png'});
 await page.locator('#location_form summary').click();

 await page.locator('#branch_cards .product-row-actions button').first().click();
 await page.getByRole('button',{name:'Comprar en este local',exact:true}).click();
 await page.waitForFunction(()=>window.mercadoActiveBranch==='234ac292-f29c-4fcf-9e2e-7345499b7f88' && !document.getElementById('panel-products').hidden);
 await page.locator('#tab-stores').click();
 await page.locator('#branch_cards .product-row-actions button').nth(1).click();
 await page.locator('#branch_short_name').fill('a1');
 await page.getByRole('button',{name:'Guardar local',exact:true}).click();
 assert.equal(await page.locator('#branch_form').isVisible(),true);
 await page.waitForFunction(()=>!saving); await page.locator('#branch_short_name').fill('cen');
 await page.getByRole('button',{name:'Guardar local',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('active_branch_toggle').textContent==='CEN').catch(async error=>{console.log(await page.evaluate(async()=>({notice:document.getElementById('save_status').textContent,state:await shoppingState(),saving})));throw error;});
 assert.equal(await page.evaluate(async()=> (await shoppingState()).branches.find(b=>b.id===window.mercadoActiveBranch).short_name),'CEN');
 await page.locator('#branch_cards .product-row-actions button').nth(1).click();
 assert.equal(await page.locator('#branch_short_name').inputValue(),'CEN');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.evaluate(()=>closeBranchForm());
 await page.reload();await page.waitForFunction(()=>document.getElementById('active_branch_toggle').textContent==='CEN');
 assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Supermercados: acciones, búsqueda, estados vacíos, selección y ancho móvil/escritorio OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
