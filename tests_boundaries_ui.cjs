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
 await page.goto('http://127.0.0.1:8765/home');await page.addStyleTag({content:'*,html{scroll-behavior:auto!important}'});await page.waitForFunction(()=>db && !syncing);

 await page.evaluate(async({product,other,branch})=>{
 await localTransaction(['catalog','shopping_cache'],tx=>{tx.objectStore('catalog').put(product);tx.objectStore('catalog').put(other);tx.objectStore('shopping_cache').put({id:'snapshot',branches:[branch],barcodes:[],documents:[]});});
 await MercadoAvailability.set(branch.id,[product.id,...(typeof other==='undefined'?[]:[other.id])],'available');
 localStorage.setItem('mercado-branch-map-v1:'+branch.id,JSON.stringify({version:2,rows:16,cols:16,precision:1,cells:Array.from({length:256},(_,i)=>i<2?1:0),shelves:[{id:'a',name:'Almacén',color:'#0f7a66',cells:[0,1]}],assignments:{[product.id]:'a',[other.id]:'a'}}));
 },{product,other,branch});

 await page.evaluate(async branch=>{await choosePurchaseBranch(branch.id);showModule('maps');await openMapEditor();},branch);
 await page.locator('#map_boundary_tools summary').click();
 const read=()=>page.evaluate(id=>JSON.parse(localStorage.getItem('mercado-branch-map-v1:'+id)),branch.id);
 const clickCell=async(cell,side='east')=>{await page.locator('#map_canvas').scrollIntoViewIfNeeded();await page.evaluate(()=>{document.getElementById('map_viewport').scrollLeft=0;document.getElementById('map_viewport').scrollTop=0;});const rect=await page.locator('#map_canvas').boundingBox(),map=await read(),w=rect.width/map.cols,h=rect.height/map.rows;const offset={east:[.94,.5],west:[.06,.5],north:[.5,.06],south:[.5,.94]}[side];await page.mouse.click(rect.x+(cell%map.cols+offset[0])*w,rect.y+(Math.floor(cell/map.cols)+offset[1])*h);};
 await page.selectOption('#map_boundary_mode','wall');await clickCell(17);
 assert.deepEqual((await read()).walls,['v:2:1']);
 await clickCell(18,'west');assert.deepEqual((await read()).walls,[]);
 await page.selectOption('#map_boundary_mode','access');await clickCell(1,'south');
 assert.deepEqual((await read()).access['1'],['north','east','west']);
 await page.check('#map_boundary_zone');await clickCell(1,'south');
 assert.deepEqual((await read()).access['0'],['north','east','south','west']);
 await page.selectOption('#map_boundary_mode','auto');await clickCell(1);assert.deepEqual((await read()).access,{});
 await page.uncheck('#map_boundary_zone');
 // Close both free sides of cell zero; outside-grid sides cannot be used.
 await page.selectOption('#map_boundary_mode','access');await clickCell(0,'south');
 await page.selectOption('#map_boundary_mode','probe');await clickCell(16);await clickCell(0);
 assert.ok((await page.locator('#map_boundary_status').innerText()).includes('Sin acceso'));
 await clickCell(1);assert.ok((await page.locator('#map_boundary_status').innerText()).includes('Camino posible'));
 await page.selectOption('#map_boundary_mode','wall');await clickCell(17);
 // Refinement and undo must preserve both access and walls.
 await page.locator('.map-expand summary').click();await page.locator('#map_refine').click();
 assert.deepEqual((await read()).walls,['v:4:2','v:4:3']);
 await page.evaluate(()=>document.getElementById('map_undo').click());
 assert.deepEqual((await read()).walls,['v:2:1']);
 await page.evaluate(async()=>{const api=window.mercadoMapProducts;api.receive(api.context().branch,JSON.parse(localStorage.getItem(api.storageKey(api.context().branch))));});
 assert.deepEqual((await read()).walls,['v:2:1']);

 await page.selectOption('#map_side','left');await page.fill('#map_count','1');await page.locator('#map_expand').click();
 assert.deepEqual((await read()).walls,['v:3:1']);
 await page.locator('.map-reduce summary').click();await page.selectOption('#map_reduce_side','left');await page.fill('#map_reduce_count','1');await page.locator('#map_reduce').click();
 assert.deepEqual((await read()).walls,['v:2:1']);
 assert.deepEqual((await read()).access['0'],['north','east','west']);
 await page.selectOption('#map_boundary_side','north');await page.locator('#map_canvas').focus();await page.keyboard.press('Space');
 assert.ok((await read()).walls.some(edge=>edge.startsWith('h:')));
 await page.evaluate(()=>document.getElementById('map_undo').click());
 await page.screenshot({path:'boundaries-preview-'+width+'.png',fullPage:true});
 assert.deepEqual(errors,[]);await page.close();
 }
 console.log('OK: boundary editing, reciprocal walls, per-cell and whole-shelf access, path preview, refine, undo and reload at mobile/desktop widths.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
