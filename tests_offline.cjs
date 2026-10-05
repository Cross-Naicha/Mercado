const {chromium} = require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
    const browser = await chromium.launch({headless: true, channel: 'msedge'});
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto('http://127.0.0.1:8765/home');
        await page.waitForFunction(() => document.querySelectorAll('#data_table tr').length > 0);
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.reload();
        await page.waitForFunction(() => document.querySelectorAll('#data_table tr').length > 0);
        await context.setOffline(true);
        await page.locator('#product').fill("Prueba 'sin señal' <texto>");
        await page.locator('#brand').fill('Temporal');
        await page.locator('#presentation').fill('0.22');
        await page.locator('#checkbox_presentation_1_1000').uncheck();
        await page.getByRole('button', {name:'Guardar producto', exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#sync_status').textContent.includes('1 pendientes'));
        await page.locator('#price').fill('100');
        await page.locator('#checkbox_99').uncheck();
        await page.locator('#market').fill('TEST-OFFLINE');
        await page.locator('#quantity').fill('2.5');
        await page.getByRole('button', {name:'Guardar compra', exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#sync_status').textContent.includes('2 pendientes'));
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#sync_status').textContent.includes('2 pendientes'));
        const queue = await page.evaluate(() => localRead('outbox'));
        assert.equal(queue.length,2);
        const product = queue.find(op => op.kind === 'product');
        const purchase = queue.find(op => op.kind === 'purchase');
        assert.equal(purchase.payload.product_id,product.entity_id);
        assert.equal(purchase.payload.quantity,'2.500000');
        // Una falla de disco local conserva formulario y pendientes originales.
        await page.locator('#search').fill('');
        await page.locator('#data_table button').first().click();
        await page.locator('#price').fill('123');
        await page.locator('#market').fill('No debe guardarse');
        await page.evaluate(() => {
            window.realLocalTransaction = localTransaction;
            localTransaction = async () => { throw new Error('Disco lleno simulado'); };
        });
        await page.getByRole('button', {name:'Guardar compra', exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#save_status').textContent.includes('No se guardó'));
        assert.equal(await page.locator('#price').inputValue(),'123');
        assert.equal((await page.evaluate(() => localRead('outbox'))).length,2);
        await page.evaluate(() => { localTransaction = window.realLocalTransaction; });
        // Simular servidor que confirma pero pierde la primera respuesta.
        // Sin escribir datos de prueba en la base real.
        const confirmed = new Map(), sends = [];
        let dropped = false;
        await page.route('**/api/sync', async route => {
            const op = route.request().postDataJSON(); sends.push(op.operation_id);
            if (!confirmed.has(op.operation_id)) confirmed.set(op.operation_id,{operation_id:op.operation_id,entity_id:op.entity_id,legacy_id:999,status:'confirmed'});
            if (!dropped) { dropped=true; return route.abort(); }
            await route.fulfill({json:confirmed.get(op.operation_id)});
        });
        await context.setOffline(false);
        await page.waitForFunction(() => !syncing);
        await page.evaluate(() => sync_pending());
        await page.evaluate(() => sync_pending());
        assert.equal((await page.evaluate(() => localRead('outbox'))).length,0);
        assert.equal(confirmed.size,2);
        assert.ok(sends.filter(id => id === product.operation_id).length >= 2);
        assert.deepEqual(errors,[]);
        console.log('OK: catálogo offline, alta + compra dependiente, cantidad fraccionaria, recarga sin señal y respuesta perdida sin duplicar.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
