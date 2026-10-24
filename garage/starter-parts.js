import * as THREE from 'three';

// S01 and S02 are authored replacement geometry, not overlays on the source parts.
// Input is the already-normalized Qvist assembly: nose -X, up +Y, axles Z.
export function installStarterParts(root) {
  const sourceFront = root.getObjectByName('front-wing');
  const wheelNames = ['front-left-wheel', 'front-right-wheel', 'rear-left-wheel', 'rear-right-wheel'];
  const sources = wheelNames.map(name => root.getObjectByName(name));
  if (!sourceFront?.isMesh || sources.some(mesh => !mesh?.isMesh)) throw new Error('Starter parts require the normalized sixteen-part car.');
  const originals = new Map([sourceFront, ...sources].map(mesh => [mesh, mesh.visible]));
  const owned = new THREE.Group(); owned.name = 'starter-parts-v1'; root.add(owned);
  const front = new THREE.Group(); front.name = 'S01-low-arc-front-wing'; owned.add(front);
  const wheels = new THREE.Group(); wheels.name = 'S02-eight-straight-spoke-wheels'; owned.add(wheels);
  front.visible = wheels.visible = false;
  const geometries = new Set(), materials = new Set();
  let disposed = false;
  const material = options => { const m = new THREE.MeshStandardMaterial(options); materials.add(m); return m; };
  const carbon = material({color:0x252a30, metalness:.24, roughness:.42});
  carbon.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vStarterP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvStarterP=position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vStarterP;').replace('#include <color_fragment>', `#include <color_fragment>
      vec2 q=vec2(vStarterP.x+vStarterP.y,vStarterP.z)*420.0;
      float fade=1.0-smoothstep(.4,1.4,max(fwidth(q.x),fwidth(q.y)));
      float fibre=sin(q.x*3.14159)*sin(q.y*3.14159);
      diffuseColor.rgb*=1.0+fibre*.10*fade;`);
  };
  carbon.customProgramCacheKey = () => 'starter-carbon-v1';
  const amber = material({color:0xd69b35,metalness:.5,roughness:.34});
  const rubber = material({color:0x242628,metalness:0,roughness:.88});
  rubber.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRubberP;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRubberP=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vRubberP;').replace('#include <color_fragment>',`#include <color_fragment>
      float phase=vRubberP.z*2300.0;
      float fade=1.0-smoothstep(.5,2.5,fwidth(phase));
      float lines=sin(phase+sin(atan(vRubberP.y,vRubberP.x)*43.0)*.4)*fade;
      diffuseColor.rgb*=.98+lines*.035;`);
  };
  rubber.customProgramCacheKey=()=> 'starter-rubber-fine-mould-v1';
  const graphite = material({color:0x50565d,metalness:.78,roughness:.34});
  const rimMetal = material({color:0x727b84,metalness:.86,roughness:.28});
  const hubMetal = material({color:0x34393e,metalness:.72,roughness:.38});
  function mesh(geometry, mat, parent, name) {
    geometries.add(geometry);
    const m = new THREE.Mesh(geometry, mat); m.name = name;
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  // Root-local bounding boxes remain correct even if the complete car is placed/rotated.
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  function bounds(object) {
    object.geometry.computeBoundingBox();
    return object.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
  }
  const wingBox = bounds(sourceFront), span = wingBox.max.z-wingBox.min.z;
  const width = span*.985, minX = wingBox.min.x+.012;
  const lowY = wingBox.min.y+.025;
  function blade(name, x, chord, y, lift, thickness, trim = false) {
    // Closed, smoothly cambered airfoil section, extruded across the whole span.
    const shape = new THREE.Shape();
    const n=28;
    function upper(t) { return lift*Math.sin(Math.PI*t)+thickness*Math.sin(Math.PI*Math.sqrt(t))*.5; }
    function lower(t) { return lift*Math.sin(Math.PI*t)-thickness*Math.sin(Math.PI*Math.sqrt(t))*.5; }
    shape.moveTo(0,0);
    for(let i=1;i<=n;i++) shape.lineTo(chord*i/n,upper(i/n));
    for(let i=n-1;i>=0;i--) shape.lineTo(chord*i/n,lower(i/n));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape,{depth:width,steps:60,bevelEnabled:false,curveSegments:28});
    const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++) { const z=p.getZ(i)-width/2; p.setXYZ(i,p.getX(i)+x,p.getY(i)+y+.028*(z/(width/2))**2,z); }
    geometry.computeVertexNormals(); mesh(geometry,carbon,front,name);
    if(trim) {
      const pts=[]; for(let i=0;i<=64;i++){const z=-width/2+width*i/64;pts.push(new THREE.Vector3(x+chord*.98,y+upper(.98)+.028*(z/(width/2))**2+.0015,z));}
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),64,.0022,6,false),amber,front,name+'-fine-amber-edge');
    }
  }
  blade('main-low-arc-airfoil',minX,.61,lowY,.018,.017,true);
  blade('upper-low-arc-airfoil',minX+.255,.43,lowY+.078,.021,.014,true);
  // Straight, flat endplates join both airfoil layers, without extra fins.
  for(const side of [-1,1]) {
    const plate=new THREE.Shape(); plate.moveTo(minX-.003,lowY-.014);plate.lineTo(minX+.69,lowY-.014);plate.lineTo(minX+.69,lowY+.164);plate.lineTo(minX+.02,lowY+.164);plate.closePath();
    const g=new THREE.ExtrudeGeometry(plate,{depth:.009,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:2});
    const p=mesh(g,carbon,front,'flat-endplate-'+side);p.position.z=side*width/2-.0045;
    const edge=mesh(new THREE.BoxGeometry(.64,.0025,.010),amber,front,'endplate-fine-edge-'+side);edge.position.set(minX+.35,lowY+.165,side*width/2);
  }
  // Two small pylons overlap both wing layers and terminate inside the actual nose.
  const chassis=root.getObjectByName('chassis'),ray=new THREE.Raycaster();
  for(const side of [-1,1]) {
    const x=minX+.39,z=side*.068;
    const origin=root.localToWorld(new THREE.Vector3(x,2,z));
    const direction=new THREE.Vector3(0,-1,0).transformDirection(root.matrixWorld);
    ray.set(origin,direction);
    const hits=chassis?ray.intersectObject(chassis,false):[];
    const hitY=hits.length?root.worldToLocal(hits[0].point.clone()).y:lowY+.18;
    const bottom=lowY+.006,top=Math.max(lowY+.12,hitY-.012);
    const pylon=mesh(new THREE.BoxGeometry(.12,top-bottom,.018),carbon,front,'nose-connected-pylon-'+side);
    pylon.position.set(x,(top+bottom)/2,z);
  }
  const wheelInfo=[];
  function lathe(profile, segments=112) {
    const g=new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),segments);
    g.rotateX(Math.PI/2); return g;
  }
  for(let index=0;index<sources.length;index++) {
    const source=sources[index],box=bounds(source),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const radius=size.y/2,w=size.z,side=Math.sign(center.z),r=radius;
    const wheel=new THREE.Group();wheel.name=wheelNames[index]+'-S02';wheel.position.copy(center);wheels.add(wheel);
    // Closed tyre cross-section: full tread, rounded shoulders, sidewalls and bead.
    // The center stays open; there is no source wheel cover or replacement disk.
    const controls=[[.615,-.40],[.63,-.47],[.73,-.50],[.87,-.485],[.965,-.40],[1,-.22],[1,.22],[.965,.40],[.87,.485],[.73,.50],[.63,.47],[.615,.40],[.615,-.40]].map(([a,b])=>new THREE.Vector3(a,b,0));
    const curve=new THREE.CatmullRomCurve3(controls,false,'centripetal');
    const samples=curve.getPoints(96), maxR=Math.max(...samples.map(p=>p.x)),maxW=Math.max(...samples.map(p=>Math.abs(p.y)));
    const tyre=lathe(samples.map(p=>[p.x/maxR*r,p.y/maxW*w/2]),128);
    tyre.scale(size.x/size.y,1,1);
    mesh(tyre,rubber,wheel,'smooth-matte-tyre');
    // Hollow rim barrel, with visible space between the eight structural spokes.
    const rimR=.627*r,innerR=.595*r,face=side*w*.438;
    mesh(lathe([[innerR,-w*.40],[rimR,-w*.40],[rimR,w*.40],[innerR,w*.40],[innerR,-w*.40]]),graphite,wheel,'open-rim-barrel');
    for(const faceSide of [-1,1]) {
      const ring=mesh(new THREE.TorusGeometry(.622*r,.009*r,10,112),rimMetal,wheel,'fine-rim-lip-'+faceSide);ring.position.z=faceSide*w*.414;
    }
    const spokeInner=.105*r,spokeOuter=.612*r,spokeLength=spokeOuter-spokeInner;
    for(let i=0;i<8;i++) {
      const angle=i*Math.PI/4;
      const shape=new THREE.Shape();shape.moveTo(-spokeLength/2,-.026*r);shape.lineTo(spokeLength/2,-.021*r);shape.lineTo(spokeLength/2,.021*r);shape.lineTo(-spokeLength/2,.026*r);shape.closePath();
      const g=new THREE.ExtrudeGeometry(shape,{depth:.021,bevelEnabled:true,bevelSize:.0015,bevelThickness:.0015,bevelSegments:2});
      const spoke=mesh(g,graphite,wheel,'straight-spoke-'+(i+1));
      const mid=(spokeInner+spokeOuter)/2;spoke.position.set(Math.cos(angle)*mid,Math.sin(angle)*mid,face-.0105);spoke.rotation.z=angle;
    }
    const hub=mesh(new THREE.CylinderGeometry(.123*r,.123*r,.035,48),hubMetal,wheel,'shallow-central-hub');hub.rotation.x=Math.PI/2;hub.position.z=face;
    const axle=mesh(new THREE.CylinderGeometry(.075*r,.075*r,w*.86,40),hubMetal,wheel,'axle-connection');axle.rotation.x=Math.PI/2;
    const nut=mesh(new THREE.CylinderGeometry(.065*r,.065*r,.008,6),rimMetal,wheel,'central-hex');nut.rotation.x=Math.PI/2;nut.position.z=face+side*.022;
    wheelInfo.push({name:wheelNames[index],center:center.toArray(),diameter:2*r,width:w,spokes:8,sourceHidden:false});
  }
  function setFront(enabled) {if(disposed)return false;front.visible=Boolean(enabled);sourceFront.visible=enabled?false:originals.get(sourceFront);return true;}
  function setWheels(enabled) {if(disposed)return false;wheels.visible=Boolean(enabled);sources.forEach(s=>{s.visible=enabled?false:originals.get(s);});return true;}
  function getInfo(){return {frontEnabled:front.visible,wheelsEnabled:wheels.visible,frontLayers:2,wheelCount:4,spokesPerWheel:8,originalFrontHidden:!sourceFront.visible,wheels:wheelInfo.map((v,i)=>({...v,sourceHidden:!sources[i].visible})),disposed};}
  function dispose(){if(disposed)return;setFront(false);setWheels(false);owned.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());disposed=true;}
  return {setFront,setWheels,dispose,getInfo};
}
