import {resourceTerms} from './i18n/resource-terms.js';
const normalize=value=>value.toLowerCase().replace(/\s+/g,'');
const terms=new Map(),cache=new Map();
for(const [en,zh,...aliases] of resourceTerms){
  const pair={en,zh};
  for(const name of [en,zh,...aliases])terms.set(normalize(name),pair);
}

export function localizeResourceText(value,language='zh'){
  const text=String(value??''),lang=language==='en'?'en':'zh',cacheKey=lang+':'+text;
  if(cache.has(cacheKey))return cache.get(cacheKey);
  // Match whole material names first (including chemical names with commas).
  // Never replace substrings such as Iron inside another material's name.
  const whole=terms.get(normalize(text));
  const result=whole?.[lang]??text.split(/([,，&\[\]])/).map(part=>{
    const translation=terms.get(normalize(part))?.[lang];
    return translation?part.replace(part.trim(),translation):part;
  }).join('');
  if(cache.size>=2048)cache.delete(cache.keys().next().value);
  cache.set(cacheKey,result);return result;
}

export function resourceName(resource,language='zh'){
  return localizeResourceText(resource.name||resource.id||'',language);
}

export function resourceSearchText(resource){
  return [resource.id,resource.name,resource.materials,
    resourceName(resource,'zh'),resourceName(resource,'en'),
    localizeResourceText(resource.materials,'zh'),localizeResourceText(resource.materials,'en')].join(' ').toLowerCase();
}
