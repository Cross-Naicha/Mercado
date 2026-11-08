const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{}};for(const file of ['map-boundaries','price-route'])vm.runInNewContext(fs.readFileSync('static/js/'+file+'.js','utf8'),context);
const {MercadoPricePlanner:P,MercadoBoundaries:B}=context.window;
const map={rows:4,cols:4,cells:[0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0],shelves:[{id:'a',cells:[5,6]}],assignments:{a:'a',b:'a',c:'a',d:'a'},placements:{a:{cell:5,order:1},b:{cell:5,order:0},c:{cell:6,order:0}},access:{5:['south'],6:[]},walls:['v:1:2']};
const route=P.plan(map,[{id:'a'},{id:'b'},{id:'c'},{id:'d'}],0,15);
assert.equal(route.stops.length,1);assert.equal(route.stops[0].at,9);assert.equal(route.stops[0].items[0].id,'b');
assert.equal(route.missing[0].id,'d');assert.equal(route.unreachable[0].id,'c');
assert.equal(route.total,route.stops[0].path.length-1+route.finish.length-1);
for(const path of [route.stops[0].path,route.finish])for(let n=1;n<path.length;n++){assert.equal(map.cells[path[n]],0);assert.ok(B.sides.some(side=>B.neighbor(map,path[n-1],side)===path[n]&&!map.walls.includes(B.edge(map,path[n-1],side))));}
assert.throws(()=>P.plan(map,[],5,0));assert.throws(()=>P.plan({...map,walls:['v:1:0','v:1:1','v:1:2','v:1:3']},[],0,15));
const empty=P.plan(map,[],0,15);assert.equal(empty.total,6);assert.equal(empty.finish.at(-1),15);
console.log('OK: access-aware stops, ordered specifics, missing/unreachable products, valid paths, fixed end and distance.');
