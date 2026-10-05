const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  for(const width of [390,1280]) {
   const context=await browser.newContext({viewport:{width,height:850}});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:8765/home');
   assert.equal(await page.locator('[role=tab]').count(),9);
   assert.equal(await page.locator('.module-panel:visible').count(),1);
   for(const id of ['purchase','stock','list','scan','stores','new','settings','compare','products']) {
    await page.locator('#tab-'+id).click();
    assert.equal(await page.locator('.module-panel:visible').count(),1);
    assert.equal(await page.locator('#panel-'+id).isVisible(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   }
   await page.locator('#tab-purchase').click();await page.locator('#market').fill('Conservar borrador');
   await page.locator('#tab-stock').click();await page.locator('#tab-purchase').click();
   assert.equal(await page.locator('#market').inputValue(),'Conservar borrador');
   await page.locator('#tab-purchase').focus();await page.keyboard.press('ArrowRight');
   assert.equal(await page.locator('#tab-stock').getAttribute('aria-selected'),'true');
   await page.evaluate(()=>openModuleSection('register_section'));
   assert.equal(await page.locator('#panel-new').isVisible(),true);
   await page.evaluate(()=>openModuleSection('instances_section'));
   assert.equal(await page.locator('#panel-purchase').isVisible(),true);
   await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
   await page.reload();await context.setOffline(true);await page.reload();
   await page.locator('#tab-list').click();assert.equal(await page.locator('#panel-list').isVisible(),true);
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Pestañas: escritorio, teléfono, borradores, teclado y recarga sin conexión OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
