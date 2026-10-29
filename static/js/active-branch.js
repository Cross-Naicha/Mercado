// Una sucursal activa para compras, precios, lista y mapas.
(function(){
    window.mercadoActiveBranch=window.mercadoActiveBranch??'';
    const nav=document.getElementById('navbar'),settings=document.getElementById('tab-settings');
    const button=document.createElement('button');button.id='active_branch_toggle';button.type='button';button.textContent='S';button.setAttribute('aria-label','Elegir supermercado');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','active_branch_picker');
    const picker=document.createElement('div');picker.id='active_branch_picker';picker.hidden=true;
    const select=document.createElement('select');select.id='active_branch_select';select.setAttribute('aria-label','Supermercado para todas las funciones');
    const status=document.createElement('span');status.className='sr-only';status.setAttribute('role','status');
    picker.append(select);settings.before(picker,button);nav.after(status);
    let generation=0;
    function close(focus=false){picker.hidden=true;nav.classList.remove('choosing-branch');button.setAttribute('aria-expanded','false');if(focus)button.focus();}
    async function refresh(){
        const token=++generation;
        try{
            const state=await shoppingState();if(token!==generation)return;
            select.replaceChildren(new Option(state.branches.length?'Elegí un supermercado':'Registrá un local en Supermercados',''));
            for(const branch of [...state.branches].sort((a,b)=>(a.name+' '+a.address).localeCompare(b.name+' '+b.address,'es')))select.add(new Option(branch.name+' · '+(branch.address||'Local sin confirmar'),branch.id));
            select.value=window.mercadoActiveBranch;
            const current=state.branches.find(branch=>branch.id===select.value),name=current?current.name+' · '+(current.address||'Local sin confirmar'):'Sin supermercado elegido';
            button.title=name;button.setAttribute('aria-label','Elegir supermercado: '+name);button.classList.toggle('has-branch',!!current);
        }catch(_){select.replaceChildren(new Option('Abriendo supermercados…',''));}
    }
    button.onclick=async()=>{if(!picker.hidden){close();return;}picker.hidden=false;nav.classList.add('choosing-branch');button.setAttribute('aria-expanded','true');await refresh();if(!picker.hidden)select.focus();};
    select.onchange=async()=>{select.disabled=true;try{await choosePurchaseBranch(select.value);status.textContent=button.title;close(true);}catch(error){notice('No se pudo elegir el supermercado: '+error.message);}finally{select.disabled=false;}};
    nav.addEventListener('keydown',event=>{if(event.key==='Escape'&&!picker.hidden){event.preventDefault();close(true);}});
    document.addEventListener('click',event=>{if(!picker.contains(event.target)&&!button.contains(event.target))close();});
    document.addEventListener('mercado-active-branch-change',()=>void refresh());
    document.addEventListener('mercado-shopping-rendered',()=>void refresh());
    void refresh();
})();
