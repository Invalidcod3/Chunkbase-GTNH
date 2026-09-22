import {dimensionBiomes} from './biome-selection.js';
import {biomeRegistry} from './engine/catalog.js';
import {resourceIcon} from './resource-icons.js';
import {resourceName} from './resource-names.js';
const iconRoot = './assets/ui/';
const layerIcons = {STRUCTURE: 'map-pin.svg', ORES: 'box.svg', FLUID: 'droplet.svg'};
// GT5 DimensionHelper.INTERNAL_TO_ABBR, also used by Amidst's worker.
export const dimensionIcons = {overworld:'Ow',nether:'Ne',end:'ED',twilight:'TF',moon:'Mo',mars:'Ma',ceres:'Ce',io:'Io',enceladus:'En',proteus:'Pr',pluto:'Pl',ross128b:'Rb',ross128ba:'Ra',barnarda_c:'BC',barnarda_e:'BE',barnarda_f:'BF',haumea:'Ha',vega_b:'VB',tau_ceti_e:'TE',miranda:'Mi',makemake:'MM',neper:'Np',maahes:'Mh',anubis:'An',horus:'Ho',asteroids:'As',seth:'Se',centauri_bb:'CB',mehen:'MB',kuiper_belt:'KB',europa:'Eu',everglades:'Eg',mercury:'Me',phobos:'Ph',venus:'Ve',deimos:'De',ganymede:'Ga',titan:'Ti',callisto:'Ca',oberon:'Ob',triton:'Tr',deep_dark:'DD'};

export function coordinateDestination(axis, text, centre) {
  const raw = String(text).trim();
  if (!['x','z'].includes(axis) || !/^-?\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || Math.abs(value) > 29999000) return null;
  return {...centre, [axis]: value};
}

function icon(src, symbolic = false) {
  if (symbolic) {
    const span = document.createElement('span');
    span.className = 'ui-icon';
    span.style.setProperty('--icon', `url("${src}")`);
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
  const image = document.createElement('img');
  image.className = 'menu-icon'; image.alt = ''; image.src = src;
  return image;
}

let activeMenu;
function createIconSelect(host, select, imageFor) {
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
  const popup = document.createElement('div');
  popup.id = `${select.id}-options`; popup.className = 'select-popup';
  popup.setAttribute('role', 'listbox'); popup.hidden = true; popup.inert = true;
  popup.setAttribute('aria-hidden','true');
  trigger.setAttribute('aria-controls', popup.id);
  const labelId = select.getAttribute('aria-labelledby');
  popup.setAttribute('aria-labelledby', labelId);
  select.hidden = true;
  host.append(trigger, popup);
  let signature = '', closeTimer;
  function close(restore = false) {
    host.dataset.open = 'false'; trigger.setAttribute('aria-expanded', 'false'); popup.inert = true;
    popup.setAttribute('aria-hidden','true');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {popup.hidden = true;}, 180);
    if (activeMenu === api) activeMenu = null;
    if (restore) trigger.focus();
  }
  function choose(value) {
    if (select.value !== value) {
      select.value = value;
      // The original change handler validates the seed and may restore selection.
      select.dispatchEvent(new Event('change', {bubbles:true}));
    }
    sync(); close(true);
  }
  function sync() {
    const options = [...select.options];
    const next = JSON.stringify(options.map(o=>[o.value,o.textContent,o.disabled]));
    if (next !== signature) {
      signature = next;
      popup.replaceChildren(...options.map(o => {
        const row = document.createElement('div');
        row.className = 'select-option'; row.tabIndex = -1; row.dataset.value = o.value;
        row.setAttribute('role', 'option'); row.setAttribute('aria-disabled', String(o.disabled));
        const image = imageFor(o.value), label = document.createElement('span'), check = document.createElement('span');
        label.textContent = o.textContent; check.className = 'option-check'; check.textContent = '✓'; check.setAttribute('aria-hidden','true');
        row.append(icon(image.src,image.symbolic), label, check);
        row.onclick = () => {if (!o.disabled) choose(o.value);};
        return row;
      }));
    }
    const selected = select.selectedOptions[0];
    const image = imageFor(select.value), label = document.createElement('span'), chevron = document.createElement('span');
    label.className = 'selected-label'; label.textContent = selected?.textContent || '—';
    chevron.className = 'chevron'; chevron.setAttribute('aria-hidden','true');
    trigger.replaceChildren(icon(image.src,image.symbolic),label,chevron);
    trigger.setAttribute('aria-label', `${document.getElementById(labelId).textContent}: ${label.textContent}`);
    popup.querySelectorAll('[role=option]').forEach(row=>row.setAttribute('aria-selected', String(row.dataset.value === select.value)));
  }
  function open(last = false) {
    if (activeMenu && activeMenu !== api) activeMenu.close();
    clearTimeout(closeTimer); sync(); popup.hidden = false; popup.inert = false;
    // Commit the initial opacity before transitioning, including rapid reopen.
    void popup.offsetHeight;
    host.dataset.open = 'true'; popup.setAttribute('aria-hidden','false'); trigger.setAttribute('aria-expanded','true'); activeMenu = api;
    const rows = [...popup.querySelectorAll('[role=option]:not([aria-disabled=true])')];
    const target = rows.find(row=>row.dataset.value === select.value) || (last ? rows.at(-1) : rows[0]);
    requestAnimationFrame(()=>{
      if(activeMenu!==api)return;
      target?.focus({preventScroll:true}); target?.scrollIntoView({block:'nearest'});
    });
  }
  trigger.onclick = () => host.dataset.open === 'true' ? close() : open();
  trigger.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {e.preventDefault(); open(e.key === 'ArrowUp');}
    if (e.key === 'Escape') close();
  };
  let search = '', searchTimer;
  popup.onkeydown = e => {
    const rows = [...popup.querySelectorAll('[role=option]:not([aria-disabled=true])')];
    const index = rows.indexOf(document.activeElement);
    let next;
    if (e.key === 'ArrowDown') next = (index+1)%rows.length;
    if (e.key === 'ArrowUp') next = (index-1+rows.length)%rows.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = rows.length-1;
    if (next !== undefined) {e.preventDefault(); rows[next]?.focus();}
    else if (e.key === 'Enter' || e.key === ' ') {e.preventDefault(); if(index>=0)choose(rows[index].dataset.value);}
    else if (e.key === 'Escape') {e.preventDefault();e.stopPropagation();close(true);}
    else if (e.key === 'Tab') {close();trigger.focus();}
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      search += e.key.toLocaleLowerCase(); clearTimeout(searchTimer); searchTimer = setTimeout(()=>{search='';},600);
      rows.find(row=>row.textContent.toLocaleLowerCase().startsWith(search))?.focus();
    }
  };
  document.addEventListener('pointerdown', e => {if (!host.contains(e.target)) close();});
  const api = {sync,close};
  sync(); return api;
}

export function createThemeUI({view, getState, onResourceChange, onBiomeChange, toast}) {
  const $ = id => document.getElementById(id);
  const dimensionMenu = createIconSelect($('dimension-menu'),$('dimension'),value=>({src:dimensionIcons[value] ? `${iconRoot}dimension-${dimensionIcons[value]}.png` : `${iconRoot}stone.png`}));
  const layerMenu = createIconSelect($('layer-menu'),$('marker-mode'),value=>({src:iconRoot+(layerIcons[value] || 'map-pin.svg'),symbolic:true}));
  const panel = $('filter-panel'), toggle = $('sidebar-toggle'), reopen = $('sidebar-reopen');
  let lang = 'zh', editing = null, scope = '', resourceSignature = '';
  const exclusions = new Map();
  function collapse(value) {
    const moveFocus=value ? panel.contains(document.activeElement) : document.activeElement===reopen;
    panel.classList.toggle('is-collapsed',value); panel.inert = value;
    reopen.inert=!value;reopen.tabIndex=value?0:-1;
    reopen.setAttribute('aria-hidden',String(!value));
    reopen.title=lang==='zh'?'展开筛选面板':'Expand filters';
    reopen.setAttribute('aria-label',reopen.title);
    toggle.setAttribute('aria-expanded',String(!value));
    toggle.title = lang==='zh' ? (value?'展开筛选面板':'收起筛选面板') : (value?'Expand filters':'Collapse filters');
    toggle.setAttribute('aria-label',toggle.title);
    if(moveFocus)(value?reopen:toggle).focus({preventScroll:true});
  }
  collapse(matchMedia('(max-width:700px)').matches);
  toggle.onclick = () => collapse(!panel.classList.contains('is-collapsed'));
  reopen.onclick = () => collapse(false);
  for (const button of document.querySelectorAll('.section-toggle')) {
    const body = $(button.getAttribute('aria-controls'));
    button.onclick = () => {
      const closed = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded',String(!closed)); body.classList.toggle('is-closed',closed); body.inert = closed;
    };
  }
  function updateCoordinates() {
    for(const axis of ['x','z']) {
      const value = Math.floor(view[axis]);
      $(`coordinate-${axis}`).textContent = value.toLocaleString(lang==='zh'?'zh-CN':'en-US');
      if(editing!==axis)$(`goto-${axis}`).value = value;
    }
  }
  function finishEdit() {
    if(!editing)return;
    const axis=editing; editing=null;
    $(`goto-${axis}`).hidden=true; $(`coordinate-${axis}`).hidden=false;
    updateCoordinates();
  }
  for(const axis of ['x','z']) {
    const button=$(`coordinate-${axis}`), input=$(`goto-${axis}`);
    function edit() {
      finishEdit(); editing=axis;
      input.value=Math.floor(view[axis]);button.hidden=true;input.hidden=false;input.focus();input.select();
    }
    button.ondblclick=edit;
    button.onkeydown=e=>{if(['Enter','F2',' '].includes(e.key)){e.preventDefault();edit();}};
    input.onkeydown=e=>{
      if(e.key==='Escape'){e.preventDefault();finishEdit();button.focus();}
    };
    input.onblur=()=>finishEdit();
  }
  // Capture the coordinate form before the legacy two-input handler. Preserve
  // the untouched axis exactly, even when the camera is at a fractional point.
  $('goto-form').addEventListener('submit',e=>{
    e.preventDefault();e.stopImmediatePropagation();
    if(!editing)return;
    const axis=editing, input=$(`goto-${axis}`);
    const target=coordinateDestination(axis,input.value,{x:view.x,z:view.z});
    if(!target){toast(lang==='zh'?'坐标须为 ±29,999,000 范围内的整数':'Enter an integer from −29,999,000 to 29,999,000.');return;}
    finishEdit();view.goto(target.x,target.z);$(`coordinate-${axis}`).focus();
  },true);
  function setExcluded(values) {
    view.resourceFilter.excludedIds=[...values]; view.resourceFilter.id='';$('resource-type').value='';
    exclusions.set(scope,[...values]);
    refreshResourceChecks();onResourceChange();
  }
  function options() {
    const state=getState();return state.dimensions.find(d=>d.key===state.dimension)?.resourceOptions?.[view.markerMode] || [];
  }
  function refreshResourceChecks() {
    const hidden=new Set(view.resourceFilter.excludedIds || []);
    for(const row of $('resource-filters').children)row.querySelector('input').checked=!hidden.has(row.dataset.id);
  }
  $('resources-all').onclick=()=>setExcluded([]);
  $('resources-none').onclick=()=>setExcluded(options().map(o=>o.id));
  let biomeSignature='';
  function refreshBiomeChecks() {
    $('biome-highlight').checked=view.biomeSelection.enabled;
    for(const row of $('biome-filters').children)row.querySelector('input').checked=view.biomeSelection.isSelected(row.dataset.key);
  }
  function filterBiomes() {
    const query=$('biome-search').value.trim().toLocaleLowerCase();let visible=0;
    for(const row of $('biome-filters').children){row.hidden=!row.dataset.search.includes(query);if(!row.hidden)visible++;}
    $('biome-empty').hidden=visible>0;
    $('biome-empty').textContent=lang==='zh'?(biomeRows.length?'没有匹配的生物群系':'当前维度暂无生物群系底图'):(biomeRows.length?'No matching biomes':'No biome map for this dimension');
  }
  let biomeRows=[];
  function changeBiomes() {refreshBiomeChecks();view.recolorTiles();onBiomeChange();}
  $('biome-highlight').onchange=e=>{view.biomeSelection.enabled=e.target.checked;changeBiomes();};
  $('biomes-all').onclick=()=>{view.biomeSelection.selectAll(true);changeBiomes();};
  $('biomes-none').onclick=()=>{view.biomeSelection.selectAll(false);changeBiomes();};
  $('biome-search').oninput=filterBiomes;
  function syncBiomes(state) {
    const d=state.dimensions.find(d=>d.key===state.dimension);
    biomeRows=dimensionBiomes(d,biomeRegistry.indices);
    const signature=JSON.stringify([state.dimension,lang,biomeRows.map(b=>[b.key,b[lang],b.color])]);
    if(signature!==biomeSignature){
      biomeSignature=signature;
      $('biome-filters').replaceChildren(...biomeRows.map(b=>{
        const row=document.createElement('label');row.className='filter-row';row.dataset.key=b.key;row.title=b.key;
        row.dataset.search=[b.zh,b.en,b.key].join(' ').toLocaleLowerCase();
        const input=document.createElement('input');input.type='checkbox';input.onchange=()=>{view.biomeSelection.toggle(b.key);changeBiomes();};
        const swatch=document.createElement('span');swatch.className='biome-swatch';swatch.style.backgroundColor=b.color;swatch.setAttribute('aria-hidden','true');
        const name=document.createElement('span');name.className='filter-name';name.textContent=b[lang] || b.en;
        row.append(input,swatch,name);return row;
      }));
    }
    $('biome-highlight-label').textContent=lang==='zh'?'启用生物群系筛选':'Enable biome highlighting';
    $('biome-highlight').title=lang==='zh'?'选中群系保留原色，其余群系变暗':'Selected biomes retain their color; others are dimmed';
    $('biome-search').placeholder=lang==='zh'?'搜索生物群系…':'Search biomes…';
    $('biome-search').setAttribute('aria-label',lang==='zh'?'搜索生物群系':'Search biomes');
    refreshBiomeChecks();filterBiomes();
  }
  function sync() {
    const state=getState();lang=state.language;
    dimensionMenu.sync();layerMenu.sync();collapse(panel.classList.contains('is-collapsed'));
    syncBiomes(state);
    const resource=view.markerMode!=='STRUCTURE';
    $('structure-section').hidden=resource;$('resource-section').hidden=!resource;
    $('resource-section-title').textContent=lang==='zh'?(view.markerMode==='FLUID'?'流体矿脉':'矿脉'):(view.markerMode==='FLUID'?'Underground fluids':'Ore veins');
    $('resource-section-icon').className='ui-icon '+(view.markerMode==='FLUID'?'droplet':'box');
    const nextScope=state.dimension+':'+view.markerMode;
    if(scope!==nextScope){
      if(scope)exclusions.set(scope,[...(view.resourceFilter.excludedIds || [])]);
      view.resourceFilter.excludedIds=exclusions.get(nextScope) || (!scope ? view.resourceFilter.excludedIds || [] : []);
      scope=nextScope;
    }
    const entries=options();
    // Migrate a saved single-resource filter into the new checkbox selection.
    if(view.resourceFilter.id && entries.some(o=>o.id===view.resourceFilter.id)){
      view.resourceFilter.excludedIds=entries.filter(o=>o.id!==view.resourceFilter.id).map(o=>o.id);
      view.resourceFilter.id='';$('resource-type').value='';
    }
    const signature=JSON.stringify([scope,lang,entries]);
    if(signature!==resourceSignature){
      resourceSignature=signature;
      $('resource-filters').replaceChildren(...entries.map(o=>{
        const row=document.createElement('label');row.className='filter-row';row.dataset.id=o.id;row.title=o.id;
        const input=document.createElement('input');input.type='checkbox';
        const symbol=document.createElement('span');symbol.className='filter-symbol';
        const texture=resourceIcon(state.dimension,view.markerMode,o.id,'cube');
        symbol.append(texture?icon(texture):icon(iconRoot+layerIcons[view.markerMode],true));
        const text=document.createElement('span');text.className='filter-name';text.textContent=resourceName(o,lang);
        input.onchange=()=>{const hidden=new Set(view.resourceFilter.excludedIds || []);input.checked?hidden.delete(o.id):hidden.add(o.id);setExcluded(hidden);};
        row.append(input,symbol,text);return row;
      }));
    }
    refreshResourceChecks();
    $('seed').placeholder=lang==='zh'?'输入种子…':'Enter a seed…';
    for(const [id,zh,en] of [['random','随机种子','Random seed'],['settings-open','设置','Settings'],['about-open','信息','Information'],['language','切换至 English','Switch to 简体中文'],['home','回到原点','Back to origin'],['zoom-in','放大','Zoom in'],['zoom-out','缩小','Zoom out'],['copy-coordinates','复制坐标','Copy coordinates'],['coordinate-x','双击编辑 X 坐标','Double-click to edit X'],['coordinate-z','双击编辑 Z 坐标','Double-click to edit Z']]){
      $(id).title=lang==='zh'?zh:en;$(id).setAttribute('aria-label',$(id).title);
    }
    $('filter-panel').setAttribute('aria-label',lang==='zh'?'筛选面板':'Filters');
    updateCoordinates();
  }
  return {sync,updateCoordinates};
}
