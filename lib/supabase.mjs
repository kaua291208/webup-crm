export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
export function config(){const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;if(!url||!key)throw new HttpError(503,'Configure a conexão com o Supabase.');return {url,key};}
export async function sb(path,{token,method='GET',body,headers={},service=false}={}){
 const {url,key}=config();const secret=service?process.env.SUPABASE_SECRET_KEY:null;
 if(service&&!secret)throw new HttpError(503,'Configure a chave secreta do Supabase para receber webhooks.');
 const response=await fetch(url+path,{method,headers:{apikey:secret||key,...(token?{Authorization:'Bearer '+token}:secret?.startsWith('eyJ')?{Authorization:'Bearer '+secret}:{}),'Content-Type':'application/json',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 const data=await response.text();let parsed;try{parsed=data?JSON.parse(data):null;}catch{throw new HttpError(502,'Resposta inválida do banco.');}
 if(!response.ok){if(response.status===429)throw new HttpError(429,'Muitas tentativas. Aguarde alguns minutos.');if(parsed?.code==='23505')throw new HttpError(409,'Empresa duplicada: telefone ou CNPJ já cadastrado.');throw new HttpError(response.status===401?401:400,path.startsWith('/auth/')?'Não foi possível autenticar. Verifique os dados ou a confirmação do e-mail.':'Não foi possível concluir a operação no banco.');}
 return parsed;
}
export const db=(table,options={})=>sb('/rest/v1/'+table,options);
export const rpc=(name,body,token)=>db('rpc/'+name,{method:'POST',body,token});
export function cookies(req){
 const result={};
 for(const part of (req.headers.get('cookie')||'').split(';')){
 const i=part.indexOf('=');if(i<1)continue;
 try{result[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1));}catch{}
 }
 return result;
}
export function setSession(headers,session,origin){
 const secure=origin.startsWith('https:')?'; Secure':'';
 const set=(name,value,age)=>headers.append('Set-Cookie',name+'='+encodeURIComponent(value||'')+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+secure);
 set('wu_access',session?.access_token,session?session.expires_in||3600:0);set('wu_refresh',session?.refresh_token,session?604800:0);
}
export async function session(req,headers){
 let {wu_access:access,wu_refresh:refresh}=cookies(req),user;
 if(access){try{user=await sb('/auth/v1/user',{token:access});}catch(e){if(e.status!==401)throw e;}}
 if(!user&&refresh){try{const s=await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refresh}});access=s.access_token;user=s.user;setSession(headers,s,new URL(req.url).origin);}catch(e){if(e.status===401||e.status===400){setSession(headers,null,new URL(req.url).origin);}else throw e;}}
 if(!user||!access)throw new HttpError(401,'Entre na sua conta.');
 if(!await rpc('bind_admin',{},access))throw new HttpError(403,'Sua conta não tem acesso administrativo.');
 return {user,token:access};
}

