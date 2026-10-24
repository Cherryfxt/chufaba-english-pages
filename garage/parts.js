import * as T from 'three';
import {coated} from './themes.js';
// Source-preserving, smooth regional adaptation of the credited Qvist concept mesh.
// Geometry is intentionally restrained. No team-exact engineering reproduction claimed.
export function installReviewParts(root){
const slots={front:['front-wing'],rear:['rear-wing'],wheels:['front-left-wheel','front-right-wheel','rear-left-wheel','rear-right-wheel'],sidepod:['left-sidepod','right-sidepod']};
const originals=Object.fromEntries(Object.entries(slots).map(([s,n])=>[s,n.map(n=>root.getObjectByName(n))]));
const groups={},paints=new Map(),materials=new Set();
const material=(n,r)=>{const m=coated(n,r);materials.add(m);return m;};
const carbon=new T.MeshStandardMaterial({color:0x11151a,metalness:.4,roughness:.52});materials.add(carbon);
function clear(slot){originals[slot]?.forEach(o=>o.visible=true);const g=groups[slot];if(g){g.traverse(o=>{if(o.isMesh){o.geometry.dispose();if(o.material!==carbon&&materials.has(o.material)){o.material.dispose();materials.delete(o.material);}}});g.removeFromParent();delete groups[slot];}}
function set(slot,id){if(!slots[slot])return false;clear(slot);const n=Number(id.slice(1)),g=new T.Group();groups[slot]=g;g.name='review-'+id;root.add(g);
for(const source of originals[slot]){source.visible=false;const geo=source.geometry.clone(),pos=geo.attributes.position;geo.computeBoundingBox();const b=geo.boundingBox,c=b.getCenter(new T.Vector3()),size=b.getSize(new T.Vector3());
// Preserve mounting roots and recognizable smooth source profile, vary outer spans only.
for(let i=0;i<pos.count;i++){let x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),u=T.MathUtils.clamp((x-b.min.x)/size.x,0,1),edge=Math.abs(z)/(Math.max(Math.abs(b.min.z),Math.abs(b.max.z))||1);
if(slot==='front'){z*=1+(n-5)*.006*Math.pow(edge,3);y+=(n-5)*.0035*Math.pow(edge,2)*Math.sin(u*Math.PI);}
if(slot==='rear'){y+=(n-5)*.009*T.MathUtils.smoothstep(y,b.min.y+.25,b.max.y)+(n%3-1)*.045*Math.sin(edge*Math.PI)*T.MathUtils.smoothstep(y,b.min.y+.25,b.max.y);z*=1+(n-5)*.008;}
if(slot==='sidepod'){const w=Math.sin(u*Math.PI);z+=(z-c.z)*(n-5)*.025*w;y+=(n-5)*.005*w;}
pos.setXYZ(i,x,y,z);}
geo.computeVertexNormals();let finish=slot==='wheels'?source.material:material(n,slot);if(slot==='wheels'){finish=source.material.clone();const originalShader=source.material.onBeforeCompile;finish.onBeforeCompile=s=>{originalShader(s);s.fragmentShader=s.fragmentShader.replace('diffuseColor.rgb=mix(rubber,coverFinish,cover);',`float blade=pow(max(0.,cos(theta*${[5,6,7,8,9,10,12,11,13][n-1]}.0)),18.)*smoothstep(.07,.10,tyreRadius)*(1.-smoothstep(.20,.22,tyreRadius));coverFinish=mix(coverFinish,vec3(.11,.12,.13),blade*.65);diffuseColor.rgb=mix(rubber,coverFinish,cover);`);};finish.customProgramCacheKey=()=>`v4-wheel-${n}`;materials.add(finish);}const o=new T.Mesh(geo,finish);o.castShadow=o.receiveShadow=true;g.add(o);
if(slot==='wheels'){const side=Math.sign(c.z),z=side>0?b.max.z+.001:b.min.z-.001;const ring=new T.Mesh(new T.TorusGeometry(size.y*.305,.003,8,80),carbon);ring.position.set(c.x,c.y,z);g.add(ring);}
if(slot==='sidepod'){o.updateMatrixWorld(true);const ray=new T.Raycaster();for(let j=0;j<3+n%4;j++){const x=b.min.x+size.x*(.20+j*.055),z=c.z;ray.set(new T.Vector3(x,b.max.y+.2,z),new T.Vector3(0,-1,0));const hit=ray.intersectObject(o,false)[0];if(!hit)continue;const vent=new T.Mesh(new T.BoxGeometry(.014,.003,size.z*(.23+(n%3)*.04)),carbon);vent.position.copy(hit.point);vent.position.y+=.002;vent.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),hit.face.normal);g.add(vent);}}
}
return true;}
function resetPaint(){paints.forEach((m,o)=>{o.material.dispose();materials.delete(o.material);o.material=m;});paints.clear();}
function paint(id){resetPaint();const n=id==='initial'?0:Number(id.slice(1));root.traverse(o=>{if(!o.isMesh||!['chassis','left-sidepod','right-sidepod','engine-cover','nose','halo','front-wing','rear-wing','mirrors'].includes(o.name))return;let role=o.name==='engine-cover'?'engine':o.name==='front-wing'?'front':o.name==='rear-wing'?'rear':'body';const m=n?material(n,role):new T.MeshPhysicalMaterial({color:0x353b42,metalness:.32,roughness:.46,clearcoat:.4});paints.set(o,o.material);o.material=m;});return true;}
return{set,clear,paint,resetPaint,dispose(){resetPaint();Object.keys(slots).forEach(clear);materials.forEach(m=>m.dispose());}};
}
