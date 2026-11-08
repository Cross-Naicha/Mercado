// Bordes geométricos compartidos: una pared bloquea ambos sentidos.
(function(){
    const sides=['north','east','south','west'];
    function edge(map,cell,side){const x=cell%map.cols,y=Math.floor(cell/map.cols);return side==='north'?`h:${x}:${y}`:side==='south'?`h:${x}:${y+1}`:side==='west'?`v:${x}:${y}`:`v:${x+1}:${y}`;}
    function validEdge(key,rows,cols){if(typeof key!=='string'||! /^(h|v):(0|[1-9]\d*):(0|[1-9]\d*)$/.test(key))return false;const [axis,x,y]=key.split(':').map((v,i)=>i?Number(v):v);return x>=0&&y>=0&&(axis==='h'?x<cols&&y<=rows:x<=cols&&y<rows);}
    function validate(map){
        const walls=map.walls??[],access=map.access??{};
        if(!Array.isArray(walls)||walls.length>33024||walls.some(e=>!validEdge(e,map.rows,map.cols))||new Set(walls).size!==walls.length)throw Error('Límites de paso inválidos');
        if(!access||typeof access!=='object'||Array.isArray(access)||Object.entries(access).some(([cell,list])=>! /^(0|[1-9]\d*)$/.test(cell)||Number(cell)>=map.cells.length||map.cells[cell]!==1||!Array.isArray(list)||list.some(s=>!sides.includes(s))||new Set(list).size!==list.length))throw Error('Lados de acceso inválidos');
        return {walls:[...walls].sort(),access:Object.fromEntries(Object.entries(access).map(([cell,list])=>[cell,sides.filter(s=>list.includes(s))]))};
    }
    function neighbor(map,cell,side){const x=cell%map.cols,y=Math.floor(cell/map.cols),[dx,dy]=({north:[0,-1],east:[1,0],south:[0,1],west:[-1,0]})[side];return x+dx<0||x+dx>=map.cols||y+dy<0||y+dy>=map.rows?null:cell+dy*map.cols+dx;}
    function accessCells(map,cell){return (map.access?.[cell]??sides).filter(side=>!(map.walls||[]).includes(edge(map,cell,side))).map(side=>neighbor(map,cell,side)).filter(i=>i!==null&&map.cells[i]===0);}
    function path(map,start,end){
        if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<0||start>=map.cells.length||end>=map.cells.length||map.cells[start]||map.cells[end])return [];
        const walls=new Set(map.walls||[]),queue=[start],previous=new Map([[start,null]]);
        for(let n=0;n<queue.length;n++){const current=queue[n];if(current===end){const route=[];for(let i=end;i!==null;i=previous.get(i))route.unshift(i);return route;}for(const side of sides){const next=neighbor(map,current,side);if(next!==null&&!map.cells[next]&&!walls.has(edge(map,current,side))&&!previous.has(next)){previous.set(next,current);queue.push(next);}}}return [];
    }
    // Transformar segmentos por sus vértices conserva paredes al subdividir o insertar.
    function transform(map,rows,cols,point,cellMap){
        const walls=new Set();for(const key of map.walls||[]){const [axis,a,b]=key.split(':'),x=Number(a),y=Number(b),p=point(x,y),q=point(x+(axis==='h'?1:0),y+(axis==='v'?1:0));for(let n=0;n<Math.abs(q[0]-p[0])+Math.abs(q[1]-p[1]);n++){const k=axis==='h'?`h:${Math.min(p[0],q[0])+n}:${p[1]}`:`v:${p[0]}:${Math.min(p[1],q[1])+n}`;if(validEdge(k,rows,cols))walls.add(k);}}
        const access={};for(const [cell,list] of Object.entries(map.access||{}))for(const target of cellMap(Number(cell)))if(target!==null)access[target]=[...list];
        return {walls:[...walls].sort(),access};
    }
    function segments(map){const result=[];for(const [cell,list] of Object.entries(map.access||{}))for(const side of sides){const next=neighbor(map,Number(cell),side);if(next!==null&&!map.cells[next])result.push({key:edge(map,Number(cell),side),color:list.includes(side)?'#1675bf':'#9b6500',dash:true});}return result.concat((map.walls||[]).map(key=>({key,color:'#a32e2e',dash:false})));}
    function coordinates(key,size){const [axis,a,b]=key.split(':'),x=Number(a)*size,y=Number(b)*size;return [x,y,x+(axis==='h'?size:0),y+(axis==='v'?size:0)];}
    function draw(ctx,map,size){for(const segment of segments(map)){const [x,y,u,v]=coordinates(segment.key,size);ctx.beginPath();ctx.strokeStyle=segment.color;ctx.lineWidth=segment.dash?3:4;ctx.setLineDash(segment.dash?[4,3]:[]);ctx.moveTo(x,y);ctx.lineTo(u,v);ctx.stroke();}ctx.setLineDash([]);}
    function svg(host,map,size){for(const segment of segments(map)){const [x1,y1,x2,y2]=coordinates(segment.key,size),line=document.createElementNS('http://www.w3.org/2000/svg','line');for(const [key,value] of Object.entries({x1,y1,x2,y2,stroke:segment.color,'stroke-width':segment.dash?2:3,'stroke-dasharray':segment.dash?'4 3':'none','pointer-events':'none'}))line.setAttribute(key,value);host.append(line);}}
    window.MercadoBoundaries={sides,edge,validate,neighbor,accessCells,path,transform,draw,svg};
})();
