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
 await page.goto('http://127.0.0.1:8765/home');await page.waitForFunction(()=>db && !syncing);



 const toggle=page.locator('#section_menu_toggle'),menu=page.locator('#section_menu');
 const names={products:'Productos',compare:'Comparar',purchase:'Agregar',cart:'Carrito',stock:'Stock',list:'Lista del súper',scan:'Códigos y fotos',stores:'Supermercados',maps:'Mapa',walk:'Recorrer',new:'Nuevo producto',settings:'Ajustes'};
 async function checkCurrent(id) {
  assert.equal(await page.locator('#current_section_label').textContent(),names[id]);
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  assert.equal(await menu.isVisible(),false);
  assert.equal(await page.locator('.module-panel:visible').count(),1);
  assert.equal(await page.locator('#panel-'+id).isVisible(),true);
  assert.equal(await page.locator('#panel-'+id+' .module-title').isVisible(),false);
  assert.equal(await page.locator('#active_branch_toggle').isVisible(),true);
  assert.equal(await page.locator('#tab-settings').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 async function choose(id) {
  await toggle.click();assert.equal(await menu.isVisible(),true);
  const button=menu.getByRole('menuitem',{name:names[id],exact:true});
  await button.click();await checkCurrent(id);
 }
 await checkCurrent('products');
 for(const id of Object.keys(names)) {
  await choose(id);
  await toggle.click();
  assert.equal(await menu.getByRole('menuitem').count(),12);
  assert.equal(await menu.locator('[aria-current=page]').count(),1);
  assert.ok((await menu.locator('[aria-current=page]').textContent()).includes(names[id]));
  await page.keyboard.press('Escape');assert.equal(await toggle.evaluate(n=>document.activeElement===n),true);
  if(id==='scan')assert.equal(await page.getByRole('heading',{name:'Códigos de barras',exact:true}).isVisible(),true);
 }
 // Stock never hides Products behind horizontal scrolling.
 await choose('stock');await toggle.click();
 assert.equal(await menu.getByRole('menuitem',{name:'Productos',exact:true}).isVisible(),true);
 if(process.env.MERCADO_NAV_PREVIEW && [320,1280].includes(width))await page.screenshot({path:path.join(process.env.MERCADO_NAV_PREVIEW,'section-dropdown-'+width+'.png')});
 await menu.getByRole('menuitem',{name:'Productos',exact:true}).click();await checkCurrent('products');
 // The supermarket selector and Settings remain independent, and dismiss the menu.
 await toggle.click();await page.locator('#active_branch_toggle').click();
 assert.equal(await menu.isVisible(),false);assert.equal(await page.locator('#active_branch_picker').isVisible(),true);
 await page.locator('#active_branch_toggle').click();assert.equal(await page.locator('#active_branch_picker').isVisible(),false);
 await toggle.click();
 await page.locator('#tab-settings').click();await checkCurrent('settings');
 await toggle.click();await page.mouse.click(4,800);assert.equal(await menu.isVisible(),false);
 // Keyboard navigation moves within the menu until a section is chosen.
 await toggle.focus();await page.keyboard.press('ArrowDown');
 assert.equal(await page.locator('#tab-products').evaluate(n=>document.activeElement===n),true);
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await checkCurrent('compare');
 assert.equal(await toggle.evaluate(n=>document.activeElement===n),true);
 await page.keyboard.press('ArrowUp');assert.equal(await page.locator('#section_settings').evaluate(n=>document.activeElement===n),true);
 await page.keyboard.press('Home');assert.equal(await page.locator('#tab-products').evaluate(n=>document.activeElement===n),true);
 await page.keyboard.press('End');await page.keyboard.press(' ');await checkCurrent('settings');
 await toggle.click();await page.keyboard.press('Tab');assert.equal(await menu.isVisible(),false);
 assert.equal(await page.locator('#active_branch_toggle').evaluate(n=>document.activeElement===n),true);
 // Navigation preserves drafts and configured shortcuts.
 await page.evaluate(()=>document.getElementById('quantity').value='3');
 await choose('purchase');assert.equal(await page.locator('#quantity').inputValue(),'3');
 await page.locator('#tab-settings').click();
 await page.locator('input[data-menu-section=stock]').uncheck();await toggle.click();assert.equal(await menu.getByRole('menuitem',{name:'Stock',exact:true}).count(),0);
 await page.keyboard.press('Escape');await page.evaluate(()=>showModule('stock'));await checkCurrent('stock');
 await toggle.click();assert.equal(await menu.getByRole('menuitem',{name:'Stock',exact:true}).isVisible(),true);await page.keyboard.press('Escape');
 await choose('products');await toggle.click();assert.equal(await page.locator('#tab-stock').isVisible(),false);await page.keyboard.press('Escape');
 await page.locator('#tab-settings').click();await page.locator('input[data-menu-section=stock]').check();
 // The menu scrolls on short screens and stays inside the viewport.
 await page.setViewportSize({width,height:360});await toggle.click();
 const bounds=await menu.boundingBox();assert.ok(bounds.y+bounds.height<=360);
 await page.keyboard.press('End');await page.keyboard.press('Enter');await checkCurrent('settings');
 assert.deepEqual(errors,[]);await page.close();}
 console.log('Menú de secciones: todos los destinos, sección actual, teclado, cierres, supermercado, preferencias y pantallas pequeñas/escritorio OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
