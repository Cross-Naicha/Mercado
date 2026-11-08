const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage({serviceWorkers:'block',viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const product={id:'e9878aac-3fc6-5421-94a2-4cf9670c045b',product_name:'Papel higienico',product_brand:'Felpita',product_all:'Papel higienico · Felpita · 24 unidades',sale_mode:'package',content_unit:'unit',package_content:'24.000000',unit_status:'confirmed',revision:5};
  const first='a46a4bc9-5c4e-477a-b720-18baef718da6',second='60ae51d3-c3cd-4a88-ae73-d2cc5c57324f';
  await page.route('http://127.0.0.1:8765/**',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname==='/api/catalog')return route.fulfill({json:[product]});
   if(url.pathname==='/api/sync/diagnostics')return route.fulfill({json:request.method()==='POST'?{received:0}:{pending:[
    {operation_id:first,entity_id:first,product_id:product.id,kind:'stock_count',title:product.product_all,state:'error',error:'Las existencias cambiaron',error_status:409,blocked_by:[],values:{location:'Baño',expected_balance:'24.000000',quantity:'18.000000'},last_seen:'2026-11-05T12:00:00Z'},
    {operation_id:second,entity_id:second,product_id:product.id,kind:'stock_count',title:product.product_all,state:'blocked',error:null,error_status:null,blocked_by:[first],values:{location:'Baño',expected_balance:'18.000000',quantity:'16.000000'},last_seen:'2026-11-05T12:00:00Z'}],failures:[]}});
   if(url.pathname==='/api/stock')return route.fulfill({json:{lots:[],movements:[],preferences:[],confirmed_operations:[]}});
   if(url.pathname==='/api/shopping')return route.fulfill({json:{branches:[],barcodes:[],documents:[],confirmed_operations:[]}});
   if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{detail:'Sin conexión'}});
   const file=path.join(process.cwd(),url.pathname==='/home'?'index.html':url.pathname.slice(1));
   if(fs.existsSync(file))return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});
   return route.fulfill({status:404,body:''});
  });
  await page.goto('http://127.0.0.1:8765/home');await page.waitForFunction(()=>db&&!syncing);
  await page.locator('#tab-settings').click();await page.locator('#sync_diagnostics>summary').click();
  await page.waitForFunction(()=>document.querySelectorAll('#sync_diagnostics_list .pending-card').length===2);
  assert.equal(await page.locator('#sync_diagnostics_count').innerText(),'2');
  assert.match(await page.locator('#sync_diagnostics_list').innerText(),/Las existencias cambiaron/);
  assert.match(await page.locator('#sync_diagnostics_list').innerText(),/Esperando: Papel higienico/);
  assert.match(await page.locator('#sync_diagnostics_list').innerText(),/Cantidad guardada: 18\.000000/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('OK: la PC muestra el 409, el recuento bloqueado y las cantidades sin desbordar la pantalla');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
