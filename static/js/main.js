// Estado de la selección y cálculos decimales; persistencia en offline.js.
let selected_id = null, selected_product = null, selected_brand = null;
let selected_ptype = null, selected_psubtype = null, selected_presentation = null;
let selected_normal_price = null, selected_normal_unit = null, selected_class_filter = null;
let selected_product_filter=null,selected_brand_filter=null,class_filter_active=false,product_filter_active=false;
let catalog_filter_mode='date',catalog_filters_open=true;
let db = null;
let selected_sale_mode=null;
let comparison_product=null;

function scaledDecimal(value, places, positive = false) {
    const text = String(value ?? '').trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(text)) throw new Error('Ingresá un número válido, sin signos ni separadores de miles');
    const [whole, fraction = ''] = text.split('.');
    if (fraction.length > places && /[1-9]/.test(fraction.slice(places))) throw new Error(`Usá como máximo ${places} decimales`);
    const result = BigInt(whole) * 10n ** BigInt(places) + BigInt((fraction.slice(0, places) + '0'.repeat(places)).slice(0, places) || '0');
    if (result >= 10n ** 18n || (positive && result === 0n)) throw new Error('El valor debe ser positivo y estar dentro del rango permitido');
    return result;
}
function decimalText(value, places) {
    const sign = value < 0n ? '-' : '';
    const digits = (value < 0n ? -value : value).toString().padStart(places + 1, '0');
    return sign + (places ? digits.slice(0, -places) + '.' + digits.slice(-places) : digits);
}
function roundedDivide(numerator, denominator) {
    if (denominator <= 0n) throw new Error('Cantidad inválida');
    return (numerator + denominator / 2n) / denominator;
}
function decimalInput(value, places, positive = false) {
    return decimalText(scaledDecimal(value, places, positive), places);
}
function convertedInput(id, checkbox) {
    const raw = scaledDecimal(document.getElementById(id).value, 6, true);
    if (document.getElementById(checkbox).checked && raw % 1000n !== 0n) throw new Error('La conversión requiere más de seis decimales');
    return decimalText(document.getElementById(checkbox).checked ? raw / 1000n : raw, 6);
}
function adjustedPrice(value, subtractCent) {
    const price = scaledDecimal(value, 4);
    if (subtractCent && price < 100n) throw new Error('El precio no permite restar $0,01');
    return decimalText(price - (subtractCent ? 100n : 0n), 4);
}
function fractionalPurchaseValues(priceValue,totalValue,subtractCent=false) {
    const price=adjustedPrice(priceValue,subtractCent),unitPrice=scaledDecimal(price,4,true);
    const total_paid=decimalInput(totalValue,4,true);
    const quantity=decimalText(roundedDivide(scaledDecimal(total_paid,4)*1000000n,unitPrice),6);
    scaledDecimal(quantity,6,true);
    return {price,total_paid,quantity,quantity_from_total:true};
}
function updatePurchaseQuantityCaption() {
    const input=document.getElementById('quantity');
    document.getElementById('purchase_quantity_caption').textContent=input.placeholder+(input.value ? ': '+formatDisplayDecimal(String(Number(input.value))) : '');
}
function updateFractionalPurchasePreview() {
    const output=document.getElementById('purchase_fractional_amount');
    output.hidden=selected_sale_mode!=='fractional';
    if(output.hidden) return;
    try {
        const quantity=decimalInput(document.getElementById('quantity').value,6,true);
        const unit=document.getElementById('initial_unit').value==='g' ? 'g' : 'ml';
        output.textContent='Cantidad comprada: '+formatDisplayDecimal(decimalText(scaledDecimal(quantity,6)*1000n,6).replace(/\.?0+$/,''))+' '+unit;
    } catch(error) {output.textContent='Ingresá la cantidad en kg o litros.';}
    updatePurchaseQuantityCaption();
}
function purchasePromotionCode() {return document.querySelector('input[name="purchase_promotion"]:checked')?.value || 'none';}
function setPurchasePromotion(code) {
    const choices=[...document.querySelectorAll('input[name="purchase_promotion"]')];
    (choices.find(input=>input.value===code) || choices[0]).checked=true;
    document.getElementById('purchase_promotions_enabled').checked=purchasePromotionCode()!=='none';
}
function togglePurchasePromotions() {
    setPurchasePromotion(document.getElementById('purchase_promotions_enabled').checked ? 'offer' : 'none');
    updatePurchasePromotion(true);
}
function purchaseAmounts(product) {
    const code=purchasePromotionCode(),is_promotion=code!=='none';
    const input=id=>document.getElementById(id);
    const description=document.querySelector('input[name="purchase_promotion"]:checked')?.nextElementSibling?.textContent || '';
    if(product.sale_mode==='fractional') {
        if(!['none','offer'].includes(code)) throw new Error('Para fraccionados usá Sin promoción u Oferta');
        if(input('purchase_total').value) return {...fractionalPurchaseValues(input('price').value,input('purchase_total').value,input('checkbox_99').checked),is_promotion,promotion_description:is_promotion ? description : null};
        const price=adjustedPrice(input('price').value,input('checkbox_99').checked),quantity=decimalInput(input('quantity').value,6,true);
        scaledDecimal(price,4,true);
        const total_paid=decimalText(roundedDivide(scaledDecimal(price,4)*scaledDecimal(quantity,6),1000000n),4);
        return {price,quantity,total_paid,is_promotion,promotion_description:is_promotion ? description : null};
    }
    if(code==='special') {
        const offer=readSpecialOffer('purchase');
        return {quantity:decimalText(offer.units*1000000n,6),price:decimalText(roundedDivide(offer.total,offer.units),4),total_paid:decimalText(offer.total,4),is_promotion:true,promotion_description:offer.description};
    }
    const quantity=convertedInput('quantity','checkbox_quantity_1_1000'),q=scaledDecimal(quantity,6,true);
    let total;
    if(input('purchase_total').value) total=scaledDecimal(input('purchase_total').value,4);
    else {
        const unit=scaledDecimal(adjustedPrice(input('price').value || product.normal_price,input('checkbox_99').checked),4);
        if(['none','offer'].includes(code)) total=roundedDivide(unit*q,1000000n);
        else {
            if(q%1000000n!==0n) throw new Error('Esta promoción requiere una cantidad entera de envases o unidades');
            const [bundle,n,d]=shelfPromotion(code),count=q/1000000n;
            total=(roundedDivide(unit*n,d*100n)*(count/bundle)+roundedDivide(unit*(count%bundle),100n))*100n;
        }
    }
    return {quantity,total_paid:decimalText(total,4),price:decimalText(roundedDivide(total*1000000n,q),4),is_promotion,promotion_description:is_promotion ? description : null};
}
function updatePurchasePromotion(resetQuantity=false) {
    const input=id=>document.getElementById(id),fractional=selected_sale_mode==='fractional';
    for(const choice of document.querySelectorAll('input[name="purchase_promotion"]')) choice.disabled=fractional && !['none','offer'].includes(choice.value);
    if(document.querySelector('input[name="purchase_promotion"]:checked')?.disabled) setPurchasePromotion('none');
    const code=purchasePromotionCode(),special=code==='special';
    input('purchase_promotions').hidden=!input('purchase_promotions_enabled').checked;
    input('purchase_special_fields').hidden=!special;input('price').disabled=special;input('checkbox_99').disabled=special;
    input('purchase_total').disabled=special;input('quantity').readOnly=special;
    input('price').required=fractional;input('purchase_total').required=false;
    input('checkbox_quantity_1_1000').disabled=special || !['none','offer'].includes(code);
    if(input('checkbox_quantity_1_1000').disabled) input('checkbox_quantity_1_1000').checked=false;
    if(resetQuantity) {
        input('purchase_total').value='';
        if(!['none','offer','special'].includes(code)) input('quantity').value=shelfPromotion(code)[0].toString();
    }
    const result=input('purchase_promotion_result');result.textContent='';
    updatePurchaseQuantityCaption();
    if(code==='none') return;
    try {
        const values=purchaseAmounts({sale_mode:selected_sale_mode});
        if(special) input('quantity').value=values.quantity;
        updatePurchaseQuantityCaption();
        result.textContent='Precio efectivo por '+(fractional ? input('initial_unit').value==='g' ? 'kg' : 'litro' : selected_sale_mode==='unit' ? 'unidad' : 'envase')+': '+formatProductPrice(values.price)+'. Total: '+formatProductPrice(values.total_paid)+'.';
    } catch(error) {result.textContent=error.message;}
}
document.querySelectorAll('input[name="purchase_promotion"]').forEach(input=>input.addEventListener('change',()=>updatePurchasePromotion(true)));
for(const name of ['quantity','total','description']) document.getElementById('purchase_special_'+name).addEventListener('input',()=>updatePurchasePromotion(false));
function resetCatalogFilters() {selected_class_filter=null;selected_product_filter=null;selected_brand_filter=null;class_filter_active=false;product_filter_active=false;catalog_filter_mode='date';catalog_filters_open=true;}
function setCatalogFilter(field,value) {
    const order=catalog_filter_mode==='brand' ? ['brand','product','class'] : ['class','product','brand'];
    const state={class:selected_class_filter,product:selected_product_filter,brand:selected_brand_filter};
    state[field]=value;for(const key of order.slice(order.indexOf(field)+1)) state[key]=null;
    selected_class_filter=state.class;selected_product_filter=state.product;selected_brand_filter=state.brand;
    class_filter_active=selected_class_filter!==null;product_filter_active=selected_product_filter!==null;leaveCatalogFocus();read_products();
}
function apply_class_filter(filter) {setCatalogFilter('class',filter);}
function leaveCatalogFocus() {closeProductEditor(false);closeShelfPrice(false);actionProductId=null;document.getElementById('product_actions').hidden=true;}
function apply_product_filter(filter) {setCatalogFilter('product',filter);}
function apply_brand_filter(filter) {setCatalogFilter('brand',filter);}
function switchCatalogMode(mode) {resetCatalogFilters();catalog_filter_mode=['type','brand','date'].includes(mode) ? mode : 'date';leaveCatalogFocus();read_products();}
function clearActiveFilters() {resetCatalogFilters();leaveCatalogFocus();read_products();}

function compare_prices() {
    const result = document.getElementById('comparison_result');
    document.getElementById('compare_register_shelf').hidden=true;
    result.classList.remove('comparison-cheaper','comparison-costlier','comparison-equal','comparison-best-a','comparison-best-b');
    try {
        updateComparisonCentCheckbox();
        const referenceInput=document.getElementById('compare_product_reference').value;
        const referencePrice=referenceInput.trim()==='' ? '' : adjustedPrice(referenceInput,document.getElementById('checkbox_compare_a_9_99').checked);
        const contentUnit=document.getElementById('compare_content_unit').value;
        const contentFactor=['g','ml'].includes(contentUnit) ? 1000n : 1n;
        const special=document.getElementById('special').checked ? readSpecialOffer('compare') : null;
        const price = special ? 0n : scaledDecimal(adjustedPrice(document.getElementById('new_price').value, document.getElementById('checkbox_new_price_9_99').checked), 4);
        const oldPresentation = scaledDecimal(document.getElementById('compare_product_content').value, 6, true);
        const presentation = scaledDecimal(document.getElementById('new_presentation').value, 6, true);
        const promotions = {'offer':[1n,1n,1n],'2x1':[2n,1n,1n], '3x2':[3n,2n,1n], '4x3':[4n,3n,1n], '2_50%':[2n,3n,2n], '2_80%':[2n,6n,5n]};
        const selected = document.querySelector('input[name="promotion"]:checked');
        const [units, paidNumerator, paidDenominator] = special ? [special.units,1n,1n] : selected ? promotions[selected.id] : [1n,1n,1n];
        // Redondear el importe del conjunto a centavos; distribuir después entre unidades.
        const total = special ? special.total : roundedDivide(price * paidNumerator, paidDenominator * 100n) * 100n;
        const effective = roundedDivide(total, units);
        const normalized = Number(total) * 1e6 / Number(units * presentation) / 1e4;
        const oldNormalized = referencePrice.trim()==='' ? 0 : Number(scaledDecimal(referencePrice,4)) * 1e6 / Number(oldPresentation) / 1e4;
        const variation = oldNormalized > 0 ? ((normalized-oldNormalized)/oldNormalized*100).toFixed(2)+'%' : 'Sin referencia porcentual (precio anterior cero)';
        result.replaceChildren();
        const unit={g:'kg',kg:'kg',ml:'litro',l:'litro',unit:'unidad'}[contentUnit];
        const money=formatCents;
        const average=money(roundedDivide(total,units*100n));
        const normalizedCents=roundedDivide(total*1000000n*contentFactor,units*presentation*100n);
        const normalCents=referencePrice.trim()==='' ? null : roundedDivide(scaledDecimal(referencePrice,4)*1000000n*contentFactor,oldPresentation*100n);
        let difference=null;
        if(referencePrice.trim()!=='') {
            const reference=scaledDecimal(referencePrice,4);
            const delta=total*oldPresentation-reference*units*presentation;
            difference=delta>0n ? 1 : delta<0n ? -1 : 0;
            result.classList.add(difference>0 ? 'comparison-costlier' : difference<0 ? 'comparison-cheaper' : 'comparison-equal');
        }
        const percentage=oldNormalized>0 ? `${difference>0 ? '+' : ''}${formatDisplayDecimal(variation.slice(0,-1))}%` : 'No disponible';
        let lines=[
            `Producto A: ${normalCents===null ? 'Sin precio de referencia' : money(normalCents)+' por '+unit}.`,
            `Producto B: ${money(normalizedCents)} por ${unit}.`,
            `Variación: ${percentage}.`
        ];
        if(!comparison_product) {
            result.classList.remove('comparison-cheaper','comparison-costlier');
            if(difference===null) {
                lines=['Ingresá el precio de A para saber cuál conviene.'];
            } else if(difference===0) {
                lines=['Los productos A y B cuestan lo mismo por unidad de contenido.'];
            } else {
                // Ahorro relativo al más caro: el mismo criterio gane A o gane B.
                const aCost=scaledDecimal(referencePrice,4)*units*presentation;
                const bCost=total*oldPresentation;
                const high=aCost>bCost ? aCost : bCost;
                const low=aCost<bCost ? aCost : bCost;
                const savings=decimalText(roundedDivide((high-low)*10000n,high),2);
                const winner=difference>0 ? 'A' : 'B';
                result.classList.add(winner==='A' ? 'comparison-best-a' : 'comparison-best-b');
                lines=[`El producto ${winner} es mejor (${formatDisplayDecimal(savings)}%).`];
            }
        }
        if(selected) {
            const offerLine=comparison_product
                ? `Precio con oferta: ${money(normalizedCents)} por ${unit}.`
                : `Precio con oferta: ${average} por unidad.`;
            if(comparison_product) lines[1]=`Producto B · ${offerLine}`;
            else lines.push(offerLine);
        }
        for(const text of lines) {const line=document.createElement('p');line.textContent=text;result.append(line);}
        document.getElementById('compare_register_shelf').hidden=false;
        if (!comparison_product || !selected_id || comparison_product.sale_mode==='fractional') return;
        const catalogContent=scaledDecimal(comparison_product.presentation,6,true);
        if (roundedDivide(presentation,contentFactor) !== catalogContent) {
            return;
        }
        document.getElementById('price').value = special ? '' : decimalText(price,4);
        document.getElementById('purchase_total').value = decimalText(total,4);
        document.getElementById('quantity').value = units.toString();
        document.getElementById('checkbox_quantity_1_1000').checked = false;
        document.getElementById('checkbox_99').checked = false;
        setPurchasePromotion(selected?.id || 'none');
        if(special) {
            document.getElementById('purchase_special_quantity').value=special.units.toString();
            document.getElementById('purchase_special_total').value=decimalText(special.total/100n,2);
            document.getElementById('purchase_special_description').value=special.description;
        }
        updatePurchasePromotion(false);
    } catch (error) { result.textContent = error.message; }
    finally {
        if(document.activeElement?.closest('.compare-card')) document.activeElement.blur();
        requestAnimationFrame(()=>document.getElementById('comparison_report').scrollIntoView({
            behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
            block:'center'
        }));
    }
}
function another_similar_product_aux(checkboxID, inputID, value) {
    document.getElementById(inputID).value = document.getElementById(checkboxID).checked ? value ?? '' : '';
    document.getElementById(inputID).editorCaptionUpdate?.();
}
function another_similar_product() {
    for (const [field,value] of [['product',selected_product],['brand',selected_brand],['ptype',selected_ptype],['psubtype',selected_psubtype]]) {
        another_similar_product_aux('checkbox_'+field,field,value);
    }
}
function clearComparison() {
    comparison_product=null;
    document.getElementById('compare_register_shelf').hidden=true;
    document.getElementById('checkbox_compare_a_9_99').checked=false;
    document.getElementById('compare_promotions_enabled').checked=false;
    document.getElementById('compare_promotions').hidden=true;
    document.getElementById('compare_product_label').textContent='Presentación A';
    document.getElementById('compare_content_unit').value='kg';
    document.getElementById('compare_product_reference').value='';
    document.getElementById('compare_product_content').value='';
    for (const id of ['new_price','new_presentation','purchase_total']) document.getElementById(id).value = '';
    document.getElementById('comparison_result').textContent = '';
    document.querySelectorAll('input[name="promotion"]').forEach(input => input.checked = false);
    for(const name of ['quantity','total','description']) document.getElementById('compare_special_'+name).value='';
    updateSpecialPromotion();
    updateComparisonCentCheckbox();
    updateComparisonFieldCaptions();
}
function updateComparisonFieldCaptions() {
    const clearButton=document.getElementById('compare_clear_floating');
    clearButton.hidden=![...document.querySelectorAll('.compare-card input[type="text"],.compare-card textarea')].some(field=>field.value.trim());
    for(const input of document.querySelectorAll('.compare-card [data-caption]')) {
        let value=input.value;
        if(['new_presentation','compare_product_content'].includes(input.id)) {
            input.dataset.caption='Contenido por envase';
            input.placeholder=input.dataset.caption;
        }
        if(value && ['new_price','compare_special_total','compare_product_reference'].includes(input.id)) {
            try {value=formatProductPrice(value);} catch(_) {}
        } else if(value && input.tagName!=='TEXTAREA') value=formatDisplayDecimal(String(Number(value.replace(',','.'))));
        let hint='';
        if(comparison_product && ['new_price','new_presentation'].includes(input.id)) {
            const source=document.getElementById(input.id==='new_price' ? 'compare_product_reference' : 'compare_product_content').value;
            if(source) {
                try {hint=input.id==='new_price' ? formatProductPrice(source) : formatDisplayDecimal(String(Number(source.replace(',','.'))));} catch(_) {}
            }
        }
        input.placeholder=hint || input.dataset.caption;
        input.closest('.compare-field').querySelector('.editor-field-caption').textContent=value || hint || input.dataset.caption;
    }
}
document.querySelectorAll('.compare-card [data-caption]').forEach(input=>input.addEventListener('input',updateComparisonFieldCaptions));
document.getElementById('compare_content_unit').addEventListener('change',updateComparisonFieldCaptions);
updateComparisonFieldCaptions();
function updateComparisonCentCheckbox() {
    for(const [inputId,checkboxId] of [['new_price','checkbox_new_price_9_99'],['compare_product_reference','checkbox_compare_a_9_99']]) {
        const checkbox=document.getElementById(checkboxId);
        let enabled=false;
        try {
            const amount=scaledDecimal(document.getElementById(inputId).value,4,true);
            enabled=amount%100000n===0n && (inputId!=='new_price' || !document.getElementById('special').checked);
        } catch(_) {}
        checkbox.disabled=!enabled;
        if(!enabled) checkbox.checked=false;
        checkbox.title=enabled ? 'Restar $0,01 para obtener un precio terminado en 9,99' : 'Disponible cuando el precio es un múltiplo de 10, como 1000 o 1950';
    }
}

function readSpecialOffer(prefix) {
    const units=scaledDecimal(document.getElementById(prefix+'_special_quantity').value,0,true);
    if(units>1000000n) throw new Error('La cantidad no puede superar 1.000.000');
    const total=scaledDecimal(document.getElementById(prefix+'_special_total').value,2)*100n;
    const description=document.getElementById(prefix+'_special_description').value.trim();
    if(!description || description.length>500) throw new Error('Describí la promoción (hasta 500 caracteres)');
    return {units,total,description};
}
function toggleComparisonPromotions() {
    const enabled=document.getElementById('compare_promotions_enabled').checked;
    document.getElementById('compare_promotions').hidden=!enabled;
    if(!enabled) document.querySelectorAll('input[name="promotion"]').forEach(input=>input.checked=false);
    document.getElementById('comparison_result').textContent='';
    updateSpecialPromotion();
}
function updateSpecialPromotion() {
    const compare=document.getElementById('special').checked,shelf=document.getElementById('shelf_promotion').value==='special';
    document.getElementById('compare_special_fields').hidden=!compare;document.getElementById('new_price').disabled=compare;
    document.getElementById('shelf_special_fields').hidden=!shelf;document.getElementById('shelf_price').disabled=shelf;
    document.getElementById('shelf_subtract_cent').disabled=shelf;
    updateComparisonCentCheckbox();
}
document.querySelectorAll('input[name="promotion"]').forEach(input=>input.addEventListener('change',updateSpecialPromotion));
function reset_form() {
    for (const id of ['search','product','brand','ptype','psubtype','new_package_content','product_id','price']) document.getElementById(id).value = '';
    document.getElementById('price').placeholder='Ingresá el precio';
    document.getElementById('purchase_product_label').textContent='Seleccioná un producto';
    if (!document.getElementById('checkbox_market').checked) document.getElementById('market').value = '';
    document.getElementById('quantity').value = '1';
    for (const id of ['checkbox_quantity_1_1000','checkbox_99']) document.getElementById(id).checked = false;
    setPurchasePromotion('none');
    for(const name of ['quantity','total','description']) document.getElementById('purchase_special_'+name).value='';
    updatePurchasePromotion(false);
    selected_id = selected_product = selected_brand = selected_ptype = selected_psubtype = selected_presentation = selected_normal_price = selected_normal_unit = selected_all = null;
    selected_sale_mode=null;
    updatePurchasePromotion(false);
    updateFractionalPurchasePreview();
    resetCatalogFilters();clearComparison();read_products();
    document.getElementById('new_barcode').value='';
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(error => console.error('Service worker:',error));

function scrollToPromotionActions(target) {
    if(!target) return;
    document.activeElement?.blur();
    requestAnimationFrame(()=>target.scrollIntoView({
        behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block:'end'
    }));
}
document.querySelectorAll('input[name="promotion"]').forEach(input=>input.addEventListener('change',()=>{
    if(input.checked) scrollToPromotionActions(document.querySelector('.compare-actions'));
}));
document.querySelectorAll('input[name="purchase_promotion"]').forEach(input=>input.addEventListener('change',()=>{
    if(input.checked && input.value!=='none') scrollToPromotionActions(document.getElementById('purchase_buy_button'));
}));
document.getElementById('shelf_promotion').addEventListener('change',event=>{
    if(event.target.value!=='none') scrollToPromotionActions(document.querySelector('#shelf_price_form button[onclick="saveShelfPrice()"]'));
});
