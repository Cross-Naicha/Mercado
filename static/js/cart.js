async function cartLock(action) {
    return navigator.locks ? navigator.locks.request('mercado-local-save',action) : action();
}
function openOccasionalCart(item=null) {
    const form=$('occasional_cart_form');form.dataset.itemId=item?.id || '';
    $('occasional_description').value=item?.payload.description || '';
    $('occasional_total').value=item ? item.payload.total_paid.replace('.',',') : '';
    form.hidden=false;form.scrollIntoView({behavior:'smooth',block:'center'});
}
async function saveOccasionalCart(event) {
    event.preventDefault();if(saving || !db) return;saving=true;
    try {
        const total=scaledDecimal($('occasional_total').value,2,true);
        if(total>=1000000000000000000n) throw new Error('Importe demasiado grande');
        const form=$('occasional_cart_form'),id=form.dataset.itemId || identifier();
        await cartLock(async()=>{
            const existing=(await localRead('cart')).find(row=>row.id===id);
            if(form.dataset.itemId && !existing) throw new Error('La compra ya no está en el carrito');
            await localTransaction(['cart'],tx=>tx.objectStore('cart').put({id,kind:'occasional_purchase',payload:{description:$('occasional_description').value.trim(),total_paid:decimalText(total,2)},created_at:existing?.created_at || new Date().toISOString()}));
        });
        form.hidden=true;form.reset();await renderCart();
    } catch(error) {notice('No se guardó: '+error.message);}
    finally {saving=false;}
}
async function addCartItem(payload) {
    const code=payload.is_promotion ? purchasePromotionCode() : 'none';
    const quantity_step=code==='special' ? payload.quantity : ['2x1','3x2','4x3','2_50%','2_80%'].includes(code) ? String(shelfPromotion(code)[0]) : '1';
    await cartLock(()=>localTransaction(['cart'],tx=>tx.objectStore('cart').add({id:identifier(),payload,quantity_step,pricing_quantity:payload.quantity,pricing_total:payload.total_paid,created_at:new Date().toISOString()})));
    await renderCart();
}
async function changeCartUnits(id,direction) {
    if(saving) return;
    saving=true;
    try {
        await cartLock(async()=>{
            const item=(await localRead('cart')).find(row=>row.id===id);
            if(!item) throw new Error('Este producto ya no está en el carrito');
            const product=(await localRead('catalog')).find(row=>row.id===item.payload.product_id);
            if(product?.sale_mode==='fractional') throw new Error('Los fraccionados conservan su peso o volumen');
            const p=item.payload,step=scaledDecimal(item.quantity_step || '1',6,true);
            const q=scaledDecimal(p.quantity,6,true)+BigInt(direction)*step;
            if(q<=0n) return;
            item.pricing_quantity=item.pricing_quantity || p.quantity;
            item.pricing_total=item.pricing_total || p.total_paid;
            const total=roundedDivide(scaledDecimal(item.pricing_total,4)*q,scaledDecimal(item.pricing_quantity,6,true));
            p.quantity=decimalText(q,6);p.total_paid=decimalText(total,4);
            p.price=decimalText(roundedDivide(total*1000000n,q),4);
            delete p.quantity_from_total;
            await localTransaction(['cart'],tx=>tx.objectStore('cart').put(item));
        });
        await renderCart();
    } catch(error) {notice('No se actualizó: '+error.message);}
    finally {saving=false;}
}
async function removeCartItem(id) {
    if(saving) return;
    saving=true;
    try {await cartLock(()=>localTransaction(['cart'],tx=>tx.objectStore('cart').delete(id)));await renderCart();}
    catch(error) {notice('No se quitó: '+error.message);}
    finally {saving=false;}
}
async function renderCart() {
    if(!db) return;
    const items=await localRead('cart'),products=await localRead('catalog');
    $('cart_items').replaceChildren();let total=0n;
    for(const item of items) {
        const p=item.payload,product=products.find(row=>row.id===p.product_id);
        if(item.kind==='occasional_purchase') {
            const card=document.createElement('article');card.className='cart-card';card.dataset.cartId=item.id;
            const title=document.createElement('strong');title.textContent=p.description || 'Compra ocasional';
            const overview=document.createElement('div');overview.className='cart-overview';
            const edit=document.createElement('button');edit.type='button';edit.textContent='Editar';edit.onclick=()=>openOccasionalCart(item);
            const price=document.createElement('strong');price.textContent='$'+Number(p.total_paid).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});overview.append(edit,price);
            const remove=document.createElement('button');remove.type='button';remove.className='cart-remove';remove.textContent='×';remove.setAttribute('aria-label','Quitar compra ocasional');remove.onclick=()=>removeCartItem(item.id);
            card.append(title,overview,remove);$('cart_items').append(card);total+=scaledDecimal(p.total_paid,4);continue;
        }
        const card=document.createElement('article');card.className='cart-card';card.dataset.cartId=item.id;
        const title=document.createElement('strong');title.textContent=product?.product_all || 'Producto no disponible';
        const overview=document.createElement('div');overview.className='cart-overview';
        const counter=document.createElement('div');counter.className='cart-counter';
        const count=document.createElement('span');count.textContent=Number(p.quantity).toLocaleString('es-AR',{maximumFractionDigits:6})+' '+(product?.sale_mode==='fractional' ? (product.content_unit==='g' ? 'kg' : 'L') : '');
        if(product?.sale_mode!=='fractional') {
            const minus=document.createElement('button');minus.type='button';minus.textContent='−';minus.setAttribute('aria-label','Restar unidades');minus.disabled=scaledDecimal(p.quantity,6,true)<=scaledDecimal(item.quantity_step || '1',6,true);minus.onclick=()=>changeCartUnits(item.id,-1);
            const plus=document.createElement('button');plus.type='button';plus.textContent='+';plus.setAttribute('aria-label','Sumar unidades');plus.onclick=()=>changeCartUnits(item.id,1);
            counter.append(minus,count,plus);
        } else counter.append(count);
        const price=document.createElement('strong');price.textContent='$'+Number(p.total_paid).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});overview.append(counter,price);
        const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Quitar '+(product?.product_all || 'producto')+' del carrito');remove.title='Quitar del carrito';remove.onclick=()=>removeCartItem(item.id);
        const actions=document.createElement('div');actions.className='cart-actions';actions.append(remove);
        remove.className='cart-remove';card.append(title);
        if(p.promotion_description) {const promo=document.createElement('p');promo.className='cart-meta';promo.textContent=p.promotion_description;card.append(promo);}
        card.append(overview,actions);$('cart_items').append(card);
        total+=scaledDecimal(p.total_paid,4);
    }
    if(!items.length) $('cart_items').textContent='El carrito está vacío.';
    $('cart_total').textContent='Total estimado: $'+Number(decimalText(total,4)).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
    $('cart_confirm').disabled=!items.length;
    $('tab-cart').textContent='Carrito'+(items.length ? ' ('+items.length+')' : '');
}
async function confirmCart() {
    if(saving || !db) return;
    saving=true;$('cart_confirm').disabled=true;
    let confirmed=false;
    try {
        await cartLock(async()=>{
            const items=await localRead('cart');if(!items.length) throw new Error('El carrito está vacío');
            const previous=await localRead('outbox'),products=await localRead('catalog'),state=await shoppingState();
            let sequence=Math.max(Date.now(),...previous.map(op=>(op.sequence || 0)+1));
            const operations=[];
            const cartId=identifier();
            for(const item of items) {
                const payload={...item.payload,...eventFields()},product=products.find(row=>row.id===payload.product_id);
                if(item.kind==='occasional_purchase') {
                    scaledDecimal(payload.total_paid,2,true);payload.cart_id=cartId;
                    const op={operation_id:identifier(),entity_id:identifier(),kind:'occasional_purchase',payload,created_at:new Date().toISOString(),sequence:sequence++,attempts:0,depends_on:[]};
                    operations.push({op,effect:null,id:item.id});continue;
                }
                payload.cart_id=cartId;
                if(!product) throw new Error('Un producto ya no está disponible. Quitalo del carrito');
                const branch=state.branches.find(row=>row.id===payload.branch_id);
                if(!branch) throw new Error('El local de un producto ya no está disponible');
                payload.market=(branch.name+' · '+(branch.address || 'Local sin confirmar')).slice(0,255);
                const quantity=scaledDecimal(payload.quantity,6,true);scaledDecimal(payload.total_paid,4);
                if(payload.add_to_stock) {
                    if(product.unit_status!=='confirmed') throw new Error('Confirmá la unidad de '+product.product_all);
                    if(product.revision!==payload.product_revision) throw new Error('Cambió la presentación de '+product.product_all+'. Quitalo y volvé a agregarlo');
                    const multiplier=product.sale_mode==='package' ? scaledDecimal(product.package_content,6,true) : product.sale_mode==='fractional' ? 1000000000n : 1000000n;
                    payload.stock_quantity=decimalText(roundedDivide(quantity*multiplier,1000000n),6);
                }
                const op={operation_id:identifier(),entity_id:identifier(),kind:'purchase',payload,created_at:new Date().toISOString(),sequence:sequence++,attempts:0};
                op.depends_on=previous.filter(row=>(row.kind==='product' && row.entity_id===payload.product_id) || (['settings','product_edit'].includes(row.kind) && row.payload.product_id===payload.product_id) || (row.kind==='branch' && row.entity_id===payload.branch_id)).map(row=>row.operation_id);
                operations.push({op,effect:await stockEffect(op),id:item.id});
            }
            await localTransaction(['cart','outbox','stock_effects'],tx=>{
                for(const {op,effect,id} of operations) {
                    tx.objectStore('outbox').add(op);
                    if(effect) tx.objectStore('stock_effects').put({id:op.operation_id,...effect});
                    tx.objectStore('cart').delete(id);
                }
            });
            confirmed=true;
        });
        await renderCart();await renderStock();await renderShopping();await read_products();await updateStatus();
        notice('Compra confirmada en este teléfono. Se sincronizará cuando tu PC esté disponible.');
    } catch(error) {notice(confirmed ? 'Compra guardada. Volvé a abrir para actualizar la pantalla.' : 'No se confirmó: '+error.message+'. El carrito se conservó.');}
    finally {saving=false;$('cart_confirm').disabled=!(await localRead('cart')).length;}
    if(confirmed) void sync_pending();
}
