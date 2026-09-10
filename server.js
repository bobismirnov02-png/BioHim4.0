import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||8787);
const HOST=process.env.HOST||(process.env.RENDER?"0.0.0.0":"127.0.0.1");

const schema={type:"object",additionalProperties:false,properties:{questions:{type:"array",items:{type:"object",additionalProperties:false,properties:{type:{type:"string",enum:["mcq","open","yesno","combo"]},number:{type:"integer"},q:{type:"string"},o:{type:"array",items:{type:"string"},maxItems:4},a:{type:"string",enum:["A","B","C","D",""]},answer:{type:"string"},subpoints:{type:"array",items:{type:"string"},maxItems:8},comboOptions:{type:"array",items:{type:"string"},maxItems:12},comboAnswer:{type:"string"},e:{type:"string"},topic:{type:"string"}},required:["type","number","q","o","a","answer","subpoints","comboOptions","comboAnswer","e","topic"]}}},required:["questions"]};

function send(res,status,obj){const body=JSON.stringify(obj);res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(body);}
function readBody(req){return new Promise((resolve,reject)=>{let s="";req.on("data",c=>{s+=c;if(s.length>85*1024*1024)req.destroy(new Error("Request too large"));});req.on("end",()=>{try{resolve(JSON.parse(s||"{}"));}catch(e){reject(e);}});req.on("error",reject);});}
function dataUrlToInlineData(dataUrl){const m=String(dataUrl||"").match(/^data:([^;,]+);base64,(.+)$/s);if(!m)throw new Error("Невалиден data URL.");return{mimeType:m[1],data:m[2]};}
function extractGeminiText(data){const chunks=[];for(const c of(data?.candidates||[]))for(const p of(c?.content?.parts||[]))if(typeof p?.text==="string")chunks.push(p.text);return chunks.join("\n").trim();}
function parseJsonText(text){const clean=String(text||"").replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();if(!clean)throw new Error("AI не върна JSON.");try{return JSON.parse(clean);}catch{}const a=clean.indexOf("{"),b=clean.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(clean.slice(a,b+1));throw new Error("AI отговорът не е валиден JSON.");}
function normalizeApiError(provider,status,raw){let msg=raw;try{const j=JSON.parse(raw);msg=j?.error?.message||j?.error||j?.message||raw;}catch{}const low=String(msg).toLowerCase();if(status===429||/quota|rate limit|resource exhausted|insufficient/.test(low))return `${provider}: квотата/лимитът на личния API ключ е достигнат. ${String(msg).slice(0,500)}`;if(status===401||status===403)return `${provider}: API ключът е невалиден, няма достъп или е ограничен. ${String(msg).slice(0,500)}`;return `${provider} HTTP ${status}: ${String(msg).slice(0,700)}`;}

async function callGemini(key,{model,prompt,image,attachments}){
  const parts=[{text:String(prompt||"")}];
  if(image)parts.push({inlineData:dataUrlToInlineData(image)});
  for(const item of attachments||[]){if(item?.data)parts.push({inlineData:dataUrlToInlineData(item.data)});}
  const payload={contents:[{role:"user",parts}],generationConfig:{responseMimeType:"application/json",responseJsonSchema:schema}};
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model||"gemini-3.8-flash")}:generateContent`;
  const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify(payload)});
  const raw=await r.text();if(!r.ok)throw new Error(normalizeApiError("Gemini",r.status,raw));
  let data;try{data=JSON.parse(raw);}catch{throw new Error("Gemini върна невалиден HTTP отговор.");}
  const text=extractGeminiText(data);if(!text)throw new Error("Gemini не върна структурирано съдържание.");const out=parseJsonText(text);if(!Array.isArray(out?.questions))throw new Error("Gemini отговорът няма questions.");return out;
}

async function callGroq(key,{model,prompt,image,attachments,reasoningEffort}){
  const media=[];if(image)media.push(image);
  for(const item of attachments||[]){if(item?.data){const parsed=dataUrlToInlineData(item.data);if(parsed.mimeType==="application/pdf")throw new Error("Groq fallback в BioHim 4.2 не поддържа PDF. Избери Gemini като резервен доставчик за PDF.");if(parsed.mimeType.startsWith("image/"))media.push(item.data);}}
  if(media.length>3)throw new Error("Groq Qwen 3.8 приема до 3 изображения в една заявка.");
  const content=media.length?[{type:"text",text:String(prompt||"")},...media.map(url=>({type:"image_url",image_url:{url}}))]:String(prompt||"");
  const payload={model:model||"qwen/qwen3.8-27b",messages:[{role:"user",content}],response_format:{type:"json_schema",json_schema:{name:"biohim_questions",strict:true,schema}},temperature:0.2,reasoning_effort:["low","medium","high"].includes(reasoningEffort)?reasoningEffort:"low"};
  const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify(payload)});
  const raw=await r.text();if(!r.ok)throw new Error(normalizeApiError("Groq",r.status,raw));
  let data;try{data=JSON.parse(raw);}catch{throw new Error("Groq върна невалиден HTTP отговор.");}
  const text=data?.choices?.[0]?.message?.content;if(!text)throw new Error("Groq не върна структурирано съдържание.");const out=parseJsonText(text);if(!Array.isArray(out?.questions))throw new Error("Groq отговорът няма questions.");return out;
}

const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8','.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
function serveStatic(req,res){let pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/')pathname='/index.html';if(pathname==='/biology')pathname='/biology.html';if(pathname==='/chemistry')pathname='/chemistry.html';if(pathname==='/law')pathname='/law.html';const file=path.normalize(path.join(__dirname,pathname));if(!file.startsWith(__dirname))return false;if(!fs.existsSync(file)||!fs.statSync(file).isFile())return false;res.writeHead(200,{"Content-Type":mime[path.extname(file).toLowerCase()]||'application/octet-stream'});fs.createReadStream(file).pipe(res);return true;}

const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/api/health')return send(res,200,{ok:true,provider:'BioHim AI Gateway',primary:'Puter.js',fallbacks:['Gemini BYOK','Groq BYOK'],version:'4.2'});
  if(req.method==='POST'&&req.url==='/api/byok/structured'){
    try{
      const key=String(req.headers['x-biohim-api-key']||'').trim();if(!key)throw new Error('Липсва личен API ключ.');
      const body=await readBody(req),provider=String(body.provider||'').toLowerCase();
      if(provider==='gemini')return send(res,200,await callGemini(key,body));
      if(provider==='groq')return send(res,200,await callGroq(key,body));
      throw new Error('Невалиден резервен AI доставчик.');
    }catch(e){console.error('BioHim 4.2 BYOK request failed:',e?.message||e);return send(res,500,{error:e?.message||String(e)});}
  }
  if(req.url.startsWith('/api/vision')||req.url.startsWith('/api/generate'))return send(res,410,{error:'BioHim 4.2 използва Puter като основен AI и /api/byok/structured само за лични резервни ключове.'});
  if(serveStatic(req,res))return;
  res.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"});res.end('Not found');
});
server.listen(PORT,HOST,()=>{console.log(`BioHim 4.2: http://${HOST}:${PORT}`);console.log('Основен AI: Puter. Не е необходим общ API ключ. Резервният Gemini/Groq ключ се предоставя от потребителя само при нужда.');});
