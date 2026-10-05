const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
 const page=await browser.newPage({viewport:{width:390,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const product={id:'234ac292-f29c-4fcf-9e2e-7345499b7f87',product_name:'Tomates',product_all:'Tomates',presentation:'0.400000',normal_price:'1000.0000',sale_mode:'package',content_unit:'g',package_content:'400.000000',unit_status:'confirmed',revision:1};
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
 await localTransaction(['catalog','shopping_cache'],tx=>{tx.objectStore('catalog').put(product);tx.objectStore('shopping_cache').put({id:'snapshot',branches:[branch],barcodes:[],documents:[]});});
 select_product(product.id,product.product_all,product.product_name,'','','',product.normal_price,null,product.presentation);
 await configureStockSelection(product.id);await renderShopping();$('purchase_branch').value=branch.id;$('price').value='1000';$('quantity').value='2';
 },{product,branch});
 await page.evaluate(()=>save_instance_form());
 assert.equal(await page.evaluate(async()=>(await localRead('cart')).length),1);
 assert.equal(await page.evaluate(async()=>(await localRead('outbox')).filter(o=>o.kind==='purchase').length),0);
 assert.equal(await page.evaluate(async()=>(await localRead('stock_effects')).length),0);
 await page.reload();await page.waitForFunction(()=>db && !syncing);
 assert.equal(await page.evaluate(async()=>(await localRead('cart')).length),1);
 await page.locator('#tab-cart').click();assert.equal(await page.locator('#cart_confirm').isVisible(),true);
 assert.equal(await page.locator('#cart_items input').count(),0);
 await page.getByRole('button',{name:'Sumar unidades',exact:true}).click();
 await page.waitForFunction(()=>!saving);
 await page.getByRole('button',{name:'Restar unidades',exact:true}).click();await page.waitForFunction(()=>!saving);
 assert.equal(await page.evaluate(async()=>(await localRead('cart'))[0].payload.total_paid),'2000.0000');
 await page.getByRole('button',{name:'Sumar unidades',exact:true}).click();await page.waitForFunction(()=>!saving);
 await page.evaluate(async()=>{const item=(await localRead('cart'))[0];await addCartItem({...item.payload,quantity:'1.000000',total_paid:'1000.0000',price:'1000.0000'});});
 assert.ok((await page.locator('#cart_total').textContent()).includes('4.000,00'));
 await page.screenshot({path:'cart-preview.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.evaluate(async()=>{const item=(await localRead('cart'))[0];item.payload.product_revision=99;await localTransaction(['cart'],tx=>tx.objectStore('cart').put(item));await confirmCart();});
 assert.equal(await page.evaluate(async()=>(await localRead('cart')).length),2);
 assert.equal(await page.evaluate(async()=>(await localRead('outbox')).filter(o=>o.kind==='purchase').length),0);
 await page.evaluate(async()=>{const item=(await localRead('cart'))[0];item.payload.product_revision=1;await localTransaction(['cart'],tx=>tx.objectStore('cart').put(item));await Promise.all([confirmCart(),confirmCart()]);});
 await page.waitForFunction(()=>!saving && !syncing);
 const result=await page.evaluate(async()=>({cart:await localRead('cart'),ops:await localRead('outbox'),effects:await localRead('stock_effects')}));
 assert.equal(result.cart.length,0);assert.equal(result.ops.filter(o=>o.kind==='purchase').length,2);
 assert.equal(result.effects.length,2);assert.ok(result.effects.some(e=>e.movement.quantity==='1200.000000'));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('OK: carrito sin compra ni stock, recarga offline, edición, total, validación sin guardado parcial y confirmación sin duplicados.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
