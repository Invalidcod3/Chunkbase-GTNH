// Import only names used by the current resource catalogue, never remote code.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
export function parseLanguage(source){
  const entries=new Map();
  for(let line of source.replace(/^\uFEFF/,'').split(/\r?\n/)){
    line=line.trim();if(!line||line.startsWith('#')||!line.includes('='))continue;
    const at=line.indexOf('=');let key=line.slice(0,at).trim().replace(/^S:/,'');
    if(key.startsWith('"')&&key.endsWith('"'))key=key.slice(1,-1);
    entries.set(key,line.slice(at+1).trim().replace(/§./g,''));
  }
  return entries;
}
const normalize=s=>s.toLowerCase().replace(/\s+/g,'');
async function build(){
  const source=path.join(root,'artifacts/translation-source');
  const zh=parseLanguage(await fs.readFile(path.join(source,'GregTech.lang'),'utf8'));
  const en=parseLanguage(await fs.readFile(path.join(source,'GregTech_US.lang'),'utf8'));
  const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8'));
  const profiles=await Promise.all(['resource-profile','asteroid-resource-profile'].map(name=>fs.readFile(path.join(root,'private-packs/runtime-session/'+name+'.json'),'utf8').then(JSON.parse)));
  const displays=[...Object.values(profiles[0].ores),...profiles[0].dimensions.flatMap(d=>(d.fluids||[]).map(e=>e.display).filter(Boolean)),...profiles[1].dimensions.flatMap(d=>d.materials.flatMap(m=>[...m.veins,...m.small].map(e=>e.display)))];
  const wanted=new Set(displays.flatMap(d=>[d.name,d.materials||'']).flatMap(s=>s.split(/[,，&\[\]]/)).map(s=>s.trim()).filter(Boolean));
  const materials=[...zh.keys()].filter(k=>k.startsWith('Material.')&&!k.endsWith('.ChemicalFormula'));
  const byKey=new Map(materials.map(k=>[normalize(k.slice(9)),k]));
  const byEnglish=new Map(materials.filter(k=>en.has(k)).map(k=>[normalize(en.get(k)),k]));
  const byChinese=new Map(materials.map(k=>[normalize(zh.get(k)),k]));
  const matches=new Map(),unmatched=[];
  for(const term of wanted){
    const key=byKey.get(normalize(term))||byEnglish.get(normalize(term))||byChinese.get(normalize(term));
    if(!key){unmatched.push(term);continue;}
    if(!matches.has(key))matches.set(key,new Set());matches.get(key).add(term);
  }
  const terms=[],evidence=[];
  for(const [key,aliases] of [...matches].sort(([a],[b])=>a.localeCompare(b))){
    const english=[...aliases].find(s=>/^[\x20-\x7e]+$/.test(s)&&normalize(s)!==normalize(zh.get(key)))||en.get(key)||zh.get(key);
    terms.push([english,zh.get(key),...aliases]);evidence.push({key,en:english,zh:zh.get(key)});
  }
  const untranslatedEnglish=unmatched.filter(s=>/^[\x20-\x7e]+$/.test(s));
  if(untranslatedEnglish.length)throw Error('Unmatched English material names: '+untranslatedEnglish.join(', '));
  const out=path.join(root,'dist/i18n');await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'resource-terms.js'),'// Generated from Kiwi233/Translation-of-GTNH; see resource-translation-sources.json.\nexport const resourceTerms = '+JSON.stringify(terms,null,2)+';\n');
  await fs.writeFile(path.join(out,'resource-translation-sources.json'),JSON.stringify({...manifest,translationNotice:'README: translation content is CC-BY-NC-SA; repository LICENSE: MIT. See bundled notices.',entries:evidence,unmatchedExistingNames:unmatched.sort()},null,2)+'\n');
  await fs.copyFile(path.join(source,'LICENSE'),path.join(out,'Translation-of-GTNH-LICENSE.txt'));
  await fs.writeFile(path.join(out,'Translation-of-GTNH-NOTICE.txt'),'Translations by Kiwi233 and Translation-of-GTNH contributors.\nSource: '+manifest.repository+'\nRevision: '+manifest.revision+'\nUpstream README states: 汉化部分采用 CC-BY-NC-SA 协议\nThe repository also includes an MIT LICENSE, reproduced alongside this notice.\nThis subset extracts material names and pairs them with English names for the web UI.\n');
  console.log(`Imported ${terms.length} material names; all current English mineral names matched. Preserved ${unmatched.length} existing names without a material-key match.`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await build();
