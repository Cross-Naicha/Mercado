const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
 for(const width of [390,1280]) {
 const page=await browser.newPage({serviceWorkers:'block',viewport:{width,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const product={id:'234ac292-f29c-4fcf-9e2e-7345499b7f87',product_name:'Tomates',product_class:'Almacén',product_brand:'Prueba',product_all:'Tomates',presentation:'0.400000',normal_price:'1000.0000',sale_mode:'package',content_unit:'g',package_content:'400.000000',unit_status:'confirmed',revision:1};
 const date=days=>{const value=new Date();value.setDate(value.getDate()-days);return value.toLocaleDateString('sv-SE');};
 product.normal_date=date(3);
 product.price_options=[
  {id:'old-a',branch_id:'a',market:'Súper A',price:'800',date:date(40),occurred_at:date(40)+'T12:00:00Z'},
  {id:'new-a',branch_id:'a',market:'Súper A',price:'900',date:date(32),occurred_at:date(32)+'T12:00:00Z',promotion:true,conditions:'special'},
  {id:'b',branch_id:'b',market:'Súper B',price:'1100',date:date(7),occurred_at:date(7)+'T12:00:00Z',conditions:'2x1',description:'Dos por uno'},
  {id:'c',branch_id:'c',market:'Súper C',price:'1500',date:date(1),occurred_at:date(1)+'T12:00:00Z'}
 ];
 product.regular_price_options=[
  {id:'regular-a',branch_id:'a',market:'Súper A',price:'1000',date:date(40),occurred_at:date(40)+'T12:00:00Z'},
  {id:'regular-b',branch_id:'b',market:'Súper B',price:'1300',date:date(18),occurred_at:date(18)+'T12:00:00Z'},
  product.price_options[3]
 ];
 const other={...product,id:'234ac292-f29c-4fcf-9e2e-7345499b7f90',product_name:'Zanahorias',product_all:'Zanahorias',price_options:[product.price_options[3]]};
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
 await page.locator('#section_menu_toggle').click();await page.locator('#tab-walk').click();await page.locator('#walk_branch option[value="'+branch.id+'"]').waitFor({state:'attached'});await page.locator('#active_branch_toggle').click();await page.locator('#active_branch_select').selectOption(branch.id);await page.waitForFunction(()=>document.getElementById('active_branch_picker').hidden);
 await page.locator('#walk_map g[role=button]').click();



 await page.evaluate(async({product,other,branch})=>{await openMapEditor();mercadoMapProducts.place(branch.id,[product.id],0);mercadoMapProducts.place(branch.id,[other.id],0);await openWalk();},{product,other,branch});


 const card=page.locator('#walk_cards [data-product-id="'+product.id+'"]');

 async function checkPrices(card){
  assert.equal(await card.locator(':scope > .product-last-price').getAttribute('data-freshness'),'stale');
  assert.ok((await card.locator(':scope > .product-last-price').textContent()).includes('$900,00'));
  const offer = card.locator(':scope > .product-price-caption');
  assert.equal(await offer.isVisible(),true);
  assert.match(await offer.textContent(),/Súper A.*Promoción especial/);
  const regular = card.locator(':scope > .product-normal-price');
  assert.equal(await regular.locator('.product-normal-price-label').textContent(),'Mejor precio sin promoción');
  const regularAmount = regular.locator(':scope > .product-last-price');
  assert.match(await regularAmount.textContent(),/\$1\.000,00/);
  assert.equal(await regularAmount.getAttribute('data-freshness'),'stale');
  assert.match(await regular.locator(':scope > .product-price-caption').textContent(),/Súper A · 40 días/);
  assert.equal(await regularAmount.evaluate(node=>getComputedStyle(node).color),await card.locator(':scope > .product-last-price').evaluate(node=>getComputedStyle(node).color));
  const regularAlternative = regular.locator('.product-normal-alternative');
  assert.match(await regularAlternative.textContent(),/\$1\.300,00.*Súper B · 18 días/);
  assert.equal(await regularAlternative.locator('.product-last-price').getAttribute('data-freshness'),'old');
  const second=card.locator('.product-second-price');assert.equal(await second.count(),1);
  assert.ok((await second.textContent()).includes('$1.100,00'));
  assert.ok((await second.textContent()).includes('Súper B'));
  assert.ok((await second.textContent()).includes('Dos por uno'));
  assert.equal(await card.locator('.product-normal-price').count(),1);
  assert.equal(await second.locator('.product-last-price').getAttribute('data-freshness'),'fresh');
  assert.equal(await card.locator('.product-recent-best').count(),0);
  assert.equal(await second.evaluate(node=>getComputedStyle(node).borderTopStyle),'solid');
  assert.equal(await card.locator(':scope > .product-last-price').evaluate(node=>getComputedStyle(node,'::before').backgroundColor),'rgb(23, 23, 23)');
 }
 await checkPrices(card);
 await page.locator('#section_menu_toggle').click();await page.locator('#tab-products').click();
 await checkPrices(page.locator('#data_table [data-product-id="'+product.id+'"]'));
 assert.equal(await page.locator('[data-product-id="'+other.id+'"] .product-normal-price').count(),0);
 assert.deepEqual(await page.evaluate(()=>[0,7,8,14,15,31,32,100].map(priceFreshness)),['fresh','fresh','recent','recent','old','old','stale','stale']);
 assert.equal(await page.evaluate(()=>renderSecondProductPrice({price_options:[{price:'100',branch_id:'a'}]})),null);
 // El segundo local depende del indicador del primero, no del suyo.
 for(const age of [7,8,14,15,31,32]) {
  await page.evaluate(async({id,age})=>{
   const row=(await localRead('catalog')).find(row=>row.id===id);
   const date=new Date();date.setDate(date.getDate()-age);
   row.price_options.find(option=>option.id==='new-a').date=date.toLocaleDateString('sv-SE');
   await localTransaction(['catalog'],tx=>tx.objectStore('catalog').put(row));
   await read_products();await openWalk();
  },{id:product.id,age});
  for(const selector of ['#data_table','#walk_cards']) {
   const productCard = page.locator(selector+' [data-product-id="'+product.id+'"]');
   assert.equal(await productCard.locator('.product-second-price').count(),age<=7 ? 0 : 1);
   assert.equal(await productCard.locator('.product-recent-best').count(),age<=7 ? 1 : 0);
  }
  if (age === 7) {
   const compactCard = page.locator('#data_table [data-product-id="'+product.id+'"]');
   assert.equal(await compactCard.locator(':scope > .product-promotion-caption').isVisible(),true);
   assert.equal(await compactCard.getByText('Mejor precio reciente',{exact:true}).isVisible(),true);
   assert.equal(await compactCard.locator('.product-recent-best').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(255, 243, 201)');
   assert.equal(await compactCard.locator(':scope > .product-normal-price').isVisible(),true);
   assert.equal(await compactCard.locator('.product-normal-alternative').isVisible(),true);
  }
 }
 await page.evaluate(async({id,today})=>{
  const row=(await localRead('catalog')).find(row=>row.id===id);
  row.regular_price_options[0].date=today;
  await localTransaction(['catalog'],tx=>tx.objectStore('catalog').put(row));
  await read_products();await openWalk();
 },{id:product.id,today:date(0)});
 for (const selector of ['#data_table','#walk_cards']) {
  const productCard = page.locator(selector+' [data-product-id="'+product.id+'"]');
  assert.equal(await productCard.locator('.product-normal-alternative').count(),0);
  assert.equal(await productCard.locator('.product-second-price').count(),1);
  assert.equal(await productCard.locator('.product-normal-price > .product-last-price').getAttribute('data-freshness'),'fresh');
 }
 assert.deepEqual(errors,[]);await page.close();}
 console.log('Precios por súper: dos opciones, último registro por local, negro desde 32 días y tarjetas de Productos/Recorrer en móvil/escritorio OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
