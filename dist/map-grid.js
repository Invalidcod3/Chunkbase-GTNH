// Amidst GridDrawer#getStride and Resolution.FRAGMENT (512 world blocks).
// Use world-coordinate multiples directly, including symmetric negative grids.
export function coordinateGridStep(scale) {
  if(!Number.isFinite(scale)||scale<=0)throw new Error('Invalid map scale');
  return 512*(Math.floor(.25/scale)+1);
}

export function drawCoordinateGrid(view,c) {
  const step=coordinateGridStep(view.scale),b=view.bounds(),xs=[],zs=[];
  for(let x=Math.ceil(b.minX/step)*step;x<b.maxX;x+=step)xs.push(x);
  for(let z=Math.ceil(b.minZ/step)*step;z<b.maxZ;z+=step)zs.push(z);
  c.save();
  c.beginPath();
  for(const x of xs){const p=view.screen(x,0);c.moveTo(p.x,0);c.lineTo(p.x,view.height);}
  for(const z of zs){const p=view.screen(0,z);c.moveTo(0,p.y);c.lineTo(view.width,p.y);}
  // A faint light edge keeps the dark Amidst-style lines visible in the End.
  c.strokeStyle='rgba(255,255,255,0.25)';c.lineWidth=2;c.stroke();
  c.strokeStyle='rgba(0,0,0,0.65)';c.lineWidth=1;c.stroke();
  c.font='bold 16px sans-serif';c.textAlign='left';c.textBaseline='alphabetic';
  c.lineJoin='round';c.lineWidth=4;c.strokeStyle='rgba(0,0,0,0.85)';c.fillStyle='#fff';
  // Thin labels independently when long coordinates would collide at distant zoom.
  const labelWidth=Math.max(c.measureText(`${b.minX}, ${b.minZ}`).width,c.measureText(`${b.maxX}, ${b.maxZ}`).width)+24;
  const labelStep=step*Math.max(1,Math.ceil(labelWidth/(step*view.scale)));
  for(const x of xs)for(const z of zs){
    if(x%labelStep || z%labelStep)continue;
    const p=view.screen(x,z),text=`${x}, ${z}`,width=c.measureText(text).width;
    if(p.x+10+width>view.width-4||p.y+21>view.height)continue;
    c.strokeText(text,p.x+10,p.y+17);c.fillText(text,p.x+10,p.y+17);
  }
  c.restore();
  return step;
}
