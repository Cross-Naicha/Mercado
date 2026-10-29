const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{hidden:false,textContent:''});return elements.get(id);};
let mutations=0;
const context=vm.createContext({window:{mercadoMapProducts:{context:()=>({branch:''}),validate:value=>value},addEventListener(){}},document:{getElementById:el,addEventListener(){},hidden:false},localStorage:{setItem(){mutations++;}},serverRequest:async()=>({maps:[]}),setTimeout(){},clearTimeout(){},setInterval(){},Map,Set,JSON});
vm.runInContext(fs.readFileSync('static/js/map-sync.js','utf8'),context);
(async()=>{await context.window.MercadoMapSync.sync();assert.ok(el('map_sync_status').textContent.includes('reiniciarse'));assert.equal(mutations,0);console.log('Servidor antiguo: sincronización detenida y datos locales conservados OK');})().catch(error=>{console.error(error);process.exitCode=1;});
