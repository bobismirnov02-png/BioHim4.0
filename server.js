import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||8787);
const HOST=process.env.HOST||(process.env.RENDER?"0.0.0.0":"127.0.0.1");
const MAX_BODY=48*1024*1024;

const schema={type:"object",additionalProperties:false,properties:{questions:{type:"array",items:{type:"object",additionalProperties:false,properties:{type:{type:"string",enum:["mcq","open","yesno","combo","match"]},number:{type:"integer"},q:{type:"string"},o:{type:"array",items:{type:"string"},maxItems:4},a:{type:"string",enum:["A","B","C","D",""]},answer:{type:"string"},subpoints:{type:"array",items:{type:"string"},maxItems:8},comboOptions:{type:"array",items:{type:"string"},maxItems:12},comboAnswer:{type:"string"},matchLeft:{type:"array",items:{type:"string"},maxItems:8},matchRight:{type:"array",items:{type:"string"},maxItems:8},matchAnswer:{type:"string"},e:{type:"string"},topic:{type:"string"}},required:["type","number","q","o","a","answer","subpoints","comboOptions","comboAnswer","matchLeft","matchRight","matchAnswer","e","topic"]}}},required:["questions"]};

class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const securityHeaders={
  "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"strict-origin-when-cross-origin",
  "X-Frame-Options":"DENY",
  "Permissions-Policy":"camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":"default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://js.puter.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https:; worker-src 'self' blob: https://cdn.jsdelivr.net; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};
function writeHead(res,status,headers={}){res.writeHead(status,{...securityHeaders,...headers});}
function send(res,status,obj){const body=JSON.stringify(obj);writeHead(res,status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(body);}
function readBody(req){return new Promise((resolve,reject)=>{const declared=Number(req.headers['content-length']||0);if(declared>MAX_BODY)return reject(new HttpError(413,'Заявката е твърде голяма.'));let s="",tooLarge=false;req.on("data",c=>{if(tooLarge)return;s+=c;if(Buffer.byteLength(s,'utf8')>MAX_BODY){tooLarge=true;s='';}});req.on("end",()=>{if(tooLarge)return reject(new HttpError(413,'Заявката е твърде голяма.'));try{resolve(JSON.parse(s||"{}"));}catch{reject(new HttpError(400,'Невалиден JSON в заявката.'));}});req.on("error",e=>reject(new HttpError(400,e?.message||'Грешка при четене на заявката.')));});}
function dataUrlToInlineData(dataUrl){const m=String(dataUrl||"").match(/^data:([^;,]+);base64,(.+)$/s);if(!m)throw new HttpError(400,"Невалиден data URL.");return{mimeType:m[1],data:m[2]};}
function extractGeminiText(data){const chunks=[];for(const c of(data?.candidates||[]))for(const p of(c?.content?.parts||[]))if(typeof p?.text==="string")chunks.push(p.text);return chunks.join("\n").trim();}
function parseJsonText(text){const clean=String(text||"").replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();if(!clean)throw new HttpError(502,"AI не върна JSON.");try{return JSON.parse(clean);}catch{}const a=clean.indexOf("{"),b=clean.lastIndexOf("}");if(a>=0&&b>a){try{return JSON.parse(clean.slice(a,b+1));}catch{}}throw new HttpError(502,"AI отговорът не е валиден JSON.");}
function normalizeApiError(provider,status,raw){let msg=raw;try{const j=JSON.parse(raw);msg=j?.error?.message||j?.error||j?.message||raw;}catch{}const low=String(msg).toLowerCase();if(status===429||/quota|rate limit|resource exhausted|insufficient/.test(low))return `${provider}: квотата/лимитът на личния API ключ е достигнат. ${String(msg).slice(0,500)}`;if(status===401||status===403)return `${provider}: API ключът е невалиден, няма достъп или е ограничен. ${String(msg).slice(0,500)}`;return `${provider} HTTP ${status}: ${String(msg).slice(0,700)}`;}
function upstreamError(provider,status,raw){const outward=[400,401,403,429].includes(status)?status:502;return new HttpError(outward,normalizeApiError(provider,status,raw));}

async function callGemini(key,{model,prompt,image,attachments}){
  const parts=[{text:String(prompt||"")}];if(image)parts.push({inlineData:dataUrlToInlineData(image)});for(const item of attachments||[]){if(item?.data)parts.push({inlineData:dataUrlToInlineData(item.data)});}
  const payload={contents:[{role:"user",parts}],generationConfig:{responseMimeType:"application/json",responseJsonSchema:schema}};
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model||"gemini-3.8-flash")}:generateContent`;
  const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify(payload)});const raw=await r.text();if(!r.ok)throw upstreamError("Gemini",r.status,raw);
  let data;try{data=JSON.parse(raw);}catch{throw new HttpError(502,"Gemini върна невалиден HTTP отговор.");}const text=extractGeminiText(data);if(!text)throw new HttpError(502,"Gemini не върна структурирано съдържание.");const out=parseJsonText(text);if(!Array.isArray(out?.questions))throw new HttpError(502,"Gemini отговорът няма questions.");return out;
}
async function callGroq(key,{model,prompt,image,attachments,reasoningEffort}){
  const media=[];if(image)media.push(image);for(const item of attachments||[]){if(item?.data){const parsed=dataUrlToInlineData(item.data);if(!parsed.mimeType.startsWith("image/"))throw new HttpError(400,"Groq fallback приема само изображения.");media.push(item.data);}}
  if(media.length>3)throw new HttpError(400,"Groq Qwen 3.8 приема до 3 изображения в една заявка.");
  const content=media.length?[{type:"text",text:String(prompt||"")},...media.map(url=>({type:"image_url",image_url:{url}}))]:String(prompt||"");
  const payload={model:model||"qwen/qwen3.8-27b",messages:[{role:"user",content}],response_format:{type:"json_schema",json_schema:{name:"biohim_questions",strict:true,schema}},temperature:0.2,reasoning_effort:["low","medium","high"].includes(reasoningEffort)?reasoningEffort:"low"};
  const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify(payload)});const raw=await r.text();if(!r.ok)throw upstreamError("Groq",r.status,raw);
  let data;try{data=JSON.parse(raw);}catch{throw new HttpError(502,"Groq върна невалиден HTTP отговор.");}const text=data?.choices?.[0]?.message?.content;if(!text)throw new HttpError(502,"Groq не върна структурирано съдържание.");const out=parseJsonText(text);if(!Array.isArray(out?.questions))throw new HttpError(502,"Groq отговорът няма questions.");return out;
}

const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const PUBLIC_EXACT=new Set(['/index.html','/biology.html','/chemistry.html','/history-law.html','/theory-law.html','/human-action.html','/law.html','/manifest.json','/service-worker.js','/biohim-v4.css','/biohim-v4.js','/biohim-library.css','/biohim-library.js','/biohim-study.css','/biohim-study.js','/biohim-v4.4.css','/biohim-v4.4.js','/biohim-ai.js','/biohim-64.png','/biohim-192.png','/biohim-512.png','/biohim-logo.png']);
function serveStatic(req,res){let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{return false;}if(pathname==='/')pathname='/index.html';if(pathname==='/biology')pathname='/biology.html';if(pathname==='/chemistry')pathname='/chemistry.html';if(pathname==='/law')pathname='/theory-law.html';if(pathname==='/history-law')pathname='/history-law.html';if(pathname==='/theory-law')pathname='/theory-law.html';if(pathname==='/human-action')pathname='/human-action.html';const publicAsset=PUBLIC_EXACT.has(pathname)||/^\/assets\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp|svg|ico)$/i.test(pathname);if(!publicAsset)return false;const file=path.resolve(__dirname,'.'+pathname);const root=path.resolve(__dirname)+path.sep;if(!file.startsWith(root))return false;if(!fs.existsSync(file)||!fs.statSync(file).isFile())return false;writeHead(res,200,{"Content-Type":mime[path.extname(file).toLowerCase()]||'application/octet-stream',"Cache-Control":path.extname(file)==='.html'?'no-cache':'public, max-age=3600'});fs.createReadStream(file).pipe(res);return true;}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{ok:true,provider:'BioHim AI Gateway',primary:'Puter.js',fallbacks:['Gemini BYOK','Groq BYOK'],version:'4.4'});
  if(req.method==='POST'&&url.pathname==='/api/byok/structured'){
    try{
      const key=String(req.headers['x-biohim-api-key']||'').trim();if(!key)throw new HttpError(401,'Липсва личен API ключ.');
      const body=await readBody(req),provider=String(body.provider||'').toLowerCase();
      if(provider==='gemini')return send(res,200,await callGemini(key,body));
      if(provider==='groq')return send(res,200,await callGroq(key,body));
      throw new HttpError(400,'Невалиден резервен AI доставчик.');
    }catch(e){const status=Number(e?.status)||500;console.error('BioHim 4.4 BYOK request failed:',e?.message||e);return send(res,status,{error:e?.message||String(e)});}
  }
  if(url.pathname.startsWith('/api/vision')||url.pathname.startsWith('/api/generate'))return send(res,410,{error:'BioHim 4.4 използва Puter като основен AI и /api/byok/structured само за лични резервни ключове.'});
  if(serveStatic(req,res))return;
  writeHead(res,404,{"Content-Type":"text/plain; charset=utf-8"});res.end('Not found');
});
server.listen(PORT,HOST,()=>{console.log(`BioHim 4.4: http://${HOST}:${PORT}`);console.log('Основен AI: Puter. Не е необходим общ API ключ. Резервният Gemini/Groq ключ се предоставя от потребителя само при нужда.');});
