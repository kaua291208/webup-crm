export const statuses=['Nova empresa','Aguardando autorização','Autorizada para contato','Contato realizado','Respondeu','Interessada','Em negociação','Cliente fechado','Sem interesse'];
export function text(value,max=200){return String(value??'').trim().slice(0,max);}
export function phone(value){let n=text(value,40).replace(/\D/g,'');if(n.length===10||n.length===11)n='55'+n;if(n&&!/^\d{10,15}$/.test(n))throw new Error('Telefone inválido. Inclua DDD e país.');return n||null;}
export function company(input){
 const name=text(input.name);if(name.length<2)throw new Error('Informe o nome da empresa.');
 const email=text(input.email).toLowerCase();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('E-mail inválido.');
 let website=text(input.website,500);if(website){if(!/^https?:\/\//i.test(website))website='https://'+website;const u=new URL(website);if(!['https:','http:'].includes(u.protocol))throw new Error('Site inválido.');website=u.href;}
 const cnpj=text(input.cnpj).replace(/\D/g,'');if(cnpj&&cnpj.length!==14)throw new Error('CNPJ deve ter 14 dígitos.');
 const status=text(input.status)||statuses[0];if(!statuses.includes(status))throw new Error('Status inválido.');
 return {name,phone:phone(input.phone),email:email||null,website:website||null,cnpj:cnpj||null,city:text(input.city),neighborhood:text(input.neighborhood),category:text(input.category),address:text(input.address,500),notes:text(input.notes,4000),source:text(input.source)||'Manual',status};
}
export function uuid(value){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||''))throw new Error('Identificador inválido.');return value;}
export function password(value){if(typeof value!=='string'||value.length<12||value.length>128)throw new Error('Use uma senha de 12 a 128 caracteres.');return value;}
export function parseCSV(source){
 source=source.replace(/^\uFEFF/,'');if(source.length>500000)throw new Error('CSV limitado a 500 KB.');
 const separator=(source.split(/\r?\n/)[0].match(/;/g)||[]).length>(source.split(/\r?\n/)[0].match(/,/g)||[]).length?';':',';
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
 else if(c===separator&&!quoted){row.push(cell);cell='';}
 else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);cell='';row=[];}
 else cell+=c;}
 if(quoted)throw new Error('Aspas não fechadas no CSV.');
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 if(rows.length>501)throw new Error('Importe até 500 empresas por arquivo.');
 if(rows.length<2)throw new Error('Inclua o cabeçalho e pelo menos uma empresa.');
 return {headers:rows[0],rows:rows.slice(1)};
}
export function renderTemplate(template,c){return template.replace(/{{\s*(nome_empresa|cidade|categoria)\s*}}/g,(_,key)=>({nome_empresa:c.name,cidade:c.city,categoria:c.category}[key]||''));}
