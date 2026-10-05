const {chromium}=require('C:/Users/nical/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async () => {
    const browser=await chromium.launch({headless:true,channel:'msedge'});
    const context=await browser.newContext(); const page=await context.newPage(); const errors=[];
    page.on('pageerror',e => errors.push(e.message));
    const product={id:'234ac292-f29c-4fcf-9e2e-7345499b7f87',product_all:"Galletas 'marca' <texto>",product_name:'Galletas',product_brand:'Marca',product_ptype:null,product_psubtype:null,product_class:'Galletas',presentation:'0.500000',normal_price:'1000.0000',normal_unit:'2000'};
    await page.route('**/api/catalog',r => r.fulfill({json:[product]}));
    try {
        await page.goto('http://127.0.0.1:8765/home');
        await page.waitForFunction(() => document.querySelectorAll('#data_table tr').length===1);
        await page.locator('#data_table button').click();
        await page.locator('#new_price').fill('1000');
        for (const [id,qty,total] of [['2x1','2','1000.0000'],['3x2','3','2000.0000'],['4x3','4','3000.0000'],['2_50%','2','1500.0000'],['2_80%','2','1200.0000']]) {
            await page.locator(`[id="${id}"]`).check();
            await page.locator('button[onclick="compare_prices()"]').click();
            assert.equal(await page.locator('#quantity').inputValue(),qty);
            assert.equal(await page.locator('#purchase_total').inputValue(),total);
        }
        await page.locator('[id="3x2"]').check();
        await page.locator('button[onclick="compare_prices()"]').click();
        assert.equal(await page.locator('#price').inputValue(),'666.6667');
        await page.locator('#new_price').fill('');
        await page.locator('button[onclick="compare_prices()"]').click();
        assert.ok((await page.locator('#comparison_result').textContent()).includes('número válido'));
        await page.locator('#new_price').fill('1000'); await page.locator('#new_presentation').fill('0.25');
        const before=await page.locator('#price').inputValue();
        await page.locator('button[onclick="compare_prices()"]').click();
        assert.equal(await page.locator('#price').inputValue(),before);
        assert.ok((await page.locator('#comparison_result').textContent()).includes('presentación es diferente'));
        await page.locator('#search').fill(''); await page.locator('#data_table button').click();
        assert.equal(await page.locator('#purchase_total').inputValue(),'');
        assert.equal(await page.locator('#new_presentation').inputValue(),'');
        await context.setOffline(true);
        await page.locator('#quantity').fill('3'); await page.locator('#purchase_total').fill('2000'); await page.locator('#market').fill('Prueba');
        await page.getByRole('button',{name:'Guardar compra',exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#sync_status').textContent.includes('1 pendientes'));
        const queue=await page.evaluate(() => localRead('outbox'));
        assert.equal(queue[0].payload.total_paid,'2000.0000'); assert.equal(queue[0].payload.price,'666.6667');
        assert.equal(await page.locator('#product_id').inputValue(),'');
        assert.deepEqual(errors,[]);
        console.log('OK: cinco promociones, total exacto, entradas vacías, distinta presentación, selección limpia y compra desde importe total sin conexión.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
