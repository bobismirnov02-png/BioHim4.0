import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||8787);
const API_KEY=process.env.GEMINI_API_KEY;
const MODEL=process.env.GEMINI_MODEL||"gemini-3.8-flash";
const HOST=process.env.HOST||(process.env.RENDER?"0.0.0.0":"127.0.0.1");
if(!API_KEY){console.error("Липсва GEMINI_API_KEY.");process.exit(1);}

const schema={type:"object",additionalProperties:false,properties:{questions:{type:"array",items:{type:"object",additionalProperties:false,properties:{type:{type:"string",enum:["mcq","open","yesno","combo"]},number:{type:"integer"},q:{type:"string"},o:{type:"array",items:{type:"string"},maxItems:4},a:{type:"string",enum:["A","B","C","D",""]},answer:{type:"string"},subpoints:{type:"array",items:{type:"string"},maxItems:8},comboOptions:{type:"array",items:{type:"string"},maxItems:12},comboAnswer:{type:"string"},e:{type:"string"},topic:{type:"string"}},required:["type","number","q","o","a","answer","subpoints","comboOptions","comboAnswer","e","topic"]}}},required:["questions"]};
const FALLBACK_MODELS=["gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash"];
const RETRYABLE_STATUS=new Set([408,429,500,502,503,504]);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const modelCandidates=p=>[...new Set([p||MODEL,...FALLBACK_MODELS].filter(Boolean))];
function send(res,status,obj){const body=JSON.stringify(obj);res.writeHead(status,{"Content-Type":"application/json; charset=utf-8"});res.end(body)}
function readBody(req){return new Promise((resolve,reject)=>{let s="";req.on("data",c=>{s+=c;if(s.length>80*1024*1024)req.destroy(new Error("Request too large"));});req.on("end",()=>{try{resolve(JSON.parse(s||"{}"))}catch(e){reject(e)}});req.on("error",reject);});}
function dataUrlToInlineData(dataUrl){const m=String(dataUrl||"").match(/^data:([^;,]+);base64,(.+)$/s);if(!m)throw new Error("Изображението не е валиден base64 data URL.");return{mimeType:m[1],data:m[2]};}
function extractGeminiText(data){const chunks=[];for(const c of(data?.candidates||[]))for(const p of(c?.content?.parts||[]))if(typeof p?.text==="string")chunks.push(p.text);return chunks.join("\n").trim();}
async function callGeminiModel(model,payload){const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":API_KEY},body:JSON.stringify(payload)});return{ok:r.ok,status:r.status,raw:await r.text()};}
async function gemini({prompt,image,attachments,model}){const parts=[{text:prompt}];if(image)parts.push({inlineData:dataUrlToInlineData(image)});for(const item of(attachments||[])){if(item?.data)parts.push({inlineData:dataUrlToInlineData(item.data)});}const payload={contents:[{role:"user",parts}],generationConfig:{responseMimeType:"application/json",responseJsonSchema:schema}};let lastError=null;for(const candidate of modelCandidates(model)){for(let attempt=0;attempt<2;attempt++){let result;try{result=await callGeminiModel(candidate,payload)}catch(e){lastError=e;if(attempt===0){await sleep(1000+Math.random()*500);continue}break}if(result.ok){const data=JSON.parse(result.raw);const text=extractGeminiText(data);if(!text)throw new Error(`Gemini (${candidate}) не върна текстов отговор.`);return JSON.parse(text);}lastError=new Error(`Gemini ${candidate} HTTP ${result.status}: ${result.raw.slice(0,1000)}`);if(!RETRYABLE_STATUS.has(result.status))throw lastError;if(attempt===0)await sleep(1000+Math.random()*500);}}throw new Error(`Всички Gemini модели са временно недостъпни. ${lastError?.message||""}`);}

const RATE_WINDOW_MS=60*60*1000,RATE_LIMIT=Number(process.env.API_RATE_LIMIT||60),rateBuckets=new Map();
function clientIp(req){return String(req.headers["x-forwarded-for"]||"").split(",")[0].trim()||req.socket.remoteAddress||"unknown"}
function rateAllowed(req){const now=Date.now(),ip=clientIp(req),cur=rateBuckets.get(ip);if(!cur||now-cur.start>=RATE_WINDOW_MS){rateBuckets.set(ip,{start:now,count:1});return true}if(cur.count>=RATE_LIMIT)return false;cur.count++;return true}
setInterval(()=>{const cutoff=Date.now()-RATE_WINDOW_MS;for(const[ip,b]of rateBuckets)if(b.start<cutoff)rateBuckets.delete(ip)},15*60*1000).unref();

function subjectName(s){return s==="law"?"Право":s==="chemistry"?"Химия":"Биология"}
function visionPrompt(body){return `Ти си AI Vision модул на BioHim 4.1.3. Предмет: ${subjectName(body.subject)}. Разгледай САМАТА СНИМКА и възстанови всички видими въпроси в реда им. Различавай mcq, open, yesno и combo. При open пази празните места като ____. При combo пази подточките и точно видимите комбинации. Не измисляй липсващ текст. На първия етап не решавай отговорите. Върни само JSON по схемата.`}
function generationPrompt(body){
  const subject=subjectName(body.subject),type=body.materialType||"topic",count=Math.max(1,Math.min(30,Number(body.count)||10)),title=String(body.title||"").trim(),materials=Array.isArray(body.materials)?body.materials:[];
  const style=["open","mcq","mixed"].includes(body.cardStyle)?body.cardStyle:"mixed";
  const difficulty=["easy","medium","hard","university"].includes(body.difficulty)?body.difficulty:"medium";
  const names=materials.map(x=>String(x?.name||"").trim()).filter(Boolean);
  const styleText=style==="open"?"Всички карти да са type=open (въпрос → кратък отговор).":style==="mcq"?"Всички карти да са type=mcq с точно 4 смислени варианта и един правилен отговор A/B/C/D.":"Използвай смес от type=open, mcq и yesno, като преобладават open и mcq. Не използвай combo освен ако материалът естествено го изисква.";
  const difficultyText={easy:"лесно ниво: основни понятия и директно възпроизвеждане",medium:"средно ниво: понятия, връзки и разбиране",hard:"трудно ниво: разграничения, причинно-следствени връзки и приложение",university:"университетско ниво: точна терминология, концептуални разграничения и по-задълбочено разбиране"}[difficulty];
  let strict;
  if(materials.length){strict=`Използвай САМО факти, които се съдържат в предоставените ${materials.length} учебни файла${names.length?` (${names.join(", ")})`:""}. Разглеждай ги като части от един общ учебен материал. Не добавяй външни факти. Прочети внимателно всички изображения и всички страници на PDF файловете.`;}
  else{strict=`Няма предоставен изходен файл. Създай карти по общоприети, устойчиви учебни знания за темата. При Право избягвай конкретни номера на членове, срокове и други променливи нормативни детайли, освен ако не са дадени в материала.`;}
  return `Ти си преподавател по ${subject} в BioHim 4.1.3. Създай точно ${count} качествени флаш карти. Източник: ${type}. Заглавие/тема: ${title||"не е посочено"}. Ниво: ${difficultyText}. ${styleText} Всеки въпрос да проверява отделно знание; да няма дублиране. Покрий равномерно най-важните идеи от всички файлове. За open попълни answer; за mcq попълни o и a; за yesno попълни answer с Да/Не. Полето e да съдържа кратко учебно обяснение, topic да е конкретната подтема. Номерирай от 1. ${strict} Върни само JSON по схемата.`;
}

const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8','.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
function serveStatic(req,res){let pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/')pathname='/index.html';if(pathname==='/biology')pathname='/biology.html';if(pathname==='/chemistry')pathname='/chemistry.html';if(pathname==='/law')pathname='/law.html';const file=path.normalize(path.join(__dirname,pathname));if(!file.startsWith(__dirname))return false;if(!fs.existsSync(file)||!fs.statSync(file).isFile())return false;res.writeHead(200,{"Content-Type":mime[path.extname(file).toLowerCase()]||'application/octet-stream'});fs.createReadStream(file).pipe(res);return true;}

const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/api/health')return send(res,200,{ok:true,provider:'Google Gemini',model:MODEL,fallbackModels:FALLBACK_MODELS,version:'4.1.3'});
  if(req.method==='POST'&&req.url==='/api/vision'){
    if(!rateAllowed(req))return send(res,429,{error:'Твърде много AI заявки. Опитай отново по-късно.'});
    try{const body=await readBody(req);if(!['extract','solve'].includes(body.stage))throw new Error('Невалиден stage.');if(body.stage==='extract'&&!body.image)throw new Error('Липсва image.');const prompt=body.prompt||(body.stage==='extract'?visionPrompt(body):'Определи правилните отговори и върни JSON по схемата.');return send(res,200,await gemini({prompt,image:body.stage==='extract'?body.image:null,model:body.model}));}catch(e){console.error(e);return send(res,String(e.message).includes('временно недостъпни')?503:500,{error:e.message||String(e)})}
  }
  if(req.method==='POST'&&req.url==='/api/generate'){
    if(!rateAllowed(req))return send(res,429,{error:'Твърде много AI заявки. Опитай отново по-късно.'});
    try{const body=await readBody(req);if(!['biology','chemistry','law'].includes(body.subject))throw new Error('Невалиден предмет.');const materials=Array.isArray(body.materials)?body.materials:[];if(materials.length>10)throw new Error('Максимум 10 учебни файла наведнъж.');if((body.materialType==='lesson'||body.materialType==='chapter')&&!materials.length)throw new Error('За урок или глава е необходима поне една снимка или PDF.');for(const item of materials){if(!item?.data)throw new Error('Липсват данни за учебен файл.');const parsed=dataUrlToInlineData(item.data);if(!parsed.mimeType.startsWith('image/')&&parsed.mimeType!=='application/pdf')throw new Error('Учебните файлове трябва да са изображения или PDF.');}if(body.materialType==='topic'&&!String(body.title||'').trim()&&!materials.length)throw new Error('Въведи тема или качи учебни файлове.');return send(res,200,await gemini({prompt:generationPrompt(body),attachments:materials,model:body.model||MODEL}));}catch(e){console.error(e);return send(res,String(e.message).includes('временно недостъпни')?503:500,{error:e.message||String(e)})}
  }
  if(req.method==='GET'&&serveStatic(req,res))return;
  return send(res,404,{error:'Not found'});
});
server.listen(PORT,HOST,()=>console.log(`BioHim 4.1.3: http://${HOST}:${PORT}`));
