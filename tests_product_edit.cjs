const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const context=await browser.newContext({viewport:{width:390,height:850}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.log(e.message);});
  const original={id:'234ac292-f29c-4fcf-9e2e-7345499b7f87',product_all:'Arroz, Marca',product_name:'Arroz',product_brand:'Marca',product_ptype:null,product_psubtype:null,product_class:null,presentation:'0.500000',normal_price:'1000.0000',revision:1};
  let rows=[original],sent=[],disconnected=false;
  original.last_price='1423.2400';original.last_price_date='2026-10-01';original.last_price_promotion=true;
  await page.route('**/api/catalog',r=>r.fulfill({json:rows}));
  await page.route('**/api/sync',r=>{if(disconnected) return r.abort();const op=r.request().postDataJSON();sent.push(op);rows=[{...original,display_label:op.payload.display_label,product_name:op.payload.product,product_all:op.payload.product,revision:op.payload.expected_revision+1}];return r.fulfill({json:{operation_id:op.operation_id,entity_id:op.entity_id,status:'confirmed'}});});
  await page.goto('http://127.0.0.1:8765/home');
  await page.waitForFunction(()=>db && !syncing && document.querySelector('#data_table button'));
  assert.equal(await page.locator('.product-last-price').textContent(),'$1.423,24');
  assert.equal(await page.locator('.product-price-caption').textContent(),'Último precio · 2026-10-01 ('+await page.evaluate(()=>priceAgeDays('2026-10-01'))+' días)');
  assert.equal(await page.evaluate(()=>formatProductPrice('0')),'$0,00');
  assert.equal(await page.evaluate(()=>formatProductPrice('1423.2450')),'$1.423,25');
  assert.equal(await page.evaluate(()=>productUnitPrice({unit_status:'confirmed',sale_mode:'package',content_unit:'g',package_content:'400'},'1949.99')),'$4.874,98/kg');
  assert.equal(await page.evaluate(()=>productUnitPrice({unit_status:'confirmed',sale_mode:'package',content_unit:'ml',package_content:'500'},'1000')),'$2.000,00/litro');
  assert.equal(await page.evaluate(()=>productUnitPrice({unit_status:'confirmed',sale_mode:'package',content_unit:'unit',package_content:'6'},'1200')),'$200,00/unidad');
  assert.equal(await page.evaluate(()=>productUnitPrice({unit_status:'confirmed',sale_mode:'fractional',content_unit:'g'},'15000')),'$15.000,00/kg');
  assert.equal(await page.evaluate(()=>productUnitPrice({unit_status:'unconfirmed'},'1949.99')),'');
  await page.getByRole('button',{name:'Seleccionar',exact:true}).click();
  assert.equal(await page.locator('#panel-products').isVisible(),true);
  await page.getByRole('button',{name:'Comparar precio',exact:true}).click();
  await page.locator('#panel-compare').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#new_price').value==='1423.2400');
  assert.equal(await page.locator('#new_presentation').inputValue(),'0.500000');
  assert.ok((await page.locator('#compare_product_label').textContent()).includes('Arroz'));
  assert.ok((await page.locator('#compare_product_reference').textContent()).includes('$1.000,00'));
  assert.equal(await page.locator('#checkbox_new_price_9_99').isDisabled(),true);
  await page.locator('#new_price').fill('1000');await page.locator('#checkbox_new_price_9_99').check();
  await page.locator('#new_price').fill('1000.01');
  assert.equal(await page.locator('#checkbox_new_price_9_99').isDisabled(),true);
  assert.equal(await page.locator('#checkbox_new_price_9_99').isChecked(),false);
  for(const [value,disabled] of [['1950',false],['10',false],['1005',true],['999.99',true],['0',true],['',true]]) {
   await page.locator('#new_price').fill(value);assert.equal(await page.locator('#checkbox_new_price_9_99').isDisabled(),disabled);
  }
  await page.locator('#tab-products').click();await page.getByRole('button',{name:'Seleccionar',exact:true}).click();
  await page.getByRole('button',{name:'Registrar compra',exact:true}).click();await page.locator('#panel-purchase').waitFor({state:'visible'});
  await page.locator('#tab-products').click();await page.getByRole('button',{name:'Seleccionar',exact:true}).click();
  await page.getByRole('button',{name:'Agregar al stock',exact:true}).click();await page.locator('#product_editor').waitFor({state:'visible'});
  assert.equal(await page.locator('#stock_content_unit').isVisible(),true);
  await page.evaluate(()=>closeProductEditor());await page.locator('#search').fill('');
  disconnected=true;await context.setOffline(true);
  await page.getByRole('button',{name:'Editar',exact:true}).click();await page.locator('#edit_name').fill('Arroz corregido');
  await page.locator('#edit_label').fill('Para el almuerzo');
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await page.waitForFunction(async()=>!saving && !syncing && (await localRead('outbox')).length===1);
  assert.equal(await page.evaluate(async()=>(await localRead('catalog'))[0].product_name),'Arroz corregido');
  assert.equal(await page.locator('#data_table strong').textContent(),'Para el almuerzo');
  await page.locator('#search').fill('Arroz');assert.equal(await page.locator('#data_table strong').count(),1);
  assert.ok((await page.locator('#stock_product').textContent()).includes('Para el almuerzo'));
  await page.locator('#search').fill('');
  await page.evaluate(()=>refreshCatalog());
  assert.equal(await page.evaluate(async()=>(await localRead('catalog'))[0].product_name),'Arroz corregido');
  await page.getByRole('button',{name:'Editar',exact:true}).click();await page.locator('#edit_name').fill('Segundo cambio');await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await page.waitForFunction(()=>!saving && !syncing);
  const queue=(await page.evaluate(()=>localRead('outbox'))).sort((a,b)=>a.sequence-b.sequence);assert.equal(queue.length,2);assert.ok(queue[1].depends_on.includes(queue[0].operation_id));assert.equal(queue[1].payload.expected_revision,2);
  disconnected=false;await context.setOffline(false);await page.waitForFunction(()=>!syncing);await page.evaluate(()=>sync_pending());
  assert.equal(sent.length,2);assert.equal(await page.evaluate(async()=>(await localRead('outbox')).length),0);
  await page.getByRole('button',{name:'Editar',exact:true}).click();await page.getByRole('button',{name:'Crear otra presentación',exact:true}).click();
  assert.equal(await page.locator('#panel-new').isVisible(),true);assert.equal(await page.locator('#presentation').inputValue(),'');
  disconnected=true;await context.setOffline(true);
  await page.evaluate(async(id)=>{
   const row=(await localRead('catalog'))[0],other={...row,id:'797051b0-472c-4cd2-99c0-3172db57a68f',product_name:'Otro'};
   Object.assign(row,{sale_mode:'package',content_unit:'g',package_content:'500.000000',unit_status:'confirmed'});
   await localTransaction(['catalog','stock_cache'],tx=>{
    tx.objectStore('catalog').put(row);tx.objectStore('catalog').put(other);
    tx.objectStore('stock_cache').put({id:'snapshot',lots:[{id:'lote1',product_id:row.id,unit:'g',location:'Despensa',expires_on:null},{id:'lote2',product_id:other.id,unit:'g',location:'Despensa',expires_on:null}],movements:[{id:'m1',lot_id:'lote1',quantity:'500.000000',reason:'initial',occurred_at:'2026-10-01T00:00:00Z'},{id:'m2',lot_id:'lote2',quantity:'100.000000',reason:'initial',occurred_at:'2026-10-01T00:00:00Z'}],preferences:[]});
   });
   await showProductActions(row.id);
  });
  assert.equal(await page.locator('#data_table tr').count(),1);
  assert.ok((await page.locator('.product-last-price').textContent()).includes('($2.846,48/kg)'));
  assert.equal(await page.locator('#data_table td #product_actions').count(),1);
  await page.evaluate(()=>read_products());
  assert.equal(await page.locator('#data_table td #product_actions').count(),1);
  await page.getByRole('button',{name:'Volver a la lista',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#data_table tr').length===2);
  await page.evaluate(async()=>showProductActions((await localRead('catalog')).find(p=>p.product_name!=='Otro').id));
  await page.getByRole('button',{name:'Agregar al stock',exact:true}).click();
  await page.locator('#panel-stock').waitFor({state:'visible'});assert.equal(await page.locator('#initial_unit').inputValue(),'g');
  assert.equal(await page.locator('#stock_sale_mode').isVisible(),false);
  await page.evaluate(async()=>showProductActions((await localRead('catalog')).find(p=>p.product_name!=='Otro').id));
  await page.getByRole('button',{name:'Registrar consumo o descarte',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#movement_lot').options.length===2);
  assert.equal(await page.locator('#movement_lot option').nth(1).getAttribute('value'),'lote1');
  await page.evaluate(async()=>editProduct((await localRead('catalog')).find(p=>p.product_name!=='Otro').id));
  assert.equal(await page.locator('#stock_content_unit').isDisabled(),true);
  assert.equal(await page.locator('#data_table tr').count(),1);
  assert.equal(await page.locator('#data_table td #product_editor').count(),1);
  await page.locator('#edit_label').fill('Borrador conservado');await page.evaluate(()=>read_products());
  assert.equal(await page.locator('#edit_label').inputValue(),'Borrador conservado');
  await page.locator('#product_editor').getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#data_table tr').length===2);
  await page.evaluate(async()=>editProduct((await localRead('catalog')).find(p=>p.product_name!=='Otro').id));
  await page.locator('#edit_label').fill('Etiqueta final');
  await page.locator('#product_editor').getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await page.waitForFunction(()=>!saving && document.querySelectorAll('#data_table tr').length===2);
  assert.equal(await page.locator('#product_editor').isVisible(),false);
  assert.deepEqual(errors,[]);console.log('OK: edición móvil, guardado local, catálogo pendiente, orden de sincronización y otra presentación');
 }finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});







