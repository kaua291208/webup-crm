import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
await mkdir('dist/vendor',{recursive:true});
for(const file of ['index.html','app.js','styles.css','import-worker.js'])await copyFile('public/'+file,'dist/'+file);
const url='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
if(!process.env.SKIP_VENDOR_DOWNLOAD){
 const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('SheetJS download failed: '+r.status);
 const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length<100000)throw new Error('Invalid SheetJS bundle');await writeFile('dist/vendor/xlsx.full.min.js',bytes);
}
console.log('Build complete');
