import test from 'node:test';
import assert from 'node:assert/strict';
import {coordinateGridStep,drawCoordinateGrid} from '../dist/map-grid.js';
import {MapView} from '../dist/map.js';

test('coordinate grid follows desktop spacing at close, default and distant zooms',()=>{
  for(const [scale,expected]of [[8,512],[.5,512],[.25,1024],[.125,1536],[.0625,2560],[.03125,4608]])assert.equal(coordinateGridStep(scale),expected);
});
function render({x=0,z=0,scale=.25,width=1000,height=600}={}){
  const labels=[],lines=[];
  const view={x,z,scale,width,height,world:MapView.prototype.world,screen:MapView.prototype.screen,bounds:MapView.prototype.bounds};
  const context={save(){},restore(){},beginPath(){},moveTo:(...p)=>lines.push(p),lineTo(){},stroke(){},strokeText(){},fillText:(...p)=>labels.push(p),measureText:text=>({width:text.length*9})};
  const step=drawCoordinateGrid(view,context);return {labels,lines,step};
}
test('grid labels are anchored to signed world coordinates and follow panning without moving the grid origin',()=>{
  const first=render(),moved=render({x:100,z:-100});
  for(const text of ['-1024, -1024','0, 0','1024, 0']) {
    const a=first.labels.find(l=>l[0]===text),b=moved.labels.find(l=>l[0]===text);
    assert.ok(a&&b);assert.equal(b[1]-a[1],-25);assert.equal(b[2]-a[2],25);
  }
});
test('distant world-edge grids remain sparse and long coordinate labels do not overlap',()=>{
  const result=render({x:29999000,z:-29999000,scale:.03125});
  assert.ok(result.lines.length>0&&result.lines.length<20);
  for(let i=0;i<result.labels.length;i++)for(let j=i+1;j<result.labels.length;j++) {
    const a=result.labels[i],b=result.labels[j];
    if(a[2]===b[2])assert.ok(Math.abs(a[1]-b[1])>=Math.min(a[0].length,b[0].length)*9+24);
  }
});
