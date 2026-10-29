function historyEntries(row,now=Date.now()) {
    const cutoff=now-90*86400000;
    return (row.price_history || []).filter(entry=>{
        const time=Date.parse(entry.occurred_at);
        return time>=cutoff && time<=now && entry.price!=null && Number.isFinite(Number(entry.price)) && Number(entry.price)>=0;
    }).sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at) || a.id.localeCompare(b.id));
}
function historyStatistics(entries) {
    if(!entries.length) return null;
    const values=entries.map(entry=>scaledDecimal(entry.price,4));
    const first=values[0],last=values[values.length-1];
    return {min:values.reduce((a,b)=>a<b ? a : b),max:values.reduce((a,b)=>a>b ? a : b),average:roundedDivide(values.reduce((a,b)=>a+b,0n),BigInt(values.length)),variation:first===0n ? null : Number(last-first)/Number(first)*100};
}
function renderPriceHistory(row) {
    const panel=document.createElement('section');panel.className='price-history';panel.setAttribute('aria-label','Histórico de precios de '+row.product_all);
    const header=document.createElement('div');header.className='history-heading';
    const title=document.createElement('strong');title.textContent='Últimos 90 días';
    const exit=document.createElement('button');exit.type='button';exit.textContent='↗';exit.setAttribute('aria-label','Desactivar modo Histórico');exit.onclick=()=>setHistoryMode(false);header.append(title,exit);panel.append(header);
    const entries=historyEntries(row),stats=historyStatistics(entries);
    const money=value=>'$'+Number(decimalText(value,4)).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
    const basis=row.sale_mode==='fractional' ? (row.content_unit==='g' ? 'por kg' : 'por litro') : 'por unidad';
    if(!stats) {const empty=document.createElement('p');empty.textContent='Sin registros en los últimos 90 días. Sincronizá con la PC para descargar el historial.';panel.append(empty);return panel;}
    const summary=document.createElement('div');summary.className='history-stats';
    for(const [label,value] of [['Mínimo',stats.min],['Promedio',stats.average],['Máximo',stats.max]]) {
        const cell=document.createElement('div'),caption=document.createElement('span'),amount=document.createElement('strong');caption.textContent=label;amount.textContent=money(value);cell.append(caption,amount);summary.append(cell);
    }
    panel.append(summary);
    const meta=document.createElement('p');meta.className='history-meta';
    meta.textContent=entries.length+' registro'+(entries.length===1 ? '' : 's')+' · '+basis+' · Promedio por registro';panel.append(meta);
    const variation=document.createElement('p');variation.className='history-variation';
    variation.textContent=entries.length<2 ? 'Variación: falta otro registro' : stats.variation===null ? 'Variación: precio inicial $0' : 'Variación: '+(stats.variation>0 ? '+' : '')+stats.variation.toLocaleString('es-AR',{maximumFractionDigits:2})+'% respecto del primer registro';panel.append(variation);
    const list=document.createElement('ol');list.className='history-list';
    for(const entry of [...entries].reverse()) {
        const line=document.createElement('li'),detail=document.createElement('div'),date=document.createElement('time'),market=document.createElement('span'),price=document.createElement('strong');
        date.dateTime=entry.occurred_at;date.textContent=new Date(entry.occurred_at).toLocaleDateString('es-AR',{timeZone:entry.event_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone});market.textContent=entry.market;detail.append(date,market);price.textContent=money(scaledDecimal(entry.price,4));line.append(detail,price);list.append(line);
    }
    panel.append(list);return panel;
}
