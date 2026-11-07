import test from 'node:test';
import assert from 'node:assert/strict';
import {handle,checkOrigin} from '../api/index.js';
import {cookies,session} from '../lib/supabase.mjs';
import {sendOne,bodyComponent,webhook} from '../lib/integrations.mjs';
const root='https://crm.example.com';
const id='11111111-1111-4111-8111-111111111111';
function response(body,status=200){return new Response(JSON.stringify(body),{status});}
function setup(t,fn){
 process.env.APP_ORIGIN=root;process.env.SUPABASE_URL='https://db.example.com';process.env.SUPABASE_PUBLISHABLE_KEY='test-public';
 const previous=global.fetch;global.fetch=fn;t.after(()=>{global.fetch=previous;delete process.env.ALLOWED_ORIGINS;});
}
function request(path,body){return new Request(root+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:root,'Content-Type':'application/json',Cookie:'wu_access=access'},...(body?{body:JSON.stringify(body)}:{})});}
test('authenticated non-admin cannot access companies',async t=>{
 setup(t,async url=>url.endsWith('/user')?response({id}):response(false));
 const r=await handle(request('companies'));assert.equal(r.status,403);
});
test('admin company creation normalizes payload before persistence',async t=>{
 let saved;
 setup(t,async(url,options)=>{
 if(url.endsWith('/user'))return response({id});
 if(url.endsWith('/rpc/bind_admin'))return response(true);
 assert.ok(url.endsWith('/companies'));saved=JSON.parse(options.body);return response([{id,...saved}],201);
 });
 const r=await handle(request('companies',{name:'Acme',phone:'(48) 99999-1234'}));
 assert.equal(r.status,201);assert.equal(saved.phone,'5548999991234');assert.equal(saved.status,'Nova empresa');
});
test('duplicate database error is reported as conflict',async t=>{
 setup(t,async url=>url.endsWith('/user')?response({id}):url.endsWith('/rpc/bind_admin')?response(true):response({code:'23505'},409));
 const r=await handle(request('companies',{name:'Acme'}));assert.equal(r.status,409);
});
test('expired access refreshes session and sets secure HttpOnly cookies',async t=>{
 setup(t,async url=>url.endsWith('/user')?response({},401):url.includes('refresh_token')?response({user:{id},access_token:'new-access',refresh_token:'new-refresh',expires_in:3600}):response(true));
 const h=new Headers();const result=await session(new Request(root,{headers:{Cookie:'wu_access=expired; wu_refresh=refresh'}}),h);
 assert.equal(result.token,'new-access');assert.equal(h.getSetCookie().length,2);assert.ok(h.getSetCookie().every(v=>v.includes('HttpOnly')&&v.includes('Secure')&&v.includes('SameSite=Strict')));
});
test('malformed cookie does not break other cookies',()=>{assert.deepEqual(cookies(new Request(root,{headers:{Cookie:'bad=%broken; wu_access=valid; noequals'}})),{wu_access:'valid'});});
test('allowed aliases require exact same-origin and reject lookalike domains',()=>{
 process.env.APP_ORIGIN=root;process.env.ALLOWED_ORIGINS='https://alias.example.com';
 checkOrigin(new Request('https://alias.example.com/api/x',{headers:{Origin:'https://alias.example.com'}}));
 assert.throws(()=>checkOrigin(new Request(root+'/api/x',{headers:{Origin:'https://alias.example.com'}})));
 assert.throws(()=>checkOrigin(new Request('https://alias.example.com.evil.test/api/x',{headers:{Origin:'https://alias.example.com.evil.test'}})));
 delete process.env.ALLOWED_ORIGINS;
});
test('consent revocation blocks delivery even after campaign preview',async t=>{
 process.env.META_ACCESS_TOKEN='test';process.env.META_PHONE_NUMBER_ID='123';process.env.META_WABA_ID='456';process.env.META_API_VERSION='v23.0';
 let graphPosts=0;
 setup(t,async(url,options={})=>{
 if(url.includes('graph.facebook.com')){if(options.method==='POST')graphPosts++;return response({data:[{name:'hello',language:'pt_BR',status:'APPROVED',components:[{type:'BODY',text:'Olá {{1}}'}]}]});}
 if(url.includes('/rpc/claim_message'))return response([]);
 if(url.includes('/messages?'))return response([{id,status:'pending',campaign_id:id,company_id:id,phone:'5548999991234',body:'Olá Acme'}]);
 if(url.includes('/campaigns?'))return response([{template_name:'hello',language:'pt_BR'}]);
 if(url.includes('/companies?'))return response([{id,name:'Acme',phone:'5548999991234'}]);
 throw Error('Unexpected request '+url);
 });
 const r=await sendOne(id,'access');assert.equal(r.status,'blocked');assert.equal(graphPosts,0);
});
test('previously reserved messages are never sent again',async t=>{
 setup(t,async url=>{assert.ok(url.includes('/messages?'));return response([{id,status:'sending'}]);});
 assert.equal((await sendOne(id,'access')).status,'sending');
});
test('forged webhook cannot reach database',async t=>{
 setup(t,async()=>{throw Error('Database should not be called');});
 process.env.META_APP_SECRET='test';const req=new Request(root+'/api/whatsapp/webhook',{method:'POST',headers:{'x-hub-signature-256':'sha256='+'0'.repeat(64)},body:'{}'});
 await assert.rejects(webhook(req),e=>e.status===401);
});
test('template preview includes static footer',()=>{
 const r=bodyComponent({components:[{type:'BODY',text:'Olá {{1}}'},{type:'FOOTER',text:'Envie SAIR para cancelar'}]},{name:'Acme'});
 assert.equal(r.body,'Olá Acme\n\nEnvie SAIR para cancelar');
});
test('health exposes neither session nor configuration',async()=>{
 const r=await handle(new Request(root+'/api/health'));assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'ok',version:'0.2.0'});
});
