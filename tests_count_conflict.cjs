const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const offline=fs.readFileSync('static/js/offline.js','utf8');
const stock=fs.readFileSync('static/js/stock.js','utf8');
const main=fs.readFileSync('static/js/main.js','utf8');
const countSource=offline.slice(offline.indexOf('function pendingDescendants('),offline.indexOf('async function serverRequest('));
const stockSource=stock.slice(stock.indexOf('function signedScaled('),stock.indexOf('async function stockAction('));
const decimalSource=main.slice(main.indexOf('function scaledDecimal('),main.indexOf('function roundedDivide('));

(async()=>{
 const first={operation_id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',entity_id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',kind:'stock_count',
  payload:{product_id:'felpita',location:'Baño',quantity:'18.000000',expected_balance:'24.000000'},error:'Las existencias cambiaron',error_status:409};
 const second={operation_id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',entity_id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',kind:'stock_count',
  payload:{product_id:'felpita',location:'Baño',quantity:'16.000000',expected_balance:'18.000000'},depends_on:[first.operation_id]};
 let queue=[first,second],savedEffect=null,excluded=null,retried=0,confirmation='';
 const serverStock={lots:[{id:'lot-1',product_id:'felpita',location:'Baño'}],movements:[{id:'move-1',lot_id:'lot-1',quantity:'20.000000'}]};
 const context=vm.createContext({saving:false,syncing:false,db:{},document:{activeElement:{blur:()=>{}}},$:()=>({contains:()=>false}),
  localRead:async name=>name==='outbox'?queue:name==='stock_cache'?[{id:'snapshot',confirmed_operations:[]}]:name==='catalog'?[{id:'felpita',content_unit:'unit'}]:[],
  pendingLotProducts:async()=>new Map([['lot-1','felpita']]),pendingDependencies:()=>[],
  refreshStock:async()=>{},projectedStock:async ids=>{excluded=ids;return serverStock;},
  localTransaction:async(_,action)=>action({objectStore:name=>({put:item=>{if(name==='stock_effects')savedEffect=item;if(name==='outbox')queue[0]=item;}})}),
  confirm:message=>{confirmation=message;return true;},notice:()=>{},updateStatus:async()=>{},sync_pending:async()=>{retried++;}});
 vm.runInContext(decimalSource+'\n'+stockSource+'\n'+countSource,context);
 await context.rebasePendingCount(first.operation_id,{quantity:{value:'18'}});
 assert.equal(queue[0].payload.expected_balance,'20.000000');
 assert.equal(queue[0].payload.quantity,'18.000000');
 assert.equal(queue[0].error_status,undefined);
 assert.equal(savedEffect.movements[0].quantity,'-2.000000');
 assert.ok(excluded.has(first.operation_id)&&excluded.has(second.operation_id));
 assert.ok(confirmation.includes('20.000000')&&confirmation.includes('18.000000'));
 assert.equal(retried,1);
 console.log('OK: el recuento se compara con el servidor, excluye efectos posteriores y reintenta con la nueva base');
})().catch(error=>{console.error(error);process.exitCode=1;});
