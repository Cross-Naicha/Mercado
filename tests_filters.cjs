const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const context=await browser.newContext({viewport:{width:390,height:850}}),page=await context.newPage();
  const rows=[['Alimentos','Arroz','A'],['Alimentos','Arroz','B'],['Alimentos','Fideos','C'],['Limpieza','Jabón','D']].map(([category,name,brand],i)=>({id:String(i),product_class:category,product_name:name,product_brand:brand,presentation:'1',normal_price:null}));
  await page.route('**/api/catalog',r=>r.fulfill({json:rows}));await page.goto('http://127.0.0.1:8765/home');
  await page.waitForFunction(()=>document.querySelectorAll('#data_table tr').length===4);
  assert.equal(await page.locator('#product_filter_section').isVisible(),false);assert.equal(await page.locator('#brand_filter_section').isVisible(),false);
  await page.locator('#filters').getByRole('button',{name:'Alimentos',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#data_table tr').length===3);
  assert.equal(await page.locator('#active_filters [aria-pressed=true]').first().textContent(),'Alimentos');
  assert.equal(await page.locator('#product_filter_section').isVisible(),true);assert.equal(await page.locator('#brand_filter_section').isVisible(),false);
  assert.equal(await page.locator('#product_filters').getByRole('button',{name:'Jabón',exact:true}).count(),0);
  await page.locator('#product_filters').getByRole('button',{name:'Arroz',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#data_table tr').length===2);
  assert.equal(await page.locator('#active_filters [aria-pressed=true]').nth(1).textContent(),'Arroz');
  assert.equal(await page.locator('#brand_filter_section').isVisible(),true);
  assert.equal(await page.locator('#product_filter_section').isVisible(),false);
  assert.equal(await page.locator('#brand_filters').getByRole('button',{name:'C',exact:true}).count(),0);
  await page.locator('#brand_filters').getByRole('button',{name:'B',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#data_table tr').length===1);
  assert.equal(await page.locator('#active_filters [aria-pressed=true]').nth(2).textContent(),'B');
  assert.deepEqual(await page.locator('#active_filters button').allTextContents(),['Por tipo','Alimentos','Arroz','B','Limpiar']);
  assert.equal(await page.locator('#brand_filter_section').isVisible(),false);
  await page.locator('#active_filters').getByRole('button',{name:'Arroz',exact:true}).click();
  await page.locator('#product_filters').getByRole('button',{name:'Todos',exact:true}).click();
  assert.equal(await page.locator('#brand_filter_section').isVisible(),false);
  await page.locator('#active_filters').getByRole('button',{name:'Alimentos',exact:true}).click();
  await page.locator('#filters').getByRole('button',{name:'Limpieza',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#data_table strong').textContent.includes('Jabón'));
  assert.equal(await page.locator('#brand_filter_section').isVisible(),false);
  await page.locator('#active_filters').getByRole('button',{name:'Limpiar',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#data_table tr').length===4);
  assert.equal(await page.locator('#product_filter_section').isVisible(),false);
  await page.locator('#catalog_filter_mode').click();
  assert.equal(await page.locator('#product_filter_section').isVisible(),false);
  assert.equal(await page.locator('#active_filters').isVisible(),false);
  await page.locator('#filters').getByRole('button',{name:'B',exact:true}).click();
  await page.locator('#product_filters').getByRole('button',{name:'Arroz',exact:true}).click();
  await page.locator('#brand_filters').getByRole('button',{name:'Alimentos',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#data_table tr').length===1);
  assert.deepEqual(await page.locator('#active_filters button').allTextContents(),['Por marca','B','Arroz','Alimentos','Limpiar']);
  await page.locator('#catalog_filter_mode').click();
  await page.waitForFunction(()=>document.querySelectorAll('#data_table tr').length===4);
  assert.equal(await page.locator('#product_filter_section').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  console.log('OK: filtros progresivos, selección destacada, opciones relacionadas y reinicio en teléfono');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});



