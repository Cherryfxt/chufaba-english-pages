import * as T from 'three';
export const THEMES=[
{name:'赤焰',tag:'FERRARI INSPIRED',colors:['#aa0015','#f3f2ed','#121416'],finish:'赛车红 / 白色上舱 / 碳黑翼面',intent:'参考 Ferrari SF-26：大面积红色车身、白色上舱与窄肩带、碳黑前后翼及轮组。保留连续气动曲面，不复制商标与赞助贴纸。',names:['赤焰锋翼','跃马飞翼','熔核轮组','烈风侧舱','红域疾驰']},
{name:'炽橙',tag:'MCLAREN INSPIRED',colors:['#f57a15','#131517','#eeeeeb'],finish:'木瓜橙 / 碳黑',intent:'参考 McLaren 的木瓜橙和大面积碳黑留白。',names:['旭日锋翼','疾光尾翼','逐日轮组','焰流侧舱','极速黎明']},
{name:'银箭',tag:'MERCEDES INSPIRED',colors:['#aebabc','#16191b','#00aaa3'],finish:'银灰 / 黑 / 青绿',intent:'参考 Mercedes 银黑主体与克制的青绿色边线。',names:['银箭锋翼','追风尾翼','流星轮组','疾风侧舱','银翼破空']},
{name:'疾牛',tag:'RED BULL INSPIRED',colors:['#10203c','#eabc17','#d91628'],finish:'海军蓝 / 黄 / 红',intent:'参考 Red Bull 海军蓝底色、上舱黄色识别区域和细红线。',names:['雷霆锋翼','破阵尾翼','奔雷轮组','风暴侧舱','深蓝竞速']},
{name:'翠影',tag:'ASTON MARTIN INSPIRED',colors:['#00624d','#c7db22','#111619'],finish:'赛车绿 / 荧黄细线',intent:'参考 Aston Martin 的绿漆与克制荧黄边线。',names:['翠影锋翼','猎风尾翼','暗影轮组','飞梭侧舱','翡翠巡航']},
{name:'蓝湾',tag:'WILLIAMS INSPIRED',colors:['#1763c2','#e8eef1','#102b56'],finish:'蓝 / 白 / 深蓝',intent:'参考 Williams 明确的蓝白大色块。',names:['蓝湾锋翼','海啸尾翼','潮汐轮组','远洋侧舱','蓝域突围']},
{name:'峰影',tag:'ALPINE INSPIRED',colors:['#1673c4','#ed91bd','#17191c'],finish:'蓝 / 粉 / 黑',intent:'参考 Alpine 蓝色主漆与侧箱粉色大色块。',names:['峰影锋翼','雪峰尾翼','凌云轮组','峰流侧舱','云巅疾行']},
{name:'锋芒',tag:'HAAS INSPIRED',colors:['#e9ebeb','#161819','#c52230'],finish:'白 / 黑 / 红',intent:'参考 Haas 白黑主体及红色局部识别。',names:['锋芒前翼','猛隼尾翼','疾驰轮组','切风侧舱','极境挑战']},
{name:'钛锋',tag:'AUDI INSPIRED',colors:['#acb2b6','#e43020','#181b1d'],finish:'银 / 黑 / 红',intent:'参考 Audi 银灰车头、黑色下沿与红色后部。',names:['钛锋前翼','冲刺尾翼','脉动轮组','钛流侧舱','觉醒之速']}
];
const sources=['https://www.formula1.com/en/latest/article/gallery-check-out-every-angle-of-ferraris-2026-f1-car.7HdOPtJJwN5VHJ8XAWVtuS','https://www.mclaren.com/racing/formula-1/2026/mcl40-launch/','https://www.mercedes-amg.com/en/w17','https://www.formula1.com/en/teams/red-bull-racing','https://www.formula1.com/en/teams/aston-martin','https://www.formula1.com/en/teams/williams','https://www.bwt.com/en-us/driving-pink-change/','https://haasf1team.com/news/tgr-haas-f1-team-reveals-vf-26-design-livery','https://www.audif1.com/en/audi-r26-car'];
THEMES.forEach((t,i)=>t.source=sources[i]);
export function coated(n,role='body'){
const t=THEMES[n-1]||THEMES[0],wing=role==='front'||role==='rear',m=new T.MeshPhysicalMaterial({color:0xffffff,metalness:wing?.05:n===3||n===9?.55:.12,roughness:wing?.62:.39,clearcoat:wing?.12:.28,specularIntensity:wing?.35:.45,clearcoatRoughness:.28,envMapIntensity:wing?.28:.5,side:T.DoubleSide});
const cols=t.colors.map(c=>new T.Color(c));
let pattern='';
if(role==='front'||role==='rear')pattern='c=carbon; c=mix(c,c0,smoothstep(.77,.83,az));';
else if(role==='wheel')pattern='c=carbon;';
else if(n===1)pattern=role==='engine'?'c=mix(c0,c1,smoothstep(.62,.65,p.y)*smoothstep(-.65,-.45,p.x)*(1.-smoothstep(1.15,1.25,p.x)));':(role==='body'||role==='sidepod')?'c=mix(c0,c1,(1.-smoothstep(.015,.027,abs(p.y-(.58-.035*p.x))))*step(.21,az));':'c=c0;';
else if(n===2)pattern='c=mix(c0,carbon,smoothstep(.28,.36,az)*(1.-smoothstep(.43,.50,p.y)));c=mix(c,carbon,smoothstep(.28,.35,p.x)*smoothstep(.61,.64,p.y));';
else if(n===3)pattern='c=mix(c0,carbon,smoothstep(-.25,.3,p.x)); c=mix(c,c2,1.-smoothstep(.012,.022,abs(p.y-(.40+.055*p.x))));';
else if(n===4)pattern='c=c0;c=mix(c,c1,(1.-smoothstep(.12,.18,length(vec2(p.x-.68,(p.y-.76)*1.2)))));c=mix(c,c2,(1.-smoothstep(.012,.022,abs(p.y-.48)))*smoothstep(.27,.4,az));';
else if(n===5)pattern='c=c0;c=mix(c,c1,(1.-smoothstep(.008,.018,abs(p.y-(.32+.03*p.x))))*step(.2,az));';
else if(n===6)pattern='c=mix(c0,c2,smoothstep(.55,1.3,p.x));c=mix(c,c1,smoothstep(.38,.43,az)*(1.-smoothstep(.40,.43,p.y)));';
else if(n===7)pattern='c=mix(c0,c1,smoothstep(.32,.40,az)*smoothstep(.7,1.15,p.x));c=mix(c,c1,1.-smoothstep(-2.,-1.7,p.x));';
else if(n===8)pattern='c=mix(carbon,c0,smoothstep(.35,.43,p.y));c=mix(c,c2,1.-smoothstep(.015,.03,abs(p.y-(.44+.04*p.x))));';
else pattern='c=mix(c0,c1,smoothstep(.5,.6,p.x));c=mix(c,carbon,smoothstep(.5,.6,p.x)*smoothstep(.56,.60,p.y));c=mix(c,carbon,1.-smoothstep(.28,.35,p.y));';
m.onBeforeCompile=s=>{s.uniforms.tc0={value:cols[0]};s.uniforms.tc1={value:cols[1]};s.uniforms.tc2={value:cols[2]};s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vp;').replace('#include <begin_vertex>','#include <begin_vertex>\nvp=(modelMatrix*vec4(position,1.)).xyz;');s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vp;uniform vec3 tc0;uniform vec3 tc1;uniform vec3 tc2;').replace('#include <color_fragment>',`#include <color_fragment>\nvec3 p=vp;float az=abs(p.z);vec3 c0=tc0,c1=tc1,c2=tc2,carbon=vec3(.008,.010,.012),c=c0;${pattern}\ndiffuseColor.rgb=c;`);};m.customProgramCacheKey=()=>`v4-${n}-${role}`;return m;
}
