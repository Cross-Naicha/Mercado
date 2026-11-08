const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{}};vm.runInNewContext(fs.readFileSync('static/js/map-boundaries.js','utf8'),context);
const B=context.window.MercadoBoundaries,plain=value=>JSON.parse(JSON.stringify(value));
const map={rows:3,cols:3,cells:[0,0,0,0,1,0,0,0,0],walls:[],access:{}};
assert.deepEqual(plain(B.accessCells(map,4)),[1,5,7,3]);
map.access[4]=['east'];assert.deepEqual(plain(B.accessCells(map,4)),[5]);
map.walls=['v:2:1'];assert.deepEqual(plain(B.accessCells(map,4)),[]);
assert.equal(B.path(map,3,5).length,5); // Goes around the occupied shelf.
map.walls=['v:1:0','v:1:1','v:1:2'];assert.equal(B.path(map,0,2).length,0);
assert.equal(B.path(map,2,0).length,0); // Walls work in both directions.
assert.throws(()=>B.validate({...map,walls:['h:03:0']}));
assert.throws(()=>B.validate({...map,walls:['v:4:0']}));
assert.throws(()=>B.validate({...map,access:{0:['east']}}));
assert.throws(()=>B.validate({...map,access:{4:['east','east']}}));
assert.deepEqual(plain(B.validate({...map,access:{4:[]}})).access,{'4':[]});
const refined=B.transform({...map,walls:['h:0:1','v:2:1']},6,6,(x,y)=>[2*x,2*y],i=>{const x=i%3*2,y=Math.floor(i/3)*2;return [y*6+x,y*6+x+1,(y+1)*6+x,(y+1)*6+x+1];});
assert.deepEqual(plain(refined.walls),['h:0:2','h:1:2','v:4:2','v:4:3']);
assert.equal(Object.keys(refined.access).length,4);
const shifted=B.transform({...map,walls:['h:0:1','v:2:1']},3,4,(x,y)=>[x+1,y],i=>[Math.floor(i/3)*4+i%3+1]);
assert.deepEqual(plain(shifted.walls),['h:1:1','v:3:1']);assert.deepEqual(plain(shifted.access),{'6':['east']});
const cropped=B.transform({...map,walls:['h:0:0','h:1:1']},2,2,(x,y)=>[x-1,y-1],i=>i===4?[0]:[null]);
assert.deepEqual(plain(cropped.walls),['h:0:0']);
console.log('OK: walls, shelf access, unreachable paths, validation, refinement, expansion and crop.');
