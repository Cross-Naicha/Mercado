const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('static/js/offline.js','utf8');
const sync=source.slice(source.indexOf('async function sync_pending()'),source.indexOf('let actionProductId='));
(async()=>{
 let saved=null,fail=null,queue=[];
 const context=vm.createContext({syncing:false,db:{},document:{activeElement:null},$:()=>({contains:()=>false}),localRead:async()=>queue,localTransaction:async(stores,action)=>action({objectStore:()=>({put:value=>{saved=value;}})}),refreshCatalog:async()=>{if(fail==='catalog') throw Error('offline');},refreshStock:async()=>{if(fail==='stock') throw Error('offline');},refreshShopping:async()=>{if(fail==='shopping') throw Error('offline');},read_products:async()=>{},renderStock:async()=>{},renderShopping:async()=>{},updateStatus:async()=>{},notice:()=>{}});
 vm.runInContext(sync,context);
 await context.sync_pending();assert.equal(saved.id,'last_sync');assert.ok(Number.isFinite(Date.parse(saved.synced_at)));
 const original=saved;
 for(const failure of ['catalog','stock','shopping']) {fail=failure;await context.sync_pending();assert.equal(saved,original,'No cambia la fecha si falla '+failure);}
 fail=null;queue=[{operation_id:'waiting',kind:'purchase',depends_on:['waiting'],created_at:new Date().toISOString()}];
 await context.sync_pending();assert.equal(saved,original,'No cambia la fecha si quedan pendientes');
 console.log('OK: fecha persistida al completar; conservada sin conexión, ante fallos parciales y con pendientes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
