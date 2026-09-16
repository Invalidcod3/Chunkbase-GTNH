// Idempotent across tab switches, screen locks, freeze and BFCache restores.
export function observePageLifecycle({suspend,resume,page=globalThis.document,target=globalThis.window}) {
  let hidden=false,frozen=false,left=false;
  const sync=()=>{
    const next=page.hidden||frozen||left;
    if(next===hidden)return;
    hidden=next;(hidden?suspend:resume)();
  };
  const hide=()=>{left=true;sync();},show=()=>{left=false;frozen=false;sync();};
  const freeze=()=>{frozen=true;sync();},thaw=()=>{frozen=false;sync();};
  page.addEventListener('visibilitychange',sync);
  page.addEventListener('freeze',freeze);page.addEventListener('resume',thaw);
  target.addEventListener('pagehide',hide);target.addEventListener('pageshow',show);
  sync();
  return ()=>{
    page.removeEventListener('visibilitychange',sync);
    page.removeEventListener('freeze',freeze);page.removeEventListener('resume',thaw);
    target.removeEventListener('pagehide',hide);target.removeEventListener('pageshow',show);
  };
}
