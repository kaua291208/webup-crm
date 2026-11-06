import {HttpError,sb,db,rpc,session,setSession,cookies} from '../lib/supabase.mjs';
import {company,text,password,uuid} from '../lib/domain.mjs';
import {metaConfigured,approvedTemplates,bodyComponent,sendOne,webhook,searchBusinesses} from '../lib/integrations.mjs';
export function checkOrigin(req){const expected=process.env.APP_ORIGIN;if(!expected)throw new HttpError(503,'Configure APP_ORIGIN.');if(req.headers.get('origin')!==expected)throw new HttpError(403,'Origem não autorizada.');}
async function input(req){if(!req.headers.get('content-type')?.includes('application/json'))throw new HttpError(415,'Use JSON.');const raw=await req.text();if(raw.length>1048576)throw new HttpError(413,'Requisição muito grande.');try{return JSON.parse(raw);}catch{throw new HttpError(400,'JSON inválido.');}}
const loginAttempts=new Map();
function loginRate(email){const key=text(email).toLowerCase(),now=Date.now();const item=loginAttempts.get(key);if(item&&item.until>now){if(item.count>=10)throw new HttpError(429,'Aguarde 15 minutos para tentar novamente.');item.count++;}else loginAttempts.set(key,{count:1,until:now+900000});if(loginAttempts.size>1000)for(const [k,v]of loginAttempts)if(v.until<now)loginAttempts.delete(k);}
export async function handle(req){
 const h=new Headers({'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'});
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:h});
 try{
 const url=new URL(req.url),path=url.pathname.replace(/^\/api\/?/,'').replace(/\/$/,'');
 if(path==='whatsapp/webhook')return await webhook(req);
 const method=req.method;if(!['GET','POST','PATCH','DELETE'].includes(method))throw new HttpError(405,'Método não permitido.');
 if(method!=='GET')checkOrigin(req);
 const b=method==='GET'?{}:await input(req);
 if(path==='auth/login'&&method==='POST'){
 loginRate(b.email);
 const data=await sb('/auth/v1/token?grant_type=password',{method:'POST',body:{email:text(b.email),password:String(b.password||'')}});
 if(!await rpc('bind_admin',{},data.access_token))throw new HttpError(403,'Conta sem acesso administrativo.');
 setSession(h,data,url.origin);return json({ok:true});
 }
 if(path==='auth/register'&&method==='POST'){
 loginRate(b.email);
 if(text(b.email).toLowerCase()!==(process.env.ADMIN_EMAIL||'').toLowerCase())throw new HttpError(403,'Cadastro restrito ao administrador configurado.');
 await sb('/auth/v1/signup?redirect_to='+encodeURIComponent(process.env.APP_ORIGIN),{method:'POST',body:{email:text(b.email),password:password(b.password),data:{name:text(b.name)}}});
 return json({message:'Confira seu e-mail para confirmar o acesso. Se a conta já existe, use a recuperação de senha.'});
 }
 if(path==='auth/recover'&&method==='POST'){loginRate(b.email);try{await sb('/auth/v1/recover?redirect_to='+encodeURIComponent(process.env.APP_ORIGIN),{method:'POST',body:{email:text(b.email)}});}catch(e){if(e.status===429)throw e;}return json({message:'Se a conta existir, você receberá um link de recuperação.'});}
 if(path==='auth/exchange'&&method==='POST'){
 if(typeof b.access_token!=='string'||b.access_token.length>10000||typeof b.refresh_token!=='string')throw new HttpError(400,'Link inválido.');
 await sb('/auth/v1/user',{token:b.access_token});
 if(!await rpc('bind_admin',{},b.access_token))throw new HttpError(403,'Conta sem acesso.');
 setSession(h,{access_token:b.access_token,refresh_token:b.refresh_token,expires_in:3600},url.origin);return json({ok:true});
 }
 if(path==='auth/logout'&&method==='POST'){try{const c=cookies(req);if(c.wu_access)await sb('/auth/v1/logout',{method:'POST',token:c.wu_access});}finally{setSession(h,null,url.origin);}return json({ok:true});}
 const {user,token}=await session(req,h);
 if(path==='me'&&method==='GET')return json({id:user.id,email:user.email,name:user.user_metadata?.name||'Administrador'});
 if(path==='settings'&&method==='GET')return json({whatsapp:metaConfigured(),webhook:!!process.env.META_APP_SECRET&&!!process.env.META_VERIFY_TOKEN&&!!process.env.SUPABASE_SECRET_KEY,webhookUrl:process.env.APP_ORIGIN+'/api/whatsapp/webhook'});
 if(path==='profile'&&method==='PATCH'){
 const changes={data:{name:text(b.name)}};
 if(b.password)changes.password=password(b.password);
 if(b.email)changes.email=text(b.email);
 if(b.password||b.email){await sb('/auth/v1/token?grant_type=password',{method:'POST',body:{email:user.email,password:String(b.current_password||'')}});}
 await sb('/auth/v1/user',{token,method:'PUT',body:changes});return json({message:'Perfil atualizado. Mudanças de e-mail precisam de confirmação.'});
 }
 if(path==='auth/password'&&method==='POST'){await sb('/auth/v1/user',{token,method:'PUT',body:{password:password(b.password)}});return json({ok:true});}
 if(path==='companies'&&method==='GET'){
 const offset=Math.max(0,Number(url.searchParams.get('offset'))||0),limit=200;
 return json(await db('companies?select=*&order=created_at.desc&limit='+limit+'&offset='+offset,{token}));
 }
 if(path==='companies'&&method==='POST')return json(await db('companies',{token,method:'POST',body:company(b),headers:{Prefer:'return=representation'}}),201);
 if(path.startsWith('companies/')&&['PATCH','DELETE'].includes(method)){
 const id=uuid(path.split('/')[1]);await db('companies?id=eq.'+id,{token,method,...(method==='PATCH'?{body:company(b)}:{})});return json({ok:true});
 }
 if(path==='dashboard'&&method==='GET'){
 return json(await rpc('dashboard_stats',{},token));
 }
 if(path==='consents'&&method==='GET')return json(await db('consents?select=*&order=created_at.desc,id.desc&limit=10000',{token}));
 if(path==='consents'&&method==='POST'){if(typeof b.granted!=='boolean'||text(b.evidence,2000).length<5)throw new HttpError(400,'Registre a origem e a evidência da autorização.');await db('consents',{token,method:'POST',body:{company_id:uuid(b.company_id),granted:b.granted,evidence:text(b.evidence,2000)}});return json({ok:true});}
 if(path==='interactions'&&method==='GET')return json(await db('interactions?company_id=eq.'+uuid(url.searchParams.get('company_id'))+'&order=created_at.desc&limit=200',{token}));
 if(path==='interactions'&&method==='POST'){if(!text(b.body,4000))throw new HttpError(400,'Escreva a observação.');await db('interactions',{token,method:'POST',body:{company_id:uuid(b.company_id),body:text(b.body,4000)}});return json({ok:true});}
 if(path==='templates'&&method==='GET')return json(await db('templates?order=created_at.desc',{token}));
 if(path==='templates'&&method==='POST'){if(text(b.name).length<2||!text(b.body,4000))throw new HttpError(400,'Preencha nome e mensagem.');return json(await db('templates',{token,method:'POST',headers:{Prefer:'return=representation'},body:{name:text(b.name),body:text(b.body,4000),category:text(b.category)}}),201);}
 if(path.startsWith('templates/')&&['PATCH','DELETE'].includes(method)){const id=uuid(path.split('/')[1]);if(method==='PATCH'&&(text(b.name).length<2||!text(b.body,4000)))throw new HttpError(400,'Preencha nome e mensagem.');await db('templates?id=eq.'+id,{token,method,...(method==='PATCH'?{body:{name:text(b.name),body:text(b.body,4000),category:text(b.category)}}:{})});return json({ok:true});}
 if(path==='import'&&method==='POST'){
 if(!Array.isArray(b.rows)||b.rows.length>500)throw new HttpError(400,'Limite de 500 empresas por importação.');
 if(!['skip','update','review'].includes(b.mode))throw new HttpError(400,'Escolha como tratar duplicados.');
 const results=[];for(const [index,row]of b.rows.entries()){
 try{
 const c=company({...row,source:'Planilha'});
 let duplicates=[];if(c.phone)duplicates.push(...await db('companies?phone=eq.'+c.phone,{token}));if(c.cnpj)duplicates.push(...await db('companies?cnpj=eq.'+c.cnpj,{token}));
 duplicates=[...new Map(duplicates.map(d=>[d.id,d])).values()];
 if(duplicates.length){if(b.mode==='update'&&duplicates.length===1){
 const merged={...duplicates[0]};for(const [k,v]of Object.entries(c))if(v&&k!=='status'&&k!=='source')merged[k]=v;
 await db('companies?id=eq.'+duplicates[0].id,{token,method:'PATCH',body:company(merged)});results.push({row:index+2,status:'updated'});
 }else results.push({row:index+2,status:'duplicate',name:c.name});}
 else{await db('companies',{token,method:'POST',body:c});results.push({row:index+2,status:'created'});}
 }catch(e){results.push({row:index+2,status:'error',message:e.message});}
 }
 return json({results});
 }
 if(path==='search'&&method==='POST')return json(await searchBusinesses(b,token));
 if(path==='meta/templates'&&method==='GET')return json(await approvedTemplates());
 if(path==='campaigns'&&method==='GET')return json(await db('campaigns?order=created_at.desc&limit=100',{token}));
 if(path==='campaigns'&&method==='POST'){
 if(!Array.isArray(b.company_ids)||!b.company_ids.length||b.company_ids.length>100)throw new HttpError(400,'Selecione de 1 a 100 destinatários.');
 const template=(await approvedTemplates()).find(t=>t.name===b.template_name&&t.language===b.language&&t.supported);
 if(!template)throw new HttpError(400,'Modelo não aprovado ou incompatível.');
 const ids=[...new Set(b.company_ids.map(uuid))];const rows=await db('companies?id=in.('+ids.join(',')+')',{token});
 const recipients=[];for(const c of rows){const [consent]=await db('consents?company_id=eq.'+c.id+'&order=created_at.desc,id.desc&limit=1',{token});if(consent?.granted&&c.phone)recipients.push({...c,rendered:bodyComponent(template,c)});}
 if(!recipients.length)throw new HttpError(400,'Nenhum contato selecionado possui autorização e telefone.');
 const [campaign]=await db('campaigns',{token,method:'POST',headers:{Prefer:'return=representation'},body:{name:text(b.name)||'Campanha',template_name:template.name,language:template.language,body:template.components.find(c=>c.type==='BODY')?.text||''}});
 const messages=await db('messages',{token,method:'POST',headers:{Prefer:'return=representation'},body:recipients.map(c=>({campaign_id:campaign.id,company_id:c.id,phone:c.phone,body:c.rendered.body,direction:'out'}))});
 return json({campaign,messages,excluded:ids.length-recipients.length},201);
 }
 if(path==='messages'&&method==='GET'){const campaign=url.searchParams.get('campaign_id'),cid=url.searchParams.get('company_id');return json(await db('messages?order=created_at.desc&limit=500'+(campaign?'&campaign_id=eq.'+uuid(campaign):'')+(cid?'&company_id=eq.'+uuid(cid):''),{token}));}
 if(path==='messages/send'&&method==='POST'){if(b.confirm!==true)throw new HttpError(400,'Confirme o envio.');if(!await rpc('check_rate',{bucket_name:'send',max_hits:100,window_seconds:3600},token))throw new HttpError(429,'Limite de 100 envios por hora.');return json(await sendOne(uuid(b.id),token));}
 if(path==='audit'&&method==='GET')return json(await db('audit_log?order=created_at.desc&limit=100',{token}));
 if(path==='backup'&&method==='GET'){const result={exported_at:new Date().toISOString(),tables:{}};for(const table of ['companies','consents','interactions','templates','campaigns','messages','audit_log']){const rows=[];for(let offset=0;;offset+=500){const batch=await db(table+'?order='+(table==='audit_log'?'id':'created_at')+'.asc&limit=500&offset='+offset,{token});rows.push(...batch);if(batch.length<500)break;}result.tables[table]=rows;}return json(result);}
 throw new HttpError(404,'Rota não encontrada.');
 }catch(e){return json({error:e instanceof HttpError?e.message:e instanceof TypeError?'Dados inválidos ou serviço indisponível.':e.message||'Erro inesperado.'},e.status||400);}
}
export default {fetch:handle};
