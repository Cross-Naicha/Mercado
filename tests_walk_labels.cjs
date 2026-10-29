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
 localStorage.setItem('mercado-branch-map-v1:'+branch.id,JSON.stringify({version:2,rows:16,cols:16,precision:1,cells:Array.from({length:256},(_,i)=>i===0||i===16?1:0),shelves:[{id:'a',name:'Almacén & Bebidas',orientation:'vertical',color:'#0f7a66',cells:[0,16]}],assignments:{[product.id]:'a',[other.id]:'a'}}));
 },{product,other,branch});
 await page.locator('#tab-walk').click();await page.locator('#walk_branch option[value="'+branch.id+'"]').waitFor({state:'attached'});await page.locator('#active_branch_toggle').click();await page.locator('#active_branch_select').selectOption(branch.id);await page.waitForFunction(()=>document.getElementById('active_branch_picker').hidden);

 const label=page.locator('#walk_map .walk-map-label');
 assert.equal(await label.getAttribute('data-orientation'),'vertical');
 assert.ok((await label.getAttribute('transform')).includes('rotate(-90)'));
 assert.deepEqual(await label.locator('tspan').allTextContents(),['Almacén','Bebidas']);
 await label.click();assert.equal(await page.locator('#walk_title').innerText(),'Productos · Almacén · Bebidas');
 await page.locator('#walk_clear').click();
 await page.evaluate(()=>{const api=mercadoMapProducts,value=JSON.parse(localStorage.getItem(api.storageKey(mercadoActiveBranch)));value.shelves[0].orientation='horizontal';localStorage.setItem(api.storageKey(mercadoActiveBranch),JSON.stringify(value));});
 await page.evaluate(()=>openWalk());
 assert.equal(await label.getAttribute('data-orientation'),'horizontal');assert.ok(!(await label.getAttribute('transform')).includes('rotate'));
 assert.deepEqual(await label.locator('tspan').allTextContents(),['Almacén','Bebidas']);
 assert.deepEqual(errors,[]);await page.close();}
 console.log('Etiquetas de Recorrer: orientación, saltos de línea y selección por etiqueta en móvil/escritorio OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
