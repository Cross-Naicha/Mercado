// Ayuda contextual reutilizable: cambia la cara de la tarjeta y conserva sus controles.
(function(){
    const symbol='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 1 0 18H5l-2 1v-7a9 9 0 0 1 9-12Z"/><path d="M9.7 9a2.4 2.4 0 1 1 4.2 1.6c-.9.6-1.9 1-1.9 2.4"/><circle cx="12" cy="16.2" r=".2" fill="currentColor"/></svg>';
    let helpSerial=0;
    function attach(card,{title,sections}){
        const summary=card.querySelector('summary,.map-card-heading'),controls=card.querySelector('.map-option-content');
        controls.querySelectorAll(':scope>p:not([id])').forEach(node=>node.remove());
        const trigger=document.createElement('button');trigger.type='button';trigger.className='map-help-trigger';trigger.innerHTML=symbol;trigger.title='Ayuda: '+title;trigger.setAttribute('aria-label','Ayuda sobre '+title);trigger.setAttribute('aria-expanded','false');
        const help=document.createElement('div');help.className='map-option-content map-context-help';help.hidden=true;help.id='map-context-help-'+(++helpSerial);trigger.setAttribute('aria-controls',help.id);
        const heading=document.createElement('h3');heading.textContent=title;help.append(heading);
        for(const [label,text] of sections){const section=document.createElement('section'),h=document.createElement('h4'),p=document.createElement('p');h.textContent=label;p.textContent=text;section.append(h,p);help.append(section);}
        const back=document.createElement('button');back.type='button';back.className='map-help-back';back.textContent='← Volver al menú';help.append(back);summary.append(trigger);card.append(help);card.classList.add('map-help-card');
        function show(value){card.open=true;controls.hidden=value;help.hidden=!value;trigger.setAttribute('aria-expanded',String(value));card.classList.toggle('is-showing-help',value);if(value)back.focus({preventScroll:true});else trigger.focus({preventScroll:true});}
        trigger.onclick=event=>{event.preventDefault();event.stopPropagation();show(help.hidden);};back.onclick=()=>show(false);
        help.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();show(false);}});
    }
    window.MercadoHelp={attach};
    attach(document.getElementById('map_zones_card'),{title:'Zonas y etiquetas',sections:[
        ['Orden de recorrido','Los números de las zonas indican el recorrido de este súper. Elegí una zona y usá ↑ ↓ para moverla. Elegí también su extremo de entrada. Confirmá con Guardar para aplicar el orden y el extremo de entrada. Se sincroniza con los mapas.'],
        ['Elegir una zona','Tocá su botón para cambiar el nombre, el color o la orientación de su etiqueta. El dibujo del mapa está bloqueado en esta vista.'],
        ['Nombre y orientación','Usá & para separar líneas: Mascotas & Jardinería se muestra en dos líneas. Vertical gira la etiqueta 90°. Guardar confirma juntos el nombre, el color, la orientación, el orden de recorrido y el extremo de entrada. Se habilita cuando hay cambios; Descartar recupera lo guardado.'],
        ['Unir o extender zonas','Si guardás el nombre de otra zona existente, ambas se unen y conservan sus productos. Para agregar celdas a una zona, usá Dibujar → Nombrar y guardalas con el mismo nombre.'],
        ['Quitar nombres','Quitar nombre elimina la zona elegida; Quitar todas las zonas elimina todas. El dibujo y la disponibilidad se conservan, pero los productos afectados quedan sin ubicación en el mapa. Podés recuperar el cambio con Deshacer en Dibujar.']
    ]});
    attach(document.querySelector('.map-expand'),{title:'Cómo ampliar el mapa',sections:[
        ['Agregar espacio','Elegí un lado y la cantidad de filas o columnas. Las celdas nuevas quedan libres y el dibujo conserva su tamaño. Arriba y abajo agregan filas; izquierda y derecha agregan columnas.'],
        ['Insertar entre celdas','Elegí Insertar filas o Insertar columnas e indicá la coordenada. Se agregan antes de esa posición y desplazan el contenido siguiente. Las coordenadas empiezan en 1.'],
        ['Aumentar precisión','Subdivide cada celda en cuatro para dibujar detalles más pequeños sin ampliar el espacio del supermercado. Por ejemplo, 16 × 20 pasa a 32 × 40. Conserva las zonas y los productos asociados.'],
        ['Límites y correcciones','El máximo es 128 filas y 128 columnas. Si no te convence el resultado, usá Deshacer en los controles del mapa. El zoom solo cambia cómo lo ves.']
    ]});
    attach(document.querySelector('.map-reduce'),{title:'Cómo reducir el mapa',sections:[
        ['Elegir el recorte','Indicá desde qué borde quitar filas o columnas y cuántas. Se conserva el tamaño de cada celda; debe quedar al menos una fila y una columna.'],
        ['Revisar el resultado','La vista previa muestra las dimensiones finales y avisa si el recorte alcanza góndolas o zonas. Si solo elimina espacio libre, podés aplicarlo directamente.'],
        ['Recortar contenido','Si alcanza contenido, marcá la casilla para confirmar el recorte. Una zona parcialmente recortada conserva lo que queda. Si desaparece entera, sus productos quedan sin zona; su disponibilidad en la sucursal se conserva.'],
        ['Volver atrás','Deshacer recupera el dibujo, las zonas y sus asignaciones. Para ver el mapa más pequeño sin quitar contenido, usá el botón de alejar del zoom.']
    ]});
})();
