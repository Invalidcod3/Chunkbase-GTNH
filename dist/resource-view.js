// Geometry, opacity and zoom thresholds follow the reference ProspectingOverlay.
export function drawResources(view,c) {
  const deposits=view.visibleResources(),scale=view.scale;
  c.save();c.imageSmoothingEnabled=false;
  if(view.markerMode==='FLUID'){c.fillStyle='rgba(0,0,0,0.529)';c.fillRect(0,0,view.width,view.height);}
  if(view.markerMode==='FLUID' && 16*scale>=6){
    const b=view.bounds();c.lineWidth=1;c.strokeStyle='#ebf1fa5f';c.beginPath();
    for(let x=Math.floor(b.minX/16)*16;x<=b.maxX;x+=16){const p=view.screen(x,0);c.moveTo(p.x,0);c.lineTo(p.x,view.height);}
    for(let z=Math.floor(b.minZ/16)*16;z<=b.maxZ;z+=16){const p=view.screen(0,z);c.moveTo(0,p.y);c.lineTo(view.width,p.y);}
    c.stroke();
  }
  const label=(text,x,y)=>{c.font='12px sans-serif';c.lineWidth=3;c.strokeStyle='#17191e';c.strokeText(text,x,y);c.fillStyle='#f0f0f0';c.fillText(text,x,y);};
  for(const d of deposits){
    const p=view.screen(d.x,d.z);
    if(!d.amounts){
      const size=Math.max(10,Math.min(32,24*scale));
      let image=d.icon ? view.resourceImages.get(d.icon) : null;
      if(d.icon && !image){image=new Image();image.onload=()=>view.dirty=true;image.src='data:image/png;base64,'+d.icon;view.resourceImages.set(d.icon,image);if(view.resourceImages.size>512)view.resourceImages.delete(view.resourceImages.keys().next().value);}
      if(image?.complete && image.naturalWidth)c.drawImage(image,p.x-size/2,p.y-size/2,size,size);
      else {c.fillStyle=d.color;c.fillRect(p.x-size/2,p.y-size/2,size,size);}
      c.strokeStyle='#e6e6e696';c.lineWidth=1;c.setLineDash([2,2]);c.strokeRect(p.x-size/2,p.y-size/2,size,size);c.setLineDash([]);
      if(48*scale>=95){c.textAlign='center';label(d.name,p.x,p.y+size/2+15);c.textAlign='left';}
    }else{
      const threshold=view.resourceFilter.minimum,values=d.amounts.filter(a=>a>=threshold),min=Math.min(...values),max=Math.max(...d.amounts),cell=16*scale,field=Math.ceil(128*scale);
      if(!values.length)continue;
      if(threshold===0){c.fillStyle=d.color+'38';c.fillRect(p.x,p.y,field,field);}
      if(cell>=8 || threshold>0)for(let x=0;x<8;x++)for(let z=0;z<8;z++){
        const amount=d.amounts[x*8+z];if(amount<threshold)continue;
        const cp=view.screen(d.x+x*16,d.z+z*16),alpha=35+Math.trunc((amount-min)/(max-min+1)*145);
        c.fillStyle=d.color+alpha.toString(16).padStart(2,'0');c.fillRect(cp.x,cp.y,Math.ceil(cell),Math.ceil(cell));
        if(cell>=8){c.lineWidth=1;c.strokeStyle='#ebf1fa5f';c.strokeRect(cp.x,cp.y,Math.ceil(cell),Math.ceil(cell));}
        if(cell>=8&&amount===max&&max>=10){c.strokeStyle='#ffd700cd';c.strokeRect(cp.x+1,cp.y+1,cell-2,cell-2);}
        if(cell>=58)label(amount+' L/Op',cp.x+3,cp.y+cell/2+4);
      }
      c.strokeStyle=d.color+'cc';c.lineWidth=2;c.strokeRect(p.x,p.y,field,field);
      if(field>=120){label(d.name,p.x+5,p.y+16);if(cell>=20&&cell<58)label(`${min}–${max} L/Op`,p.x+5,p.y+32);}
    }
    if(view.selected===d){c.strokeStyle='#f4d968';c.lineWidth=2;c.strokeRect(p.x-12,p.y-12,24,24);}
  }
  c.restore();
}
export function hitResource(view,point){
  for(const d of view.visibleResources().slice().reverse()){
    if(d.amounts){if(point.x>=d.x&&point.x<d.x+128&&point.z>=d.z&&point.z<d.z+128){
      const i=Math.floor((point.x-d.x)/16)*8+Math.floor((point.z-d.z)/16);
      if(d.amounts[i]>=view.resourceFilter.minimum)return d;
    }}else if(Math.max(Math.abs(d.x-point.x),Math.abs(d.z-point.z))*view.scale<=Math.max(10,Math.min(32,24*view.scale))/2)return d;
  }
  return null;
}
