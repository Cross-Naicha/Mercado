const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const context=await browser.newContext({viewport:{width:390,height:850}}),page=await context.newPage();
  const product={id:'234ac292-f29c-4fcf-9e2e-7345499b7f87',product_name:'Tomates',product_brand:'Prueba',product_all:'Tomates',presentation:'0.400000',normal_price:'1000.0000',normal_unit:'2500',sale_mode:'package',content_unit:'g',package_content:'400.000000',unit_status:'confirmed',revision:1};
  await page.route('**/api/catalog',r=>r.fulfill({json:[product]}));
  await page.goto('http://127.0.0.1:8765/home');await page.waitForFunction(()=>db && !syncing && document.querySelector('#data_table button'));
  await page.locator('.product-card strong').click();
  await page.getByRole('button',{name:'Seleccionar',exact:true}).click();await page.getByRole('button',{name:'Comparar precio',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#new_presentation').value==='0.400000');
  await page.locator('#offer').check();await page.locator('#new_price').fill('800');await page.locator('button[onclick="compare_prices()"]').click();
  assert.ok((await page.locator('#comparison_result').textContent()).includes('-20,00%'));
  assert.equal(await page.locator('#price').inputValue(),'800.0000');assert.equal(await page.locator('#quantity').inputValue(),'1');
  assert.equal(await page.locator('#checkbox_is_promotion').isChecked(),true);
  await page.locator('#new_price').fill('1000');
  for(const [promo,quantity,total,average,normalized] of [['2x1','2','1000.0000','$500,00','$1.250,00'],['3x2','3','2000.0000','$666,67','$1.666,67'],['4x3','4','3000.0000','$750,00','$1.875,00'],['2_50%','2','1500.0000','$750,00','$1.875,00'],['2_80%','2','1200.0000','$600,00','$1.500,00']]) {
   await page.locator(`[id="${promo}"]`).check();await page.locator('button[onclick="compare_prices()"]').click();
   const text=await page.locator('#comparison_result').textContent();
   assert.equal(await page.locator('#comparison_result p').count(),3);
   assert.equal(text.includes('pagás'),false);assert.equal(text.includes('(promedio)'),false);
   assert.ok(text.includes('Precio efectivo por envase: '+average),text);
   assert.ok(text.includes('Precio por kg: '+normalized),text);
   assert.equal(await page.locator('#quantity').inputValue(),quantity);assert.equal(await page.locator('#purchase_total').inputValue(),total);
   if(promo==='2x1') assert.ok(text.includes('-50,00%'),text);
  }
  await page.locator('[id="2x1"]').check();await page.locator('#new_price').fill('1949.99');
  await page.locator('button[onclick="compare_prices()"]').click();
  const text=await page.locator('#comparison_result').textContent();
  assert.ok(text.includes('Precio efectivo por envase: $975,00'),text);
  assert.ok(text.includes('Precio por kg: $2.437,49'),text);
  assert.equal(await page.locator('#price').inputValue(),'974.9950');assert.equal(await page.locator('#purchase_total').inputValue(),'1949.9900');
  await page.locator('#special').check();await page.locator('#compare_special_quantity').fill('4');await page.locator('#compare_special_total').fill('1000');await page.locator('#compare_special_description').fill('4 turrones por $1.000');
  assert.equal(await page.locator('#new_price').isDisabled(),true);
  await page.locator('button[onclick="compare_prices()"]').click();
  assert.ok((await page.locator('#comparison_result').textContent()).includes('Precio efectivo por envase: $250,00'));
  assert.equal(await page.locator('#quantity').inputValue(),'4');assert.equal(await page.locator('#purchase_total').inputValue(),'1000.0000');
  assert.equal(await page.locator('#purchase_promotion_description').inputValue(),'4 turrones por $1.000');
  await page.locator('[id="2x1"]').check();assert.equal(await page.locator('#compare_special_fields').isVisible(),false);assert.equal(await page.locator('#new_price').isDisabled(),false);
  console.log('OK: cinco promociones, mitad por envase en 2x1, precio/kg, total y redondeo sin perder el ticket');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

