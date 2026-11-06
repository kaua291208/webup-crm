import {createHmac,timingSafeEqual} from 'node:crypto';
import {HttpError,db,rpc} from './supabase.mjs';
import {text,company,uuid} from './domain.mjs';
export function validSignature(raw,signature,secret){if(!secret||!/^sha256=[a-f0-9]{64}$/.test(signature||''))return false;return timingSafeEqual(Buffer.from(signature.slice(7),'hex'),createHmac('sha256',secret).update(raw).digest());}
export function metaConfigured(){return ['META_ACCESS_TOKEN','META_PHONE_NUMBER_ID','META_WABA_ID','META_API_VERSION'].every(k=>process.env[k]);}
export async function graph(path,body){
 if(!metaConfigured())throw new HttpError(503,'Configure a integração oficial da Meta nas variáveis de ambiente.');
 const r=await fetch('https://graph.facebook.com/'+process.env.META_API_VERSION+'/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.META_ACCESS_TOKEN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 const data=await r.json();if(!r.ok)throw new HttpError(502,'A Meta recusou a operação. Código: '+(data.error?.code||r.status));return data;
}
export async function approvedTemplates(){
 const r=await graph(process.env.META_WABA_ID+'/message_templates?fields=id,name,status,language,components&limit=100');
 return (r.data||[]).filter(t=>t.status==='APPROVED').map(t=>({...t,supported:t.components.every(c=>c.type==='BODY'||c.type==='FOOTER')&&!t.components.some(c=>/{{[^0-9}]/.test(c.text||''))}));
}
export function bodyComponent(template,c){
 const body=template.components.find(v=>v.type==='BODY')?.text||'';
 const slots=[...new Set([...body.matchAll(/{{(\d+)}}/g)].map(m=>Number(m[1])))].sort((a,b)=>a-b);
 if(slots.some((n,i)=>n!==i+1)||slots.length>3)throw new HttpError(400,'Use até três variáveis numéricas: nome, cidade e categoria.');
 const values=[c.name,c.city||'sua cidade',c.category||'seu segmento'];
 return {body:body.replace(/{{(\d+)}}/g,(_,n)=>values[Number(n)-1]),components:slots.length?[{type:'body',parameters:slots.map(n=>({type:'text',text:values[n-1]}))}]:[]};
}
export async function searchBusinesses(input,token){
 if(!await rpc('check_rate',{bucket_name:'search',max_hits:10,window_seconds:3600},token))throw new HttpError(429,'Limite de 10 pesquisas por hora. Tente novamente depois.');
 const city=text(input.city,80),state=text(input.state,2).toUpperCase();
 if(!city||!/^[A-Z]{2}$/.test(state))throw new HttpError(400,'Informe cidade e UF brasileiras.');
 const tags={restaurantes:'["amenity"="restaurant"]',bares:'["amenity"="bar"]',barbearias:'["shop"="hairdresser"]',clinicas:'["amenity"="clinic"]',lojas:'["shop"]',academias:'["leisure"="fitness_centre"]',oficinas:'["shop"="car_repair"]'};
 if(!tags[input.category])throw new HttpError(400,'Selecione um segmento.');
 const query='[out:json][timeout:20];area["ISO3166-2"="BR-'+state+'"]->.s;area(area.s)["name"='+JSON.stringify(city)+']["boundary"="administrative"]->.a;nwr(area.a)'+tags[input.category]+'["name"];out center tags 100;';
 const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'WebUpCRM/1.0'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw new HttpError(502,'A fonte OpenStreetMap está indisponível. Tente mais tarde.');
 const data=await r.json();return (data.elements||[]).map(e=>{const t=e.tags||{};let p=t['contact:phone']||t.phone||'';try{return company({name:t.name,phone:p,city:t['addr:city']||city,category:input.category,website:t['contact:website']||t.website||'',email:t['contact:email']||t.email||'',address:[t['addr:street'],t['addr:housenumber']].filter(Boolean).join(', '),neighborhood:t['addr:suburb']||'',source:'OpenStreetMap https://www.openstreetmap.org/'+e.type+'/'+e.id});}catch{return company({name:t.name,city,category:input.category,source:'OpenStreetMap https://www.openstreetmap.org/'+e.type+'/'+e.id});}}).filter(c=>(!input.no_site||!c.website)&&(!input.neighborhood||c.neighborhood.toLowerCase().includes(text(input.neighborhood).toLowerCase())));
}
export async function sendOne(id,token){
 const existing=await db('messages?id=eq.'+uuid(id)+'&select=*',{token});if(!existing[0])throw new HttpError(404,'Mensagem não encontrada.');
 const m=existing[0];if(m.status!=='pending')return {status:m.status};
 const [campaign]=await db('campaigns?id=eq.'+m.campaign_id,{token});
 const template=(await approvedTemplates()).find(t=>t.name===campaign.template_name&&t.language===campaign.language&&t.supported);
 if(!template)throw new HttpError(400,'Modelo não está aprovado ou usa componentes não suportados.');
 const [c]=await db('companies?id=eq.'+m.company_id,{token});if(!c||c.phone!==m.phone)throw new HttpError(409,'O telefone foi alterado. Prepare uma nova campanha.');
 const rendered=bodyComponent(template,c);if(rendered.body!==m.body)throw new HttpError(409,'O modelo ou os dados mudaram. Prepare uma nova campanha.');
 const claimed=await rpc('claim_message',{message_id:id},token);if(!claimed.length)return {status:'blocked',reason:'Sem autorização atual ou mensagem já processada.'};
 try{
 const result=await graph(process.env.META_PHONE_NUMBER_ID+'/messages',{messaging_product:'whatsapp',to:m.phone,type:'template',template:{name:template.name,language:{code:template.language},components:rendered.components}});
 await db('messages?id=eq.'+id,{token,method:'PATCH',body:{status:'sent',provider_id:result.messages[0].id}});
 return {status:'sent'};
 }catch(e){
 await db('messages?id=eq.'+id,{token,method:'PATCH',body:{status:'unknown',error:'Envio não confirmado. Confira a Meta antes de reenviar.'}});
 throw new HttpError(502,'Resultado do envio incerto. Não será reenviado automaticamente.');
 }
}
export async function webhook(req){
 const verify=process.env.META_VERIFY_TOKEN;
 if(req.method==='GET'){const q=new URL(req.url).searchParams;if(verify&&q.get('hub.mode')==='subscribe'&&q.get('hub.verify_token')===verify)return new Response(q.get('hub.challenge'));throw new HttpError(403,'Verificação inválida.');}
 if(req.method!=='POST')throw new HttpError(405,'Método não permitido.');
 const raw=await req.text();if(raw.length>1048576)throw new HttpError(413,'Evento muito grande.');
 if(!validSignature(raw,req.headers.get('x-hub-signature-256'),process.env.META_APP_SECRET))throw new HttpError(401,'Assinatura inválida.');
 const payload=JSON.parse(raw);
 for(const entry of payload.entry||[])for(const change of entry.changes||[]){
 const v=change.value;if(v?.metadata?.phone_number_id!==process.env.META_PHONE_NUMBER_ID)continue;
 for(const s of v.statuses||[]){
 const rank={sent:1,delivered:2,read:3,failed:4};
 if(!rank[s.status])continue;
 const rows=await db('messages?provider_id=eq.'+encodeURIComponent(s.id),{service:true});
 if(rows[0]&&(rank[s.status]> (rank[rows[0].status]||0)))await db('messages?id=eq.'+rows[0].id,{service:true,method:'PATCH',body:{status:s.status}});
 }
 for(const m of v.messages||[]){
 const [c]=await db('companies?phone=eq.'+encodeURIComponent(m.from),{service:true});
 const body=m.text?.body||m.button?.text||'[Mensagem '+m.type+']';
 await db('messages?on_conflict=provider_id',{service:true,method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:{company_id:c?.id||null,phone:m.from,direction:'in',status:'received',body:text(body,4000),provider_id:m.id}});
 if(c&&/^(sair|pare|parar|stop|cancelar|não quero|nao quero)$/i.test(body.trim())){
 await db('consents',{service:true,method:'POST',body:{company_id:c.id,granted:false,evidence:'Descadastramento recebido via WhatsApp: '+m.id,recorded_by:null}});
 }
 }
 }
 return Response.json({received:true});
}
