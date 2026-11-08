// Una búsqueda por parada comparte distancias a todos los accesos candidatos.
(function(){
    function plan(map,items,start,end){
        const B=window.MercadoBoundaries,walls=new Set(map.walls||[]);
        const free=i=>Number.isInteger(i)&&i>=0&&i<map.cells.length&&!map.cells[i];
        if(!free(start)||!free(end))throw Error('Elegí inicio y final sobre espacio libre.');
        function search(source){const queue=[source],previous=new Map([[source,null]]),distance=new Map([[source,0]]);for(let n=0;n<queue.length;n++){const cell=queue[n];for(const side of B.sides){const next=B.neighbor(map,cell,side);if(next!==null&&!map.cells[next]&&!walls.has(B.edge(map,cell,side))&&!previous.has(next)){previous.set(next,cell);distance.set(next,distance.get(cell)+1);queue.push(next);}}}return {distance,path(target){const result=[];for(let cell=target;cell!==null;cell=previous.get(cell))result.push(cell);return result.reverse();}};}
        const fromEnd=search(end);if(!fromEnd.distance.has(start))throw Error('No hay camino entre inicio y final. Revisá los límites.');
        const groups=new Map(),missing=[],unreachable=[];
        for(const item of items){const p=map.placements?.[item.id],zone=map.shelves.find(z=>z.id===map.assignments[item.id]);if(!p||!zone?.cells.includes(p.cell)){missing.push(item);continue;}if(!groups.has(p.cell))groups.set(p.cell,{cell:p.cell,zone:zone.id,items:[],access:B.accessCells(map,p.cell).filter(i=>fromEnd.distance.has(i))});groups.get(p.cell).items.push(item);}
        const pending=[];for(const stop of groups.values()){stop.items.sort((a,b)=>map.placements[a.id].order-map.placements[b.id].order||a.id.localeCompare(b.id));if(stop.access.length)pending.push(stop);else unreachable.push(...stop.items);}
        const stops=[];let current=start,total=0;
        while(pending.length){const tree=search(current);let best=null;for(const stop of pending)for(const access of stop.access){const distance=tree.distance.get(access);if(distance!==undefined&&(!best||distance<best.distance||distance===best.distance&&fromEnd.distance.get(access)<fromEnd.distance.get(best.access)))best={stop,access,distance};}if(!best)break;const path=tree.path(best.access);stops.push({...best.stop,at:best.access,path});total+=best.distance;current=best.access;pending.splice(pending.indexOf(best.stop),1);}
        const finish=search(current).path(end);total+=finish.length-1;
        return {start,end,stops,finish,total,missing,unreachable};
    }
    window.MercadoPricePlanner={plan};
})();
