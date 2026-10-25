import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { installStarterParts } from './starter-parts.js';
import { installReviewParts } from './parts.js';
import {loadCarBytes} from './asset-loader.mjs';

// Runtime uses Qvist_designs' F1 2026 concept geometry, CC BY 4.0, via the credited
// sixteen-part adaptation in assets/candidates/qvist. Materials and modular additions
// are authored here. See the project asset attribution. Nose -X, vertical +Y, axle Z.
// The original procedural route is preserved separately in car-scene-procedural-v2.js.
const V = a => new THREE.Vector3(...a);
const TAU = Math.PI * 2;
// Analytically filtered, object-space surface detail. No reliance on the source
// model's UVs; projected fibres retain a consistent millimetre scale on all faces.
const SURFACE_GLSL = `
float craftHash(vec3 p) { p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z); }
float craftNoise(vec3 p) {
  vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(craftHash(i),craftHash(i+vec3(1,0,0)),f.x),mix(craftHash(i+vec3(0,1,0)),craftHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(craftHash(i+vec3(0,0,1)),craftHash(i+vec3(1,0,1)),f.x),mix(craftHash(i+vec3(0,1,1)),craftHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float craftWeave(vec2 p) {
  vec2 q=p*190.0;
  float fade=1.0-smoothstep(0.45,1.25,max(fwidth(q.x),fwidth(q.y)));
  float orientation=step(2.0,mod(floor(q.x)+floor(q.y),4.0));
  float u=mix(q.x,q.y,orientation),crossU=mix(q.y,q.x,orientation);
  float yarn=pow(max(0.0,sin(fract(u)*3.14159265)),0.65);
  float fibre=sin(u*31.4159265)*0.045;
  float endFade=0.86+0.14*sin(fract(crossU)*3.14159265);
  return mix(0.50,(0.18+0.70*yarn+fibre)*endFade,fade);
}
float craftCarbon(vec3 p,vec3 n) {
  vec3 w=pow(abs(normalize(n)),vec3(4.0));w/=max(0.0001,w.x+w.y+w.z);
  return craftWeave(p.yz)*w.x+craftWeave(p.xz)*w.y+craftWeave(p.xy)*w.z;
}
float craftRubberScuff(vec2 uv) {
  // Sparse circumferential scrub marks: unequal length/width, dark rubber rather
  // than painted white scratches. Derivative smoothing prevents fine-line shimmer.
  vec2 q=uv*vec2(28.0,210.0),cell=floor(q),f=fract(q);
  float seed=craftHash(vec3(cell,7.0));
  float center=.50+(craftHash(vec3(cell,19.0))-.5)*.24;
  float width=.08+seed*.10;
  float line=1.0-smoothstep(width,width+max(.04,fwidth(q.y)*.65),abs(f.y-center));
  float ends=smoothstep(.03,.17,f.x)*(1.0-smoothstep(.64+.19*seed,.98,f.x));
  return line*ends*smoothstep(.47,.72,seed);
}
vec3 craftBump(vec3 N,vec3 surfacePosition,float height) {
  vec3 dx=dFdx(surfacePosition),dy=dFdy(surfacePosition);
  vec3 r1=cross(dy,N),r2=cross(N,dx);float det=dot(dx,r1);
  vec3 gradient=sign(det)*(dFdx(height)*r1+dFdy(height)*r2);
  return normalize(abs(det)*N-gradient);
}
`;
function texture(kind) {
  const n = 256, bytes = new Uint8Array(n*n*4);
  for (let y=0;y<n;y++) for(let x=0;x<n;x++) {
    const k=(y*n+x)*4, hash=((x*177+y*311+x*y*13)%97)/97;
    let v;
    if(kind==='carbon') {
      const horizontal=((Math.floor(x/16)+Math.floor(y/16))%4)<2;
      const u=horizontal?y:x;
      v=43+17*Math.sin((u%16)/16*Math.PI)+5*Math.sin(u*3.14)+hash*5;
    } else if(kind==='rubber') v=125+hash*33+8*Math.sin(y*.67+x*.008);
    else v=115+hash*26;
    bytes[k]=bytes[k+1]=bytes[k+2]=Math.round(v);bytes[k+3]=255;
  }
  const t=new THREE.DataTexture(bytes,n,n);t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(kind==='carbon'?9:5,kind==='carbon'?5:2);t.magFilter=THREE.LinearFilter;
  t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;
  if(kind==='carbon')t.colorSpace=THREE.SRGBColorSpace;
  return t;
}


async function buildAssetCar(options={}) {
  const url=new URL('./assets/qvist-2026-assemblies.glb',import.meta.url);
  const bytes=await loadCarBytes(url,options);
  if(options.signal?.aborted)throw new DOMException('Cancelled','AbortError');
  options.onProgress?.({stage:'parsing'});
  const gltf=await new GLTFLoader().parseAsync(bytes,url.href.substring(0,url.href.lastIndexOf('/')+1));
  const root=gltf.scene;root.name='Qvist 2026 concept · Departure material and modular adaptation';
  const materials=[],textures=[texture('carbon'),texture('rubber')];
  const palette={dark:new THREE.Color(0x040b14),blue:new THREE.Color(0x043270),stripe:new THREE.Color(0xb9c9d5),accent:new THREE.Color(0x0482c8)};
  const starterUniform={value:0};
  const byName={},additions={},selected={front:'default',rear:'default',wheels:'default',sidepod:'default'};
  const slotNames={front:['front-wing'],rear:['rear-wing'],wheels:['front-left-wheel','front-right-wheel','rear-left-wheel','rear-right-wheel'],sidepod:['left-sidepod','right-sidepod']};
  function makePaint(carbonPanels=false){
    const m=new THREE.MeshPhysicalMaterial({color:0xffffff,metalness:.65,roughness:.21,clearcoat:1,clearcoatRoughness:.065,side:THREE.DoubleSide});
    m.onBeforeCompile=shader=>{
      shader.uniforms.uStarter=starterUniform;
      shader.fragmentShader='uniform float uStarter;\n'+shader.fragmentShader;
      shader.uniforms.uDark={value:palette.dark};shader.uniforms.uBlue={value:palette.blue};shader.uniforms.uStripe={value:palette.stripe};shader.uniforms.uAccent={value:palette.accent};
      shader.uniforms.uCarbonPanels={value:carbonPanels?1:0};
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vLiveryPosition;\nvarying vec3 vPaintNormal;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLiveryPosition = position;vPaintNormal=normal;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vLiveryPosition;\nvarying vec3 vPaintNormal;\nuniform float uCarbonPanels;\nuniform vec3 uDark;\nuniform vec3 uBlue;\nuniform vec3 uStripe;\nuniform vec3 uAccent;\n'+SURFACE_GLSL);
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec3 p = vLiveryPosition;
        float az = abs(p.z);
        float nose = 1.0 - smoothstep(-0.9,-0.20,p.x);
        float sweep = 0.30 + 0.115*sin((p.x+0.65)*2.0) + (p.y-0.45)*0.28;
        float blueMask = smoothstep(0.01,0.08,az-sweep+0.13) * (1.0-smoothstep(0.18,0.25,az-sweep));
        blueMask = mix(blueMask*0.72,0.43,nose);
        float silverLine = 1.0-smoothstep(0.010,0.022,abs(az-sweep));
        float blueLine = 1.0-smoothstep(0.008,0.017,abs(az-sweep-0.145));
        vec3 authoredPaint = mix(uDark,uBlue,blueMask);
        authoredPaint=mix(authoredPaint,uStripe,silverLine*0.74);
        authoredPaint=mix(authoredPaint,uAccent,blueLine*0.78);
        float waist=1.0-smoothstep(.004,.010,abs(p.y-(.35+.055*sin(p.x*1.4))));
        waist*=smoothstep(.32,.45,az)*smoothstep(-1.3,-.7,p.x)*(1.0-smoothstep(1.45,1.8,p.x));
        float noseGold=(1.0-smoothstep(.055,.07,az))*smoothstep(-2.25,-2.20,p.x)*(1.0-smoothstep(-2.0,-1.95,p.x));
        vec3 starterPaint=mix(vec3(.037,.045,.055),vec3(.83,.43,.075),max(waist,noseGold));
        authoredPaint=mix(authoredPaint,starterPaint,uStarter);
        float flakeDetail=craftNoise(p*720.0);
        float flakeFade=1.0-smoothstep(0.6,3.2,length(fwidth(p*720.0)));
        float flake=pow(flakeDetail,3.5)*flakeFade;
        float film=craftNoise(p*85.0);
        diffuseColor.rgb = authoredPaint*(0.975+film*0.035)+uBlue*flake*0.28*blueMask;
        float panelCarbon=uCarbonPanels*smoothstep(.58,.85,abs(normalize(vPaintNormal).z))*smoothstep(.43,.57,az)*(1.0-silverLine*.7);
        float panelWeave=craftCarbon(p,vPaintNormal);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.027,.031,.035)*(.35+panelWeave*1.3),panelCarbon);
      `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(clamp(0.235+film*0.035-flake*0.10,0.19,0.29),.30+panelWeave*.12,panelCarbon);')
        .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.28,panelCarbon);')
        .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=craftBump(normal,-vViewPosition,mix((flakeDetail-0.5)*0.000022*flakeFade,(panelWeave-.5)*.00013,panelCarbon));');
    };
    m.customProgramCacheKey=()=> 'departure-qvist-flow-surface-v3-'+carbonPanels;materials.push(m);return m;
  }
  const paint=makePaint(),carbon=new THREE.MeshPhysicalMaterial({color:0x222a31,metalness:.28,roughness:.38,clearcoat:.8,clearcoatRoughness:.22,side:THREE.DoubleSide});
  carbon.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCarbonPosition;\nvarying vec3 vCarbonNormal;').replace('#include <begin_vertex>','#include <begin_vertex>\nvCarbonPosition=position;vCarbonNormal=normal;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCarbonPosition;\nvarying vec3 vCarbonNormal;\n'+SURFACE_GLSL)
      .replace('#include <color_fragment>','#include <color_fragment>\nfloat weave=craftCarbon(vCarbonPosition,vCarbonNormal);\ndiffuseColor.rgb=vec3(0.027,0.031,0.035)*(0.35+weave*1.30);')
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=0.29+weave*0.14;')
      .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=craftBump(normal,-vViewPosition,(weave-0.5)*0.00013);');
  };carbon.customProgramCacheKey=()=> 'departure-carbon-triplanar-v2';
  const silver=new THREE.MeshStandardMaterial({color:0xaebdcb,metalness:.9,roughness:.24,side:THREE.DoubleSide});
  const accent=new THREE.MeshPhysicalMaterial({color:palette.accent,metalness:.62,roughness:.22,clearcoat:1,side:THREE.DoubleSide});
  materials.push(carbon,silver,accent);
  function wheelMaterial(center,width){
    const m=new THREE.MeshPhysicalMaterial({color:0x202326,metalness:.03,roughness:.87,clearcoat:.06,clearcoatRoughness:.45,side:THREE.DoubleSide});
    m.onBeforeCompile=shader=>{
      shader.uniforms.uWheelCenter={value:center};shader.uniforms.uWheelWidth={value:width};
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTyrePosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nvTyrePosition=position;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vTyrePosition;\nuniform vec3 uWheelCenter;\nuniform float uWheelWidth;\n'+SURFACE_GLSL);
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec3 tyreP=vTyrePosition-uWheelCenter;
        float tyreRadius=length(tyreP.xy);
        float cover=1.0-smoothstep(0.215,0.237,tyreRadius);
        float theta=atan(tyreP.y,tyreP.x);
        float tread=smoothstep(0.318,0.352,tyreRadius)*(1.0-smoothstep(uWheelWidth*.39,uWheelWidth*.49,abs(tyreP.z)));
        float circumferentialPhase=tyreP.z*950.0+0.40*sin(theta*47.0);
        float grooveFade=1.0-smoothstep(0.7,4.0,fwidth(circumferentialPhase));
        float grooves=sin(circumferentialPhase)*grooveFade;
        float grain=craftNoise(vec3(theta*70.0,tyreP.z*500.0,3.0));
        float wear=craftNoise(vec3(theta*9.0,tyreP.z*70.0,1.0));
        float scuff=craftRubberScuff(vec2(theta*.35,tyreP.z))*tread;
        float mould=sin(tyreRadius*3100.0)*(1.0-smoothstep(.7,2.0,fwidth(tyreRadius*3100.0)));
        float coverWeave=craftWeave(tyreP.xy);
        float ring=(1.0-smoothstep(0.004,0.006,abs(tyreRadius-0.314)))*smoothstep(uWheelWidth*.42,uWheelWidth*.48,abs(vTyrePosition.z-uWheelCenter.z));
        vec3 rubber=vec3(0.017,0.018,0.020)*(0.77+wear*.27+grain*.12+grooves*.035+mould*.012*(1.0-tread)+scuff*.34);
        rubber*=mix(1.0,1.09,tread);
        vec3 coverFinish=vec3(.043,.049,.055)*(.35+coverWeave*1.30);
        diffuseColor.rgb=mix(rubber,coverFinish,cover);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.55)*(0.94+grain*.06),ring);
        float tyreMicroHeight=mix(mould*0.000025,grooves*0.000035+(grain-.5)*.000025-scuff*.000055,tread);
        tyreMicroHeight=mix(tyreMicroHeight,(coverWeave-.5)*.00010,cover);
      `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(mix(.71,.86,tread)+wear*.065-scuff*.20,.29+coverWeave*.09,cover);')
        .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(0.015,0.62,cover);')
        .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=craftBump(normal,-vViewPosition,tyreMicroHeight);');
    };m.customProgramCacheKey=()=> 'departure-qvist-wheel-surface-v2';materials.push(m);return m;
  }
  const originalMaterials=new Set();
  root.traverse(o=>{
    if(!o.isMesh)return;byName[o.name]=o;originalMaterials.add(o.material);
    o.geometry=o.geometry.clone();o.geometry.scale(.001,.001,.001);o.geometry.translate(-1.398,.031,0);
    const pos=o.geometry.attributes.position,uv=new Float32Array(pos.count*2);for(let i=0;i<pos.count;i++){uv[i*2]=pos.getX(i)*.5;uv[i*2+1]=pos.getZ(i)*.5+pos.getY(i)*.25;}o.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));o.geometry.computeBoundingBox();
    if(o.name==='floor'){for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);if(x>-.85&&x<.05&&Math.abs(z)>.4&&y>.12)pos.setY(i,.12+(y-.12)*.48);}pos.needsUpdate=true;o.geometry.computeVertexNormals();}
    o.castShadow=o.receiveShadow=true;
    if(o.name.includes('wheel')){const box=o.geometry.boundingBox,center=box.getCenter(new THREE.Vector3());o.material=wheelMaterial(center,box.max.z-box.min.z);}
    else if(['floor','front-suspension','rear-suspension','exhaust'].includes(o.name))o.material=o.name==='exhaust'?silver:carbon;
    else if(['front-wing','rear-wing'].includes(o.name))o.material=makePaint(true);
    else o.material=paint;
  });originalMaterials.forEach(m=>m.dispose());root.updateMatrixWorld(true);
  for(const slot of Object.keys(slotNames)){additions[slot]=new THREE.Group();additions[slot].name='modular-'+slot;root.add(additions[slot]);}
  const ray=new THREE.Raycaster();
  function addMesh(geo,mat,parent){const m=new THREE.Mesh(geo,mat);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
  function mountedStrip(mesh,x,z,length,width,height,parent){
    ray.set(new THREE.Vector3(x,2.5,z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(mesh,false)[0];if(!hit)return;
    // An attached micro-aero blade, aligned to the local surface rather than floating above it.
    const shape=new THREE.Shape();shape.moveTo(-length/2,0);shape.quadraticCurveTo(0,height,length/2,height*.25);shape.lineTo(length/2,0);shape.closePath();
    const blade=addMesh(new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:2,curveSegments:12}),carbon,parent);blade.position.copy(hit.point);blade.position.z-=width/2;
    const strip=addMesh(new THREE.BoxGeometry(length*.75,.003,width*.5),accent,parent);strip.position.copy(hit.point).add(new THREE.Vector3(0,.003,0));
  }
  function setPart(slot,variant){if(!slotNames[slot]||!['default','sport','aero'].includes(variant))return false;const g=additions[slot];g.traverse(o=>{if(o.isMesh)o.geometry.dispose();});g.clear();selected[slot]=variant;if(variant==='default')return true;
    const n=variant==='sport'?1:2;
    if(slot==='front')for(const side of [-1,1])for(let i=0;i<n;i++)mountedStrip(byName['front-wing'],-2.22+i*.11,side*(.57+i*.17),.20,.014,.055+i*.01,g);
    if(slot==='rear')for(const side of [-1,1])for(let i=0;i<n;i++)mountedStrip(byName['rear-wing'],2.40+i*.10,side*(.33+i*.10),.16,.012,.045,g);
    if(slot==='sidepod')for(const side of [-1,1])for(let i=0;i<3+n*2;i++)mountedStrip(byName[side>0?'left-sidepod':'right-sidepod'],.05+i*.11,side*.49,.07,.035,.014,g);
    if(slot==='wheels')for(const name of slotNames.wheels){const wheel=byName[name],box=wheel.geometry.boundingBox,c=box.getCenter(new THREE.Vector3()),side=c.z>0?1:-1,z=side>0?box.max.z+.004:box.min.z-.004;
      const radius=variant==='sport'?.225:.24,ring=addMesh(new THREE.TorusGeometry(radius,.006,8,96),variant==='sport'?silver:accent,g);ring.position.set(c.x,c.y,z);
      if(variant==='aero')for(let i=0;i<6;i++){const a=i/6*TAU,detail=addMesh(new THREE.BoxGeometry(.105,.007,.004),carbon,g);detail.position.set(c.x+Math.cos(a)*.16,c.y+Math.sin(a)*.16,z);detail.rotation.z=a;}
    }
    return true;
  }
  const starter=installStarterParts(root);
  const review=installReviewParts(root);
  const originalSetPart=setPart;
  function setStarter(slot,variant){if(slot==='front')starter.setFront(false);if(slot==='wheels')starter.setWheels(false);review.clear(slot);if(/^[FRWB]\d\d$/.test(variant)){selected[slot]=variant;return review.set(slot,variant);} if(slot==='front'||slot==='wheels'){const enabled=variant==='starter';if(!enabled&&variant!=='default')return false; if(slot==='front')starter.setFront(enabled);else starter.setWheels(enabled);selected[slot]=variant;return true;}return originalSetPart(slot,variant);}
  function setLivery(id){review.resetPaint();if(id==='initial'||/^L\d\d$/.test(id))return review.paint(id);if(!['midnight','starter'].includes(id))return false;starterUniform.value=id==='starter'?1:0;return true;}
  function dispose(){review.dispose();starter.dispose();const g=new Set();root.traverse(o=>{if(o.isMesh)g.add(o.geometry);});g.forEach(v=>v.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
  return {root,setPart:setStarter,setLivery,selected,dispose,starter,dimensions:{length:size.x,width:size.z,height:size.y}};
}

export async function createCarScene(container,options={}) {
  if(!container)throw new Error('Missing 3D container');
  const car=await buildAssetCar(options);
  let renderer;
  try{
  if(options.signal?.aborted)throw new DOMException('Cancelled','AbortError');
  options.onProgress?.({stage:'rendering'});
  RectAreaLightUniformsLib.init();
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.VSMShadowMap;
  renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none;outline:none';
  renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','真实三维赛车。拖动旋转，双指缩放；方向键旋转，加减键缩放，Home恢复视角。');container.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xdfe3e7);scene.fog=new THREE.Fog(0xdfe3e7,18,50);
  const camera=new THREE.PerspectiveCamera(34,1,.04,80),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.10;controls.enablePan=false;controls.minPolarAngle=.16;controls.maxPolarAngle=Math.PI*.485;
  controls.rotateSpeed=.65;controls.zoomSpeed=.65;controls.autoRotateSpeed=.52;controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  // Studio reflection environment: broad white soft boxes alternating with black flags.
  const envScene=new THREE.Scene();envScene.background=new THREE.Color(.16,.18,.21);
  const envMaterials=[],envGeometries=[];
  function reflectPanel(w,h,pos,intensity,color=0xffffff){const g=new THREE.PlaneGeometry(w,h),m=new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(intensity),side:THREE.DoubleSide}),p=new THREE.Mesh(g,m);p.position.fromArray(pos);p.lookAt(0,.4,0);envScene.add(p);envMaterials.push(m);envGeometries.push(g);}
  reflectPanel(9,2.1,[-1,4.5,2.8],4.5);reflectPanel(8,2.0,[1,3.8,-4.5],3.5);reflectPanel(1.1,4,[-6,2.5,1.2],2.8);reflectPanel(1.6,3.5,[5,3,2.5],4.0);reflectPanel(7,.65,[0,1.5,-5],2.0);reflectPanel(6,2.0,[0,1.4,5],3.4);
  const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(envScene,.010,.1,30);scene.environment=env.texture;scene.environmentIntensity=1.0;pmrem.dispose();envMaterials.forEach(m=>m.dispose());envGeometries.forEach(g=>g.dispose());
  const panels=[];function area(color,intensity,w,h,pos){const p=new THREE.RectAreaLight(color,intensity,w,h);p.position.fromArray(pos);p.lookAt(0,.3,0);scene.add(p);panels.push(p);}
  area(0xffffff,2.5,7,2.0,[-2,5,3]);area(0xe1eaff,1.8,5,2,[1,3,-5]);area(0xffffff,3.2,3,3,[4,4,2]);area(0xffffff,1.6,5,1.5,[0,1.4,4]);
  const key=new THREE.DirectionalLight(0xffffff,1.3);key.position.set(-3,6,4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-4,right:4,top:3,bottom:-3,near:.1,far:18});key.shadow.bias=-.00010;key.shadow.normalBias=.004;key.shadow.radius=4;key.shadow.blurSamples=8;scene.add(key);
  const fill=new THREE.HemisphereLight(0xeef2ff,0x4f5258,.38);scene.add(fill);
  const floorMat=new THREE.MeshStandardMaterial({color:0xbcc3c8,metalness:.08,roughness:.46});const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),floorMat);floor.rotation.x=-Math.PI/2;floor.position.y=-.006;floor.receiveShadow=true;scene.add(floor);
  // Ambient occlusion under chassis and tyre patches supplements physically cast key shadows.
  const c=document.createElement('canvas');c.width=c.height=256;const cx=c.getContext('2d'),gradient=cx.createRadialGradient(128,128,4,128,128,128);gradient.addColorStop(0,'rgba(9,15,24,.60)');gradient.addColorStop(.47,'rgba(9,15,24,.24)');gradient.addColorStop(1,'rgba(9,15,24,0)');cx.fillStyle=gradient;cx.fillRect(0,0,256,256);
  const shadowTexture=new THREE.CanvasTexture(c),shadowMaterial=new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,opacity:.84});
  const shadowObjects=[];function contact(w,h,x,z){const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),shadowMaterial);o.rotation.x=-Math.PI/2;o.position.set(x,-.002,z);scene.add(o);shadowObjects.push(o);}
  contact(5.6,2.0,0,0);contact(3.7,1.25,.35,0);for(const [x,z] of [[-1.453,.7635],[-1.453,-.7635],[1.947,.7277],[1.947,-.7277]])contact(.80,.66,x,z);
  scene.add(car.root);
  const views={overview:{target:[-.06,.42,0],position:[-5.05,2.15,5.15]},front:{target:[-2.30,.25,0],position:[-4.9,1.25,2.35]},rear:{target:[2.15,.69,0],position:[4.8,1.8,2.6]},wheels:{target:[-1.45,.36,.82],position:[-2.85,1.05,3.0]},sidepod:{target:[.10,.43,.49],position:[-1.7,1.25,3.35]}};
  Object.assign(views,{side:{target:[0,.4,0],position:[0,1.0,8.6]},top:{target:[0,.3,0],position:[0,9,.01]},back:{target:[0,.4,0],position:[7.9,2.6,4.8]}});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const status={ready:true,view:'overview',livery:'midnight',light:'studio',auto:false,frames:0,parts:{...car.selected},errors:[]};
  let raf=0,settling=0,tween=null,lastTime=0,disposed=false,baseDistance=8;
  function invalidate(frames=3){if(disposed)return;settling=Math.max(settling,frames);if(!raf&&!document.hidden)raf=requestAnimationFrame(frame);}
  function frame(time){raf=-1;if(disposed||document.hidden){raf=0;return;}const dt=Math.min(.05,lastTime?(time-lastTime)/1000:.016);lastTime=time;
    if(tween){const t=Math.min(1,(time-tween.time)/500),e=1-(1-t)**3;camera.position.lerpVectors(tween.from,tween.to,e);controls.target.lerpVectors(tween.fromTarget,tween.target,e);if(t===1)tween=null;}
    controls.update(dt);renderer.render(scene,camera);status.frames++;status.triangles=renderer.info.render.triangles;status.drawCalls=renderer.info.render.calls;
    renderer.domElement.dataset.renderState=JSON.stringify({...status,camera:camera.position.toArray(),target:controls.target.toArray()});
    settling--;raf=0;if(tween||controls.autoRotate||settling>0)raf=requestAnimationFrame(frame);
  }
  function setView(name,animate=true){if(!views[name])return false;const v=views[name],target=V(v.target),position=V(v.position);status.view=name;
    const ratio=Math.max(.6,container.clientWidth/Math.max(1,container.clientHeight));const fit=name==='overview'?Math.max(.88,1.18/ratio):1;position.sub(target).multiplyScalar(fit).add(target);
    baseDistance=position.distanceTo(target);controls.minDistance=name==='overview'?4.3:1.5;controls.maxDistance=name==='overview'?12:7;
    if(animate&&!reduced)tween={time:performance.now(),from:camera.position.clone(),to:position,fromTarget:controls.target.clone(),target};else{tween=null;camera.position.copy(position);controls.target.copy(target);controls.update();}invalidate(35);return true;
  }
  function zoom(delta){tween=null;const vector=camera.position.clone().sub(controls.target),len=THREE.MathUtils.clamp(vector.length()*Math.exp(-delta*.12),controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(vector.setLength(len));controls.update();invalidate(20);}
  function setAutoRotate(value){controls.autoRotate=Boolean(value);status.auto=controls.autoRotate;invalidate(3);}
  function setLight(mode){if(!['studio','night','environment','direct'].includes(mode))return false;status.light=mode;const dark=mode==='night';scene.background.setHex(dark?0x343b45:0xdfe3e7);scene.fog.color.copy(scene.background);scene.environmentIntensity=mode==='direct'?0:dark?.65:1.0;renderer.toneMappingExposure=1.15;floorMat.color.setHex(dark?0x343b43:0xbcc3c8);key.intensity=mode==='environment'?0:dark?.8:1.3;fill.intensity=mode==='environment'?0:dark?.20:.38;panels.forEach(p=>p.visible=mode!=='environment');invalidate();return true;}
  function resize(){const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight);const changed=Math.abs(camera.aspect-w/h)>.001;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);if(changed&&status.view==='overview')setView('overview',false);invalidate();}
  const observer=new ResizeObserver(resize);observer.observe(container);
  function onVisibility(){if(!document.hidden){lastTime=0;invalidate(10);}}
  document.addEventListener('visibilitychange',onVisibility);
  function onStart(){tween=null;setAutoRotate(false);invalidate(30);}
  controls.addEventListener('start',onStart);controls.addEventListener('change',()=>invalidate(4));controls.addEventListener('end',()=>invalidate(25));
  function onKey(e){if(['+','=','-','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setAutoRotate(false);if(e.key==='Home')setView('overview');else if(e.key==='+'||e.key==='=')zoom(1);else if(e.key==='-')zoom(-1);else{tween=null;const sp=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));sp.theta+=e.key==='ArrowLeft'?-.12:e.key==='ArrowRight'?.12:0;sp.phi+=e.key==='ArrowUp'?-.08:e.key==='ArrowDown'?.08:0;sp.phi=THREE.MathUtils.clamp(sp.phi,controls.minPolarAngle,controls.maxPolarAngle);camera.position.setFromSpherical(sp).add(controls.target);controls.update();invalidate(20);}}}
  renderer.domElement.addEventListener('keydown',onKey);
  function onLost(e){e.preventDefault();status.ready=false;status.errors.push('图形渲染中断');container.dispatchEvent(new CustomEvent('car-render-error',{detail:'图形渲染中断，请重新打开车库。'}));}
  renderer.domElement.addEventListener('webglcontextlost',onLost);
  resize();setView('overview',false);renderer.render(scene,camera);invalidate(3);
  return {
    setPart(slot,variant){const ok=car.setPart(slot,variant);if(ok){status.parts={...car.selected};invalidate();}return ok;},
    setLivery(id){const ok=car.setLivery(id);if(ok){status.livery=id;invalidate();}return ok;},
    setView,zoom,resetCamera(){setAutoRotate(false);setView('overview');},setAutoRotate,setLight,
    getInfo(){return {...status,parts:{...status.parts},dimensions:{...car.dimensions},geometrySource:'Qvist_designs F1 2026 concept / CC BY 4.0 / 16-assembly adaptation',modularMethod:'One high-detail source car. Sport and aero add independent surface-mounted aerodynamic details or wheel-cover details; they are not three full source bodies.',materialMethod:'Authored clear-coated microflake paint, triplanar carbon weave with roughness and micro-normal response, circumferential rubber wear and separated wheel-cover shading. Studio reflection panels plus soft cast/contact shadows; not photographic textures.',camera:camera.position.toArray(),baseDistance};},
    dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',onVisibility);renderer.domElement.removeEventListener('keydown',onKey);renderer.domElement.removeEventListener('webglcontextlost',onLost);controls.dispose();car.dispose();floor.geometry.dispose();floorMat.dispose();shadowObjects.forEach(o=>o.geometry.dispose());shadowMaterial.dispose();shadowTexture.dispose();env.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
  };
  }catch(error){car.dispose();if(renderer){renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}throw error;}
}
