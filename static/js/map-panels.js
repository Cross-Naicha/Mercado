// Agrupa los controles existentes sin reconstruirlos ni perder su estado.
(function(){
    const el=id=>document.getElementById('map_'+id);
    function card(nodes,title,open=false){
        nodes=nodes.filter(Boolean);if(!nodes.length)return;
        const details=document.createElement('details');details.className='map-option-card';details.open=open;
        const summary=document.createElement('summary');summary.textContent=title;
        const content=document.createElement('div');content.className='map-option-content';
        nodes[0].before(details);details.append(summary,content);content.append(...nodes);return details;
    }
    function fixedCard(details){
        const section=document.createElement('section');section.className=details.className+' map-static-card';
        const summary=details.querySelector(':scope>summary'),heading=document.createElement('div');heading.className='map-card-heading';heading.setAttribute('role','heading');heading.setAttribute('aria-level','2');heading.append(...summary.childNodes);summary.replaceWith(heading);
        section.append(...details.childNodes);details.replaceWith(section);return section;
    }
    function range(first,last){const nodes=[];for(let node=first;node;node=node.nextSibling){nodes.push(node);if(node===last)break;}return nodes;}
    const viewCard=fixedCard(card([el('branch').parentElement,el('view_draw').parentElement],'Vista',true));
    const viewContent=viewCard.querySelector('.map-option-content');viewContent.classList.add('map-view-row');
    el('view_draw').parentElement.classList.add('map-view-buttons');
    const branchField=el('branch').parentElement;el('branch').hidden=true;el('branch').tabIndex=-1;viewContent.append(el('branch'));branchField.remove();
    const controls=document.createElement('div');controls.hidden=true;controls.id='map_internal_controls';
    const drawingTools=el('mode').closest('.map-tools'),precisionTools=el('refine').closest('.map-tools');
    el('drawing_view').append(controls);
    const phoneLabel=el('phone_zoom').parentElement;
    controls.append(el('mode'),el('zoom'),el('phone_zoom'),el('undo'));
    phoneLabel.remove();drawingTools.remove();precisionTools.before(el('refine'));precisionTools.remove();el('help').remove();
    const expand=document.querySelector('.map-expand');expand.classList.add('map-option-card');
    const expansionBody=document.createElement('div');expansionBody.className='map-option-content';
    expansionBody.append(...[...expand.childNodes].filter(n=>n.nodeName!=='SUMMARY'));expand.append(expansionBody);
    const precisionActions=document.createElement('div');precisionActions.className='map-tools';precisionActions.append(el('refine'));expansionBody.append(precisionActions);
    const reduce=document.querySelector('.map-reduce');reduce.classList.add('map-option-card');
    const reduceBody=document.createElement('div');reduceBody.className='map-option-content';reduceBody.append(...[...reduce.childNodes].filter(n=>n.nodeName!=='SUMMARY'));reduce.append(reduceBody);
    const sizes=document.createElement('div');sizes.className='map-size-cards';expand.before(sizes);sizes.append(expand,reduce);
    card([...el('naming').childNodes],'Crear y nombrar zonas',true);
    const zonesCard=fixedCard(card(range(el('coordinate').nextElementSibling,el('shelves')),'Zonas y etiquetas existentes',true));zonesCard.id='map_zones_card';
    const zonesView=document.createElement('div');zonesView.id='map_zones_view';zonesView.hidden=true;
    const zonesMap=document.createElement('div');zonesMap.id='map_zones_map_home';zonesMap.className='map-zones-preview';
    el('drawing_view').after(zonesView);zonesView.append(zonesMap,zonesCard);
    const assignment=document.querySelector('.map-product-assignment');
    card(range(assignment.firstElementChild,el('product_help')),'Buscar y filtrar productos',true);
    el('product_search').parentElement.id='map_product_search_field';
    el('product_category').closest('.map-tools').id='map_product_filter_grid';
    const exportTools=el('export').closest('.map-tools'),exportNote=exportTools.nextElementSibling;
    controls.append(el('status'),exportTools);if(exportNote)controls.append(exportNote);
})();
