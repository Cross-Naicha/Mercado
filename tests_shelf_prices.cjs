const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const context=await browser.newContext({viewport:{width:390,height:850}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const original={id:'234ac292-f29c-4fcf-9e2e-7345499b7f87',product_name:'Tomates',product_brand:'Prueba',presentation:'0.400000',normal_price:'1000.0000',normal_date:'2026-06-01',last_price:'1000.0000',last_price_date:'2026-06-01',sale_mode:'package',content_unit:'g',package_content:'400.000000',unit_status:'confirmed',revision:1};
  let rows=[original],allow=false,sent=[];
  await page.route('**/api/catalog',r=>r.fulfill({json:rows}));
  await page.route('**/api/stock',r=>r.fulfill({json:{lots:[],movements:[],preferences:[],confirmed_operations:[]}}));
  await page.route('**/api/shopping',r=>r.fulfill({json:{branches:[],barcodes:[],documents:[],confirmed_operations:[]}}));
  await page.route('**/api/sync',r=>{
   if(!allow) return r.abort();const op=r.request().postDataJSON();sent.push(op);const special=op.payload.promotion==='special';
   rows=[{...original,last_price:special ? '250.0000' : '474.9950',last_list_price:special ? null : '949.9900',last_offer_quantity:special ? '4.000000' : '2.000000',last_offer_total:special ? '1000.0000' : '949.9900',last_price_description:op.payload.promotion_description,last_price_date:'2026-10-01',last_price_at:op.payload.occurred_at,last_price_source:'shelf',last_price_market:'Súper de prueba',last_price_conditions:op.payload.promotion,last_price_promotion:true}];
   return r.fulfill({json:{operation_id:op.operation_id,entity_id:op.entity_id,status:'confirmed'}});
  });
  await page.goto('http://127.0.0.1:8765/home');await page.waitForFunction(()=>db && !syncing && document.querySelector('#data_table button'));
  await page.evaluate(()=>navigator.serviceWorker.ready);
  for(const special of [false,true]) {
   allow=false;await context.setOffline(true);await page.locator('#tab-products').click();
   await page.getByRole('button',{name:'Seleccionar',exact:true}).click();await page.getByRole('button',{name:'Registrar precio de góndola',exact:true}).click();await page.locator('#shelf_price_form').waitFor({state:'visible'});
   assert.equal(await page.locator('#data_table td #shelf_price_form').count(),1);
   await page.locator('#shelf_market').fill('Súper de prueba');await page.locator('#shelf_date').fill('2026-10-01');
   await page.locator('#shelf_promotion').selectOption(special ? 'special' : '2x1');
   if(special) {
    assert.equal(await page.locator('#shelf_price').isDisabled(),true);
    await page.locator('#shelf_special_quantity').fill('4');await page.locator('#shelf_special_total').fill('1000');await page.locator('#shelf_special_description').fill('4 turrones por $1.000');
   } else await page.locator('#shelf_price').fill('949.99');
   await page.getByRole('button',{name:'Guardar precio de góndola',exact:true}).click();
   await page.waitForFunction(async()=>!saving && !syncing && (await localRead('outbox')).length===1);
   await page.waitForFunction(expected=>document.querySelector('.product-last-price').textContent.includes(expected),special ? '$250,00' : '$475,00');
   assert.ok((await page.locator('.product-price-caption').textContent()).includes('Góndola'));
   assert.equal(await page.evaluate(async()=>(await projectedStock()).lots.length),0);
   await page.reload();await page.waitForFunction(()=>db && !syncing);
   await page.getByRole('button',{name:'Seleccionar',exact:true}).click();await page.getByRole('button',{name:'Comparar precio',exact:true}).click();
   if(special) {
    await page.locator('#compare_special_fields').waitFor({state:'visible'});
    assert.equal(await page.locator('#compare_special_quantity').inputValue(),'4');
    assert.equal(Number(await page.locator('#compare_special_total').inputValue()),1000);
    assert.equal(await page.locator('#compare_special_description').inputValue(),'4 turrones por $1.000');
   } else {await page.waitForFunction(()=>document.querySelector('#new_price').value==='949.9900');assert.equal(await page.locator('[id="2x1"]').isChecked(),true);}
   allow=true;await context.setOffline(false);await page.waitForFunction(()=>!syncing);await page.evaluate(()=>sync_pending());
   assert.equal(await page.evaluate(async()=>(await localRead('outbox')).length),0);
  }
  assert.equal(sent.length,2);assert.equal(sent[1].payload.special_quantity,4);assert.deepEqual(errors,[]);
  console.log('OK: góndola normal/especial, descripción, recarga offline y sincronización sin compras/stock');
 }finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
