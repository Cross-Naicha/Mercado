const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('static/js/offline.js','utf8');
const helpers=source.slice(source.indexOf('async function pendingLotProducts()'),source.indexOf('function pendingTitle('));
const sync=source.slice(source.indexOf('async function sync_pending()'),source.indexOf('let actionProductId='));

(async()=>{
 const first={operation_id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',entity_id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',kind:'stock_count',payload:{product_id:'product-a'},created_at:'2026-11-05T10:00:00Z'};
 const felpita={operation_id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',entity_id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',kind:'stock_count',payload:{product_id:'felpita'},depends_on:[first.operation_id],created_at:'2026-11-05T10:01:00Z'};
 let queue=[first,felpita],posts=[];
 const stores={objectStore:name=>({put:item=>{if(name==='outbox'){const i=queue.findIndex(op=>op.operation_id===item.operation_id);if(i>=0)queue[i]=item;else queue.push(item);}},delete:id=>{queue=queue.filter(op=>op.operation_id!==id);}})};
 const context=vm.createContext({syncing:false,db:{},document:{activeElement:null},$:()=>({contains:()=>false,open:false}),
  projectedStock:async()=>({lots:[]}),localRead:async name=>name==='outbox'?queue:[],localTransaction:async(_,action)=>action(stores),
  serverRequest:async(_,options)=>{const op=JSON.parse(options.body);posts.push(op.operation_id);if(op.operation_id===first.operation_id)throw Object.assign(Error('Las existencias cambiaron'),{status:409});return {operation_id:op.operation_id,entity_id:op.entity_id,status:'confirmed'};},
  updateStatus:async()=>{},reportPendingSync:async()=>{},refreshCatalog:async()=>{},refreshStock:async()=>{},refreshShopping:async()=>{},read_products:async()=>{},renderStock:async()=>{},renderShopping:async()=>{},notice:()=>{}});
 vm.runInContext(helpers+'\n'+sync,context);
 await context.sync_pending();
 assert.deepEqual(posts,[first.operation_id,felpita.operation_id],'El rechazo de otro producto no debe bloquear a Felpita');
 assert.equal(queue.length,1);assert.equal(queue[0].error_status,409);
 const same={...felpita,operation_id:'cccccccc-cccc-4ccc-cccc-cccccccccccc',payload:{product_id:'product-a'}};
 assert.equal(context.pendingDependencies(same,queue,new Map()).length,1,'Los cambios del mismo producto deben conservar el orden');
 console.log('OK: un 409 de otro producto no bloquea Felpita; cambios del mismo producto mantienen su dependencia');
})().catch(error=>{console.error(error);process.exitCode=1;});
