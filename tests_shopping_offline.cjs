const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async () => {
 const browser=await chromium.launch({headless:true,channel:'msedge'}),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 const errors=[];page.on('pageerror',e => errors.push(e.message));
 const product={id:'185ad72c-f234-48d6-a27a-9082b043780e',product_all:'Galletas ejemplo',product_name:'Galletas',product_brand:'Marca',presentation:'0.5',normal_price:'1000',normal_unit:'2000',sale_mode:'package',content_unit:'g',package_content:'500.000000',unit_status:'confirmed',revision:1};
 await page.route('**/api/catalog',r => r.fulfill({json:[product]}));
 await page.route('**/api/stock',r => r.fulfill({json:{lots:[],movements:[],preferences:[{product_id:product.id,minimum_quantity:'500.000000',revision:1}],confirmed_operations:[]}}));
 await page.route('**/api/shopping',r => r.fulfill({json:{branches:[],documents:[],barcodes:[],confirmed_operations:[]}}));
 try {
  await page.goto('http://127.0.0.1:8765/home');await page.waitForFunction(() => document.querySelectorAll('#assist_product option').length===2);
  await page.evaluate(() => navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(() => document.querySelectorAll('#assist_product option').length===2);
  await context.setOffline(true);
  await page.locator('#assist_product').selectOption(product.id);await page.locator('#barcode_value').fill('0012345678905');await page.getByRole('button',{name:'Asociar código al producto',exact:true}).click();
  await page.waitForFunction(() => document.querySelector('#barcode_list').textContent.includes('0012345678905'));
  await page.locator('#branch_name').fill('Super ejemplo');await page.locator('#branch_address').fill('Sucursal centro');await page.getByRole('button',{name:'Guardar sucursal',exact:true}).click();
  await page.waitForFunction(() => document.querySelectorAll('#route_branch option').length===2);
  const branch=await page.locator('#route_branch option').nth(1).getAttribute('value');await page.locator('#route_branch').selectOption(branch);
  await page.getByText('Mapa de conexiones transitables',{exact:true}).click();
  await page.locator('#map_nodes').fill('entrada | Entrada\np1 | Pasillo 1\nfrio | Fríos\ncajas | Cajas');await page.locator('#map_edges').fill('entrada | p1 | 10\np1 | frio | 5\nfrio | cajas | 10');
  await page.getByRole('button',{name:'Guardar mapa',exact:true}).click();await page.waitForFunction(() => document.querySelector('#route_result').textContent.includes('Recorrido aproximado'));
  await page.locator('#location_form').evaluate(e => e.open=true);await page.locator('#location_product').selectOption(product.id);await page.locator('#location_aisle').fill('1');await page.locator('#location_node').fill('p1');await page.locator('#location_shelf').fill('Al medio');
  await page.getByRole('button',{name:'Guardar ubicación',exact:true}).click();await page.waitForFunction(() => document.querySelector('#route_result').textContent.includes('Galletas ejemplo'));
  assert.ok((await page.locator('#route_result').textContent()).includes('25.0 m'));
  await page.reload();await page.waitForFunction(() => document.querySelector('#barcode_list').textContent.includes('0012345678905'));
  await page.locator('#route_branch').selectOption(branch);await page.waitForFunction(() => document.querySelector('#route_result').textContent.includes('25.0 m'));
  await page.locator('#barcode_value').fill('0012345678905');await page.getByRole('button',{name:'Buscar código',exact:true}).click();assert.equal(await page.locator('#product_id').inputValue(),product.id);
  const scanner=await page.evaluate(async () => {
   let stopped=false;
   const canvas=document.createElement('canvas');canvas.width=canvas.height=32;canvas.getContext('2d').fillRect(0,0,32,32);
   window.BarcodeDetector=class {static async getSupportedFormats(){return ['ean_13'];} async detect(){return [{rawValue:'0012345678905'}];}};
   navigator.mediaDevices.getUserMedia=async () => {
    const stream=canvas.captureStream(10);const track=stream.getTracks()[0],original=track.stop.bind(track);track.stop=() => {stopped=true;original();};return stream;
   };
   await startScanner();
   for(let i=0;i<20 && !stopped;i++) await new Promise(r => setTimeout(r,20));
   return {stopped,code:document.querySelector('#barcode_value').value,hidden:document.querySelector('#scan_video').hidden};
  });
  assert.equal(scanner.stopped,true);assert.equal(scanner.code,'0012345678905');assert.equal(scanner.hidden,true);
  // Verificar desconocido y reconocimiento sugerido por una referencia sintética.
  await page.locator('#barcode_value').fill('0099999999999');await page.getByRole('button',{name:'Buscar código',exact:true}).click();assert.equal(await page.locator('#new_barcode').inputValue(),'0099999999999');
  await page.locator('#assist_product').selectOption(product.id);
  await page.evaluate(async () => {
   const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,64,64);ctx.fillStyle='white';ctx.fillRect(16,16,32,32);
   const blob=await new Promise(resolve => canvas.toBlob(resolve,'image/png'));const file=new File([blob],'producto.png',{type:'image/png'});
   await saveReferencePhoto(file);await suggestPhoto(file);
  });
  assert.ok((await page.locator('#photo_results').textContent()).includes('Elegir Galletas ejemplo'));
  // Ruta por tramos reales, fríos al final y nodos desconectados explícitos.
  const checks=await page.evaluate(() => {
   const map={nodes:['e','f','a','c','x'].map(id => ({id,label:id})),edges:[{source:'e',target:'f',distance:1},{source:'f',target:'a',distance:1},{source:'a',target:'c',distance:1}],entrance:'e',checkout:'c'};
   const route=planRoute(map,[{node_id:'f',cold:true,title:'Frío'},{node_id:'a',cold:false,title:'Seco'},{node_id:'x',cold:false,title:'Desconectado'}],true);
   return {order:route.steps.map(s => s.item.title),unreachable:route.unreachable.map(s => s.title),total:route.total};
  });
  assert.deepEqual(checks.order,['Seco','Frío']);assert.deepEqual(checks.unreachable,['Desconectado']);assert.equal(checks.total,5);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=window.innerWidth));assert.deepEqual(errors,[]);
  console.log('OK: barcode y ceros offline, sucursal, mapa, ubicación, recarga, código desconocido, foto similar, caminos y fríos al final.');
 } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
