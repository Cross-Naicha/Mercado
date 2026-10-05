const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async () => {
    const browser=await chromium.launch({headless:true,channel:'msedge'}), context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
    const errors=[]; page.on('pageerror',e => errors.push(e.message));
    const product={id:'797051b0-472c-4cd2-99c0-3172db57a68f',product_all:'Galletas prueba',product_name:'Galletas',product_brand:'Prueba',presentation:'0.500000',normal_price:'1000.0000',normal_unit:'2000',sale_mode:'package',content_unit:'g',package_content:'500.000000',unit_status:'confirmed',revision:1};
    let state={lots:[],movements:[],preferences:[],confirmed_operations:[]},allowSync=false; const confirmed=new Set();
    await page.route('**/api/catalog',r => r.fulfill({json:[product]}));
    await page.route('**/api/stock',r => r.fulfill({json:{...state,confirmed_operations:[...confirmed]}}));
    await page.route('**/api/sync',r => {
        if (!allowSync) return r.abort();
        const op=r.request().postDataJSON(); confirmed.add(op.operation_id);
        return r.fulfill({json:{operation_id:op.operation_id,entity_id:op.entity_id,status:'confirmed'}});
    });
    try {
        await page.goto('http://127.0.0.1:8765/home');
        await page.waitForFunction(() => document.querySelectorAll('#data_table tr').length===1);
        await page.evaluate(() => navigator.serviceWorker.ready); await page.reload();
        await page.waitForFunction(() => document.querySelectorAll('#stock_product option').length===2);
        await context.setOffline(true); await page.locator('#stock_product').selectOption(product.id);
        await page.waitForFunction(() => document.querySelector('#stock_selected').textContent.includes('confirmada'));
        async function initial(quantity,date) {
            await page.locator('#initial_quantity').fill(quantity); await page.locator('#initial_expiry').fill(date);
            await page.getByRole('button',{name:'Agregar stock inicial',exact:true}).click();
            await page.waitForFunction(() => document.querySelector('#initial_quantity').value==='');
        }
        await initial('200','2020-01-01'); await initial('500','2027-01-01');
        const lot=(await page.evaluate(() => projectedStock())).lots.find(l => l.expires_on==='2027-01-01');
        await page.locator('#movement_lot').selectOption(lot.id); await page.locator('#movement_quantity').fill('150');
        await page.getByRole('button',{name:'Guardar movimiento',exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#movement_quantity').value==='');
        await page.locator('#stock_minimum').fill('1000'); await page.getByRole('button',{name:'Guardar mínimo',exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#shopping_list').textContent.includes('650.000000'));
        await page.reload(); await page.waitForFunction(() => document.querySelector('#shopping_list').textContent.includes('650.000000'));
        await page.locator('#data_table button').click();
        await page.waitForFunction(() => document.querySelector('#add_to_stock').checked);
        await page.locator('#price').fill('1000'); await page.locator('#quantity').fill('2'); await page.locator('#market').fill('Prueba');
        await page.getByRole('button',{name:'Guardar compra',exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#stock_list').textContent.includes('1550.000000'));
        state=await page.evaluate(() => projectedStock());
        const queued=(await page.evaluate(() => localRead('outbox'))).length;
        assert.equal(queued,5);
        // Recuperar el mismo respaldo dos veces no repite operaciones ni movimientos.
        const backup=await page.evaluate(async () => ({format:'mercado-local-v3',catalog:await localRead('catalog'),outbox:await localRead('outbox'),stock_cache:await localRead('stock_cache'),stock_effects:await localRead('stock_effects'),shopping_manual:[]}));
        await page.evaluate(async data => { const file=new File([JSON.stringify(data)],'backup.json',{type:'application/json'}); await import_local_backup(file); await import_local_backup(file); },backup);
        assert.equal((await page.evaluate(() => localRead('outbox'))).length,5);
        allowSync=true; await context.setOffline(false); await page.waitForFunction(() => !syncing); await page.evaluate(() => sync_pending());
        await page.waitForFunction(() => document.querySelector('#sync_status').textContent.startsWith('0 pendientes'));
        assert.equal((await page.evaluate(() => localRead('stock_effects'))).length,0);
        assert.ok((await page.locator('#stock_list').textContent()).includes('1550.000000'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=window.innerWidth),'La pantalla no debe desbordar horizontalmente');
        assert.deepEqual(errors,[]);
        console.log('OK: stock inicial, vencidos, consumo, mínimos, compra, recarga offline, importación repetida y reconciliación sin duplicar.');
    } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
