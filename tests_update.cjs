const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const context=await browser.newContext(),page=await context.newPage();let updated=false;
  const old=`const NAME='mercado-test-old';const FILES=['/home','/static/js/offline.js'];self.addEventListener('install',e=>e.waitUntil(caches.open(NAME).then(c=>c.addAll(FILES))));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(FILES.includes(u.pathname)&&e.request.mode!=='navigate')e.respondWith(caches.match(u.pathname).then(c=>c||fetch(e.request)));});`;
  await context.route('**/sw.js',r=>r.fulfill({contentType:'application/javascript',body:updated ? fs.readFileSync('sw.js','utf8') : old}));
  await page.goto('http://127.0.0.1:8765/home');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
  await page.waitForFunction(()=>db);
  await page.evaluate(async()=>{
   await localTransaction(['shopping_manual'],tx=>tx.objectStore('shopping_manual').put({id:'preserved',text:'Conservar datos'}));
   const cache=await caches.open('mercado-test-old');const response=await cache.match('/static/js/offline.js');
   await cache.put('/static/js/offline.js',new Response(await response.text()+'\n/* OLD_CACHE */',{headers:{'Content-Type':'application/javascript'}}));
  });
  assert.ok(await page.evaluate(async()=>(await (await fetch('/static/js/offline.js?v=19')).text()).includes('OLD_CACHE')));
  updated=true;await page.locator('#tab-settings').click();
  await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Actualizar aplicación',exact:true}).click()]);
  await page.waitForFunction(()=>db);
  assert.equal(await page.evaluate(async()=>(await (await fetch('/static/js/offline.js?v=19')).text()).includes('OLD_CACHE')),false);
  assert.ok(await page.evaluate(async()=>(await localRead('shopping_manual')).some(row=>row.id==='preserved')));
  await context.setOffline(true);await page.reload();await page.locator('#tab-compare').click();
  assert.equal(await page.locator('#compare_product_label').isVisible(),true);
  console.log('OK: reproducida caché anterior, actualización aplicada, datos conservados y recarga sin conexión');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
