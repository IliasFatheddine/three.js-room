(function(){
const hero=document.getElementById('hero'),stage=document.getElementById('stage'),stick=document.getElementById('stick'),dot=stick.firstElementChild;
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputEncoding=THREE.sRGBEncoding;
stage.appendChild(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(72,1,.1,300);camera.rotation.order='YXZ';
scene.add(new THREE.AmbientLight(0xffffff,1.25));
const sun=new THREE.DirectionalLight(0xffffff,1.2);sun.position.set(-4,10,6);scene.add(sun);
// room (measured from the model): x -1..15, z -11..1, floor y .26, ceiling y 6.02
const R={x0:-1,x1:15,z0:-11,z1:1},FLOOR=.26,EYE=FLOOR+3.0,RAD=.5;
const pos=new THREE.Vector3(12.6,EYE,-5.2);let yaw=Math.PI/2,pitch=-.2,sway=reduce?0:.22,active=false;
const colliders=[];
let baseFov=72,bobAmp=0,phase=0,lastStep=0,runK=0,tcool=0;
// ---- solid tentacles: capsules along each animated bone chain, radius measured from the skinned mesh itself
const SEG=[];
function buildTentacles(m){
 const ms=[];m.traverse(o=>{if(o.isSkinnedMesh)ms.push(o)});
 if(mixer)mixer.update(0);m.updateMatrixWorld(true);
 const v=new THREE.Vector3(),ab=new THREE.Vector3(),ap=new THREE.Vector3(),tm=new THREE.Matrix4();
 for(const mesh of ms){
  const bones=mesh.skeleton.bones,bi=mesh.skeleton.boneInverses,bind=bones.map((b,j)=>new THREE.Vector3().setFromMatrixPosition(tm.copy(bi[j]).invert()));
  const map=new Map(),mine=[];
  bones.forEach((b,j)=>{const c=b.children.find(x=>x.isBone);if(c){const s={a:b,b:c,ja:j,jb:bones.indexOf(c),r:.3,sum:0,n:0};SEG.push(s);mine.push(s);map.set(j,s)}});
  bones.forEach((b,j)=>{if(!map.has(j)&&b.parent&&b.parent.isBone){const s=mine.find(x=>x.b===b);if(s)map.set(j,s)}});
  const P=mesh.geometry.attributes.position,ix=mesh.geometry.attributes.skinIndex,wt=mesh.geometry.attributes.skinWeight,cnt=P.count,step=Math.max(1,Math.floor(cnt/6000));
  for(let i=0;i<cnt;i+=step){let bj=0,bw=-1;const W4=[wt.getX(i),wt.getY(i),wt.getZ(i),wt.getW(i)],I4=[ix.getX(i),ix.getY(i),ix.getZ(i),ix.getW(i)];
   for(let k=0;k<4;k++){if(W4[k]>bw){bw=W4[k];bj=I4[k]}}
   const s=map.get(bj);if(!s||s.jb<0)continue;
   v.set(P.getX(i),P.getY(i),P.getZ(i)).applyMatrix4(mesh.bindMatrix);
   ab.subVectors(bind[s.jb],bind[s.ja]);ap.subVectors(v,bind[s.ja]);
   const L2=ab.lengthSq()||1e-6,u=Math.max(0,Math.min(1,ap.dot(ab)/L2));ap.addScaledVector(ab,-u);const dl=ap.length();if(isFinite(dl)){s.sum+=dl;s.n++}}
  for(const s of mine){const wl=new THREE.Vector3().setFromMatrixPosition(s.b.matrixWorld).distanceTo(new THREE.Vector3().setFromMatrixPosition(s.a.matrixWorld)),bl=bind[s.jb].distanceTo(bind[s.ja]),k=bl>1e-6&&wl>1e-6?wl/bl:1;
   const r=s.n>2?s.sum/s.n*k*1.05+.05:.3;s.r=isFinite(r)?Math.max(.15,Math.min(1.2,r)):.3}
 }
}
const BODY0=FLOOR+.35,BODY1=EYE+.3;
function hitTentacles(){let hit=false;
 for(const s of SEG){const ea=s.a.matrixWorld.elements,eb=s.b.matrixWorld.elements,ax=ea[12],ay=ea[13],az=ea[14],bx=eb[12],by=eb[13],bz=eb[14];
  if(!(ax+ay+az+bx+by+bz===ax+ay+az+bx+by+bz)||Math.max(ay,by)+s.r<BODY0||Math.min(ay,by)-s.r>BODY1)continue;
  const dx=bx-ax,dz=bz-az,L2=dx*dx+dz*dz;let u=L2>1e-6?((pos.x-ax)*dx+(pos.z-az)*dz)/L2:0;u=Math.max(0,Math.min(1,u));
  const qx=ax+dx*u,qz=az+dz*u;let ox=pos.x-qx,oz=pos.z-qz;const dd=Math.hypot(ox,oz),Rr=s.r+RAD;
  if(dd<Rr){if(dd<1e-4){ox=1;oz=0}else{ox/=dd;oz/=dd}pos.x=qx+ox*Rr;pos.z=qz+oz*Rr;hit=true}}
 return hit}
// ---- sound: a boat at sea (all synthesized, nothing to download)
const SND={ctx:null,master:null,on:true,buf:null,an:null};
try{SND.on=localStorage.getItem('lc-snd')!=='0'}catch(e){}
let VOL=.24;
let LOOK=.22;
function audioLevel(){return SND.on?VOL*.6:0}
function audioFade(v){try{if(SND.ctx)SND.master.gain.setTargetAtTime(v,SND.ctx.currentTime,v?1.4:.5)}catch(e){}}
function creak(vol){try{const c=SND.ctx;if(!c||!SND.on)return;vol=vol||1;const t0=c.currentTime,dur=.5+Math.random()*1.1,f0=70+Math.random()*90,f1=f0*(.7+Math.random()*.5);
 const o=c.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(f0,t0);o.frequency.linearRampToValueAtTime(f1,t0+dur);
 const f=c.createBiquadFilter();f.type='bandpass';f.frequency.value=380+Math.random()*500;f.Q.value=9;
 const g=c.createGain();g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(.09*vol,t0+dur*.2);g.gain.linearRampToValueAtTime(.05*vol,t0+dur*.7);g.gain.linearRampToValueAtTime(0,t0+dur);
 const am=c.createOscillator();am.frequency.value=22+Math.random()*30;const ag=c.createGain();ag.gain.value=.04*vol;am.connect(ag);ag.connect(g.gain);
 o.connect(f);f.connect(g);g.connect(SND.master);o.start(t0);am.start(t0);o.stop(t0+dur+.05);am.stop(t0+dur+.05)}catch(e){}}
function footstep(run,side){try{const c=SND.ctx;if(!c||!SND.on)return;const t0=c.currentTime,k=run?1.3:1;
 const n=c.createBufferSource();n.buffer=SND.buf;n.playbackRate.value=.9+Math.random()*.3;const nf=c.createBiquadFilter();nf.type='lowpass';nf.frequency.value=320+Math.random()*180;
 const ng=c.createGain();ng.gain.setValueAtTime(.0,t0);ng.gain.linearRampToValueAtTime(.55*k,t0+.004);ng.gain.exponentialRampToValueAtTime(.001,t0+.14);
 const o=c.createOscillator();o.frequency.setValueAtTime(95,t0);o.frequency.exponentialRampToValueAtTime(48,t0+.13);const og=c.createGain();og.gain.setValueAtTime(.5*k,t0);og.gain.exponentialRampToValueAtTime(.001,t0+.16);
 const pan=c.createStereoPanner?c.createStereoPanner():null;if(pan)pan.pan.value=side?.18:-.18;
 n.connect(nf);nf.connect(ng);o.connect(og);const out=pan||SND.master;ng.connect(out);og.connect(out);if(pan)pan.connect(SND.master);
 n.start(t0,Math.random()*3);o.start(t0);n.stop(t0+.2);o.stop(t0+.2);
 if(Math.random()<.2)creak(.55)}catch(e){}}
function squelch(){try{const c=SND.ctx;if(!c||!SND.on)return;const t0=c.currentTime;
 const n=c.createBufferSource();n.buffer=SND.buf;const bp=c.createBiquadFilter();bp.type='bandpass';bp.Q.value=5;bp.frequency.setValueAtTime(800,t0);bp.frequency.exponentialRampToValueAtTime(170,t0+.35);
 const g=c.createGain();g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(.5,t0+.02);g.gain.exponentialRampToValueAtTime(.001,t0+.4);
 const o=c.createOscillator();o.type='triangle';o.frequency.setValueAtTime(190,t0);o.frequency.exponentialRampToValueAtTime(70,t0+.3);const og=c.createGain();og.gain.setValueAtTime(.18,t0);og.gain.exponentialRampToValueAtTime(.001,t0+.32);
 n.connect(bp);bp.connect(g);g.connect(SND.master);o.connect(og);og.connect(SND.master);n.start(t0,Math.random()*3);o.start(t0);n.stop(t0+.45);o.stop(t0+.45)}catch(e){}}
function audioStart(){try{
 if(SND.ctx){SND.ctx.resume();audioFade(audioLevel());return}
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const c=new AC();SND.ctx=c;
 const master=c.createGain();master.gain.value=0;master.connect(c.destination);SND.master=master;
 const an=c.createAnalyser();an.fftSize=1024;master.connect(an);SND.an=an;
 const len=c.sampleRate*4,buf=c.createBuffer(1,len,c.sampleRate),d=buf.getChannelData(0);let b0=0,b1=0,b2=0;
 for(let i=0;i<len;i++){const w=Math.random()*2-1;b0=.99765*b0+w*.099046;b1=.963*b1+w*.2965164;b2=.57*b2+w*1.0526913;d[i]=(b0+b1+b2+w*.1848)*.2}
 for(let i=0;i<2000;i++){const f=i/2000;d[i]*=f;d[len-1-i]*=f}
 SND.buf=buf;
 const src=()=>{const s=c.createBufferSource();s.buffer=buf;s.loop=true;s.playbackRate.value=.8+Math.random()*.4;s.start(0,Math.random()*3);return s};
 // swell of the sea against the hull
 const sea=src(),lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=650;lp.Q.value=.6;const sg=c.createGain();sg.gain.value=.34;
 const l1=c.createOscillator();l1.frequency.value=.11;const l1g=c.createGain();l1g.gain.value=.24;l1.connect(l1g);l1g.connect(sg.gain);
 const l2=c.createOscillator();l2.frequency.value=.07;const l2g=c.createGain();l2g.gain.value=280;l2.connect(l2g);l2g.connect(lp.frequency);
 sea.connect(lp);lp.connect(sg);sg.connect(master);l1.start();l2.start();
 // deep hull rumble
 const rum=src(),rl=c.createBiquadFilter();rl.type='lowpass';rl.frequency.value=130;const rg=c.createGain();rg.gain.value=.5;rum.connect(rl);rl.connect(rg);rg.connect(master);
 // water lapping at the planks
 const lap=src(),bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=1700;bp.Q.value=1.1;const lg=c.createGain();lg.gain.value=.05;
 const l3=c.createOscillator();l3.frequency.value=.43;const l3g=c.createGain();l3g.gain.value=.045;l3.connect(l3g);l3g.connect(lg.gain);
 const l4=c.createOscillator();l4.frequency.value=.9;const l4g=c.createGain();l4g.gain.value=.025;l4.connect(l4g);l4g.connect(lg.gain);
 lap.connect(bp);bp.connect(lg);lg.connect(master);l3.start();l4.start();
 (function loop(){setTimeout(()=>{if(SND.ctx&&SND.on&&active)creak(1);loop()},3200+Math.random()*5200)})();
 audioFade(audioLevel())}catch(e){console.error(e)}}
const sndBtn=document.getElementById('snd');
function sndLabel(){sndBtn.textContent=SND.on?'Sound: on':'Sound: off'}sndLabel();
sndBtn.onclick=()=>{SND.on=!SND.on;try{localStorage.setItem('lc-snd',SND.on?'1':'0')}catch(e){}sndLabel();audioFade(audioLevel())};
function size(){const w=hero.clientWidth,h=hero.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;baseFov=w/h<.8?85:72;camera.fov=baseFov;camera.updateProjectionMatrix()}
addEventListener('resize',size);size();
function b64(s){const bin=atob(s),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u.buffer}
// ---- message in a bottle: lies on the floor, rolls when you walk into it, drifts with the swell
const BT={ok:false,len:1.0,r:.12,hl:.38,hover:false,hov:0,mg:null,light:null,halo:null,pool:null,chair:null,x:0,z:0,vx:0,vz:0,a:Math.PI/2+.12,w:0,roll:0,t:0,root:null,rg:null,lastClink:0,rg2:null,rf:null};
const PR=.42;let ROOMM=null;const XOBS=[];
function bSamples(x,z,a,o){const c=Math.cos(a),s=-Math.sin(a);for(let i=0;i<5;i++){const u=(i/4*2-1)*BT.hl;o[i*2]=x+c*u;o[i*2+1]=z+s*u}return o}
function eachHit(qx,qz,rad,cb){
 const x0=R.x0,x1=R.x1,z0=R.z0,z1=R.z1;
 if(qx-rad<x0)cb(1,0,x0-(qx-rad));if(qx+rad>x1)cb(-1,0,qx+rad-x1);
 if(qz-rad<z0)cb(0,1,z0-(qz-rad));if(qz+rad>z1)cb(0,-1,qz+rad-z1);
 for(let i=0,NB=colliders.length+XOBS.length;i<NB;i++){const bx=i<colliders.length?colliders[i]:XOBS[i-colliders.length];
  if(qx<bx.min.x-rad||qx>bx.max.x+rad||qz<bx.min.z-rad||qz>bx.max.z+rad)continue;
  const cx=Math.max(bx.min.x,Math.min(bx.max.x,qx)),cz=Math.max(bx.min.z,Math.min(bx.max.z,qz));
  const dx=qx-cx,dz=qz-cz,d2=dx*dx+dz*dz;if(d2>rad*rad)continue;
  if(d2>1e-8){const d=Math.sqrt(d2);cb(dx/d,dz/d,rad-d)}
  else{const l=qx-bx.min.x,r=bx.max.x-qx,n=qz-bx.min.z,f=bx.max.z-qz,m=Math.min(l,r,n,f);
   if(m===l)cb(-1,0,l+rad);else if(m===r)cb(1,0,r+rad);else if(m===n)cb(0,-1,n+rad);else cb(0,1,f+rad)}}
 const ytop=FLOOR+BT.r*2+.15;
 for(let i=0;i<SEG.length;i++){const s=SEG[i],ea=s.a.matrixWorld.elements,eb=s.b.matrixWorld.elements,ax=ea[12],ay=ea[13],az=ea[14],bx=eb[12],by=eb[13],bz=eb[14];
  if(!(ax+ay+az+bx+by+bz===ax+ay+az+bx+by+bz))continue;
  if(Math.min(ay,by)-s.r>ytop||Math.max(ay,by)+s.r<FLOOR)continue;
  const dx=bx-ax,dz=bz-az,L2=dx*dx+dz*dz;let u=L2>1e-6?((qx-ax)*dx+(qz-az)*dz)/L2:0;u=Math.max(0,Math.min(1,u));
  const ox=qx-(ax+dx*u),oz=qz-(az+dz*u),d=Math.hypot(ox,oz),Rr=s.r+rad;
  if(d<Rr){if(d<1e-4)cb(1,0,Rr);else cb(ox/d,oz/d,Rr-d)}}}
function clink(v){try{const c=SND.ctx;if(!c||!SND.on||!SND.master)return;const t0=c.currentTime;
 [[1760,.5],[2637,.35],[3520,.2]].forEach((p,i)=>{const o=c.createOscillator();o.type='sine';o.frequency.value=p[0]*(.97+Math.random()*.06);
  const g=c.createGain();g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(.12*v*p[1],t0+.003);g.gain.exponentialRampToValueAtTime(.0005,t0+.35+i*.1);
  o.connect(g);g.connect(SND.master);o.start(t0);o.stop(t0+.7)})}catch(e){}}
function rollSnd(sp){try{const c=SND.ctx;if(!c||!SND.buf)return;
 if(!BT.rg2){const s=c.createBufferSource();s.buffer=SND.buf;s.loop=true;s.playbackRate.value=1.3;const f=c.createBiquadFilter();f.type='bandpass';f.frequency.value=420;f.Q.value=.8;
  const g=c.createGain();g.gain.value=0;s.connect(f);f.connect(g);g.connect(SND.master);s.start(0,Math.random()*3);BT.rg2=g;BT.rf=f}
 const on=SND.on&&sp>.06;BT.rg2.gain.setTargetAtTime(on?Math.min(.5,sp*.2):0,c.currentTime,.1);BT.rf.frequency.setTargetAtTime(240+sp*170,c.currentTime,.1)}catch(e){}}
function bottleUpdate(dt,pvx,pvz){const b=BT;if(!b.ok)return;dt=Math.min(dt,.05);if(!(dt>0))return;
 const n=Math.max(1,Math.ceil(dt/.01)),h=dt/n,P=[0,0,0,0,0,0,0,0,0,0];let impact=0;
 function bump(nx,nz,pen,qx,qz){b.x+=nx*pen;b.z+=nz*pen;const vn=b.vx*nx+b.vz*nz;
  if(vn<0){const j=-1.3*vn;b.vx+=nx*j;b.vz+=nz*j;const rx=qx-b.x,rz=qz-b.z;b.w=Math.max(-6,Math.min(6,b.w+(rz*nx-rx*nz)*j*2));impact=Math.max(impact,-vn)}}
 for(let it=0;it<n;it++){
  b.t+=h;
  if(noteOpen){const k=Math.exp(-5*h);b.vx*=k;b.vz*=k;b.w*=k}else b.vx+=(Math.sin(b.t*.55)*.9+Math.sin(b.t*.21+1.3)*.6)*.16*h;   // the swell tilts the floor back and forth
  const c=Math.cos(b.a),sn=Math.sin(b.a);
  let vp=b.vx*c-b.vz*sn,vr=b.vx*sn+b.vz*c;                      // along the axis (slides) / across it (rolls)
  vp*=Math.exp(-5*h);vr*=Math.exp(-.9*h);b.w+=vr*.12*h;
  b.vx=vp*c+vr*sn;b.vz=-vp*sn+vr*c;
  b.x+=b.vx*h;b.z+=b.vz*h;b.a+=b.w*h;b.w*=Math.exp(-2.4*h);b.roll+=vr/b.r*h;
  for(let pass=0;pass<2;pass++){bSamples(b.x,b.z,b.a,P);
   for(let i=0;i<5;i++){const qx=P[i*2],qz=P[i*2+1];
    const dx=qx-pos.x,dz=qz-pos.z,d=Math.hypot(dx,dz),Rr=b.r+PR;
    if(d<Rr&&d>1e-4){const nx=dx/d,nz=dz/d;b.x+=nx*(Rr-d);b.z+=nz*(Rr-d);
     const s=pvx*nx+pvz*nz,vn=b.vx*nx+b.vz*nz;
     if(s>.05&&vn<s*1.25){const dv=s*1.25-vn;b.vx+=nx*dv;b.vz+=nz*dv;const rx=qx-b.x,rz=qz-b.z;b.w=Math.max(-6,Math.min(6,b.w+(rz*nx-rx*nz)*dv*1.6));impact=Math.max(impact,dv*.7)}
     else if(vn<0){b.vx-=nx*vn*1.2;b.vz-=nz*vn*1.2}}
    eachHit(qx,qz,b.r,(nx,nz,pen)=>bump(nx,nz,pen,qx,qz))}}
 }
 // if the bottle is wedged against something, step the player out of its way instead of overlapping
 bSamples(b.x,b.z,b.a,P);
 for(let i=0;i<5;i++){const dx=pos.x-P[i*2],dz=pos.z-P[i*2+1],d=Math.hypot(dx,dz),Rr=b.r+PR;if(d<Rr&&d>1e-4){pos.x+=dx/d*(Rr-d);pos.z+=dz/d*(Rr-d)}}
 pos.x=Math.max(R.x0+RAD,Math.min(R.x1-RAD,pos.x));pos.z=Math.max(R.z0+RAD,Math.min(R.z1-RAD,pos.z));
 b.root.position.set(b.x,FLOOR+b.r,b.z);b.root.rotation.y=b.a;b.rg.rotation.x=b.roll;
 b.hover=!!(active&&!noteOpen&&mo.has&&mo.type==='mouse'&&!mo.over&&bHit(mo.x,mo.y));
 b.hov+=((b.hover?1:0)-b.hov)*Math.min(1,dt*6);
 stage.style.cursor=b.hover?'pointer':'';
 if(b.hover){const q=bProject()[1];tagEl.style.left=q[0]+'px';tagEl.style.top=q[1]+'px'}tagEl.classList.toggle('on',b.hover);
 b.burst=Math.max(0,(b.burst||0)-dt*1.2);
 const kk=.82+(reduce?0:.1*Math.sin(b.t*1.6)+.035*Math.sin(b.t*9.3)+.025*Math.sin(b.t*15.7+1))+.25*b.hov+2*(b.burst||0);
 if(b.mg){b.mg.glass.emissiveIntensity=.2*kk;b.mg.parch.emissiveIntensity=.28*kk;b.mg.cork.emissiveIntensity=.08*kk}
 if(b.light)b.light.intensity=.5*kk;
 if(b.halo){b.halo.material.opacity=Math.min(1,.2*kk);const hs=1.5*(1+b.burst*1.5)*(1+(reduce?0:.04*Math.sin(b.t*1.6)));b.halo.scale.set(hs,hs,1)}
 if(b.pool)b.pool.material.opacity=.16*kk;
 const sp=Math.hypot(b.vx,b.vz);rollSnd(sp);
 if(impact>.5&&b.t-b.lastClink>.15){b.lastClink=b.t;clink(Math.min(1,impact/3))}}
const _v=new THREE.Vector3(),_d=new THREE.Vector3();let noteOpen=false;
const noteEl=document.getElementById('note'),noteBtn=document.getElementById('noteclose'),tagEl=document.getElementById('btag');
function bProject(){const b=BT,c=Math.cos(b.a),s=-Math.sin(b.a),y=FLOOR+b.r,w=stage.clientWidth,h=stage.clientHeight,o=[];
 for(const u of[-b.hl,0,b.hl]){_v.set(b.x+c*u,y,b.z+s*u).project(camera);o.push([(_v.x*.5+.5)*w,(-_v.y*.5+.5)*h])}return o}
function bHit(cx,cy){const b=BT;if(!b.ok)return false;camera.getWorldDirection(_d);_v.set(b.x-camera.position.x,0,b.z-camera.position.z);
 if(_v.set(b.x-camera.position.x,FLOOR+b.r-camera.position.y,b.z-camera.position.z).dot(_d)<=.2)return false;
 const dist=_v.length(),P=bProject(),pxr=b.r/dist*(stage.clientHeight/2)/Math.tan(camera.fov*Math.PI/360),tol=Math.max(20,pxr*1.8);
 for(let i=0;i<2;i++){const ax=P[i][0],ay=P[i][1],dx=P[i+1][0]-ax,dy=P[i+1][1]-ay,L=dx*dx+dy*dy;let u=L>1e-6?((cx-ax)*dx+(cy-ay)*dy)/L:0;u=Math.max(0,Math.min(1,u));
  if(Math.hypot(cx-(ax+dx*u),cy-(ay+dy*u))<tol)return true}return false}
// ---- click the bottle: the player walks up to it, looks down at it, then the paper appears
const CIN={on:false,path:null,i:1,t:0,phase:0,wait:0};
function cBlocked(x,z){
 if(x<R.x0+RAD||x>R.x1-RAD||z<R.z0+RAD||z>R.z1-RAD)return true;
 for(let i=0;i<colliders.length;i++){const b=colliders[i];if(x>b.min.x-RAD-.05&&x<b.max.x+RAD+.05&&z>b.min.z-RAD-.05&&z<b.max.z+RAD+.05)return true}
 return false}
function cLos(x0,z0,x1,z1){const n=Math.ceil(Math.hypot(x1-x0,z1-z0)/.12);for(let i=1;i<n;i++){const u=i/n;if(cBlocked(x0+(x1-x0)*u,z0+(z1-z0)*u))return false}return true}
function cPath(sx,sz,gx,gz){   // A* over a coarse floor grid, then pull the string tight
 const cs=.25,nx=Math.ceil((R.x1-R.x0)/cs),nz=Math.ceil((R.z1-R.z0)/cs);
 const cx=x=>Math.max(0,Math.min(nx-1,Math.floor((x-R.x0)/cs))),cz=z=>Math.max(0,Math.min(nz-1,Math.floor((z-R.z0)/cs)));
 const wx=i=>R.x0+(i+.5)*cs,wz=j=>R.z0+(j+.5)*cs,N=nx*nz,blk=new Uint8Array(N);
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)blk[j*nx+i]=cBlocked(wx(i),wz(j))?1:0;
 const s=cz(sz)*nx+cx(sx),g=cz(gz)*nx+cx(gx);blk[s]=0;blk[g]=0;
 const G=new Float32Array(N).fill(1e9),F=new Float32Array(N),P=new Int32Array(N).fill(-1),closed=new Uint8Array(N),open=[s];G[s]=0;
 const gi=g%nx,gj=(g/nx)|0,H=(i,j)=>Math.hypot(i-gi,j-gj);F[s]=H(s%nx,(s/nx)|0);let found=false;
 while(open.length){let bi=0;for(let k=1;k<open.length;k++)if(F[open[k]]<F[open[bi]])bi=k;const c=open.splice(bi,1)[0];if(closed[c])continue;closed[c]=1;if(c===g){found=true;break}
  const ci=c%nx,cj=(c/nx)|0;
  for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){if(!di&&!dj)continue;const ni=ci+di,nj=cj+dj;if(ni<0||nj<0||ni>=nx||nj>=nz)continue;const n=nj*nx+ni;if(blk[n]||closed[n])continue;
   if(di&&dj&&(blk[cj*nx+ni]||blk[nj*nx+ci]))continue;
   const ng=G[c]+(di&&dj?1.414:1);if(ng<G[n]){G[n]=ng;P[n]=c;F[n]=ng+H(ni,nj);open.push(n)}}}
 if(!found)return null;
 const pts=[];for(let c=g;c!==-1;c=P[c])pts.push([wx(c%nx),wz((c/nx)|0)]);pts.reverse();pts[0]=[sx,sz];pts[pts.length-1]=[gx,gz];
 const out=[pts[0]];let a=0;
 while(a<pts.length-1){let b=pts.length-1;while(b>a+1&&!cLos(pts[a][0],pts[a][1],pts[b][0],pts[b][1]))b--;out.push(pts[b]);a=b}
 return out}
function cGoal(){const b=BT,D=1.9,a0=Math.atan2(pos.z-b.z,pos.x-b.x);   // stand on the side we're coming from, if there is room
 for(let k=0;k<30;k++){const a=a0+(k%2?1:-1)*Math.ceil(k/2)*(Math.PI/10);for(const d of[D,D+.35,D-.3]){const x=b.x+Math.cos(a)*d,z=b.z+Math.sin(a)*d;if(!cBlocked(x,z))return[x,z]}}
 return[pos.x,pos.z]}
function wrapA(a){return a-2*Math.PI*Math.floor((a+Math.PI)/(2*Math.PI))}
function pushOut(){for(let i=0;i<2;i++)for(const b of colliders){
  const x0=b.min.x-RAD,x1=b.max.x+RAD,z0=b.min.z-RAD,z1=b.max.z+RAD;
  if(pos.x>x0&&pos.x<x1&&pos.z>z0&&pos.z<z1){const dl=pos.x-x0,dr=x1-pos.x,dn=pos.z-z0,df=z1-pos.z,mn=Math.min(dl,dr,dn,df);
   if(mn===dl)pos.x=x0;else if(mn===dr)pos.x=x1;else if(mn===dn)pos.z=z0;else pos.z=z1}}
 pos.x=Math.max(R.x0+RAD,Math.min(R.x1-RAD,pos.x));pos.z=Math.max(R.z0+RAD,Math.min(R.z1-RAD,pos.z))}
function cinStep(dt){const C=CIN,b=BT,x0=pos.x,z0=pos.z;C.t+=dt;
 let rem=0;{let x=pos.x,z=pos.z;for(let i=C.i;i<C.path.length;i++){rem+=Math.hypot(C.path[i][0]-x,C.path[i][1]-z);x=C.path[i][0];z=C.path[i][1]}}
 if(C.phase===0){
  let left=Math.min(2.7,.5+C.t*3,.35+rem*2.4)*dt;
  while(left>0&&C.i<C.path.length){const w=C.path[C.i],dx=w[0]-pos.x,dz=w[1]-pos.z,d=Math.hypot(dx,dz);
   if(d<=left){pos.x=w[0];pos.z=w[1];left-=d;C.i++}else{pos.x+=dx/d*left;pos.z+=dz/d*left;left=0}}
  pushOut();if(hitTentacles()){pos.x=Math.max(R.x0+RAD,Math.min(R.x1-RAD,pos.x));pos.z=Math.max(R.z0+RAD,Math.min(R.z1-RAD,pos.z));if(tcool<=0){squelch();tcool=.7}}
  if(C.i>=C.path.length||C.t>14){C.phase=1;C.wait=0}}
 // gaze: along the route, then settling on the bottle for the last few steps
 const yb=(x,z)=>Math.atan2(-(x-pos.x),-(z-pos.z)),dist=Math.max(.6,Math.hypot(b.x-pos.x,b.z-pos.z)),yB=yb(b.x,b.z),pB=-Math.atan((EYE-FLOOR-b.r)/dist);
 const near=C.phase?0:Math.max(0,Math.min(1,(rem-.8)/2.6)),p=C.path[Math.min(C.i,C.path.length-1)];
 const ty=yB+wrapA(yb(p[0],p[1])-yB)*near,tp=Math.max(-1.3,pB*(1-near)+(-.18)*near),f=Math.min(1,dt*3.2);
 yaw+=wrapA(ty-yaw)*f;pitch+=(tp-pitch)*f;
 if(C.phase===1){C.wait+=dt;if(C.wait>1.8||(C.wait>.35&&Math.abs(wrapA(yB-yaw))<.04&&Math.abs(pB-pitch)<.04)){C.on=false;revealNote()}}
 return Math.hypot(pos.x-x0,pos.z-z0)}
function rebase(){ yaw0=yaw;pitch0=pitch;mo.x0=mo.has?mo.x:hero.clientWidth/2;mo.y0=mo.has?mo.y:hero.clientHeight/2}
function chime(){try{const c=SND.ctx;if(!c||!SND.on||!SND.master)return;const t0=c.currentTime;
 [523,659,784,1047].forEach((f,i)=>{const o=c.createOscillator();o.type='sine';o.frequency.value=f;const g=c.createGain(),t=t0+i*.09;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.06,t+.02);g.gain.exponentialRampToValueAtTime(.0005,t+1.2);o.connect(g);g.connect(SND.master);o.start(t);o.stop(t+1.3)})}catch(e){}}
function rustle(){try{const c=SND.ctx;if(!c||!SND.on||!SND.master||!SND.buf)return;const t0=c.currentTime,n=c.createBufferSource();n.buffer=SND.buf;n.playbackRate.value=2.2;
 const f=c.createBiquadFilter();f.type='highpass';f.frequency.value=2200;const g=c.createGain();g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(.35,t0+.08);g.gain.linearRampToValueAtTime(.12,t0+.5);g.gain.linearRampToValueAtTime(0,t0+.9);
 n.connect(f);f.connect(g);g.connect(SND.master);n.start(t0,Math.random()*2);n.stop(t0+1)}catch(e){}}
let noteT=0,noteT2=0;
function openNote(){if(noteOpen)return;setNote(false);noteOpen=true;mo.over=true;unlockMouse();for(const k in keys)keys[k]=0;mv=look=null;stick.style.display='none';tagEl.classList.remove('on');BT.hover=false;stage.style.cursor='';
 noteEl.classList.remove('out');
 if(reduce){revealNote();return}
 const g=cGoal();CIN.path=cPath(pos.x,pos.z,g[0],g[1])||[[pos.x,pos.z],g];CIN.i=1;CIN.t=0;CIN.wait=0;CIN.phase=Math.hypot(g[0]-pos.x,g[1]-pos.z)<.3?1:0;CIN.on=true}
function revealNote(){const q=bProject()[1],fl=document.getElementById('nflash');
 noteEl.style.setProperty('--dx',(q[0]-hero.clientWidth/2)+'px');noteEl.style.setProperty('--dy',(q[1]-hero.clientHeight/2)+'px');
 if(reduce){noteEl.classList.add('on');noteBtn.focus({preventScroll:true});return}
 BT.burst=1;clink(.7);setTimeout(()=>clink(.35),180);chime();
 fl.style.left=q[0]+'px';fl.style.top=q[1]+'px';fl.classList.remove('go');void fl.offsetWidth;fl.classList.add('go');
 noteT=setTimeout(()=>{rustle();noteEl.classList.add('on');noteBtn.focus({preventScroll:true})},700)}
function closeNote(){if(!noteOpen)return;
 if(BK.active){if(noteEl.classList.contains('on')){noteEl.classList.add('out');clearTimeout(noteT2);noteT2=setTimeout(()=>{noteEl.classList.remove('on','out')},320)}closeBook();return}noteOpen=false;mo.over=false;clearTimeout(noteT);CIN.on=false;rebase();lockMouse();
 if(!noteEl.classList.contains('on')){stage.focus({preventScroll:true});return}
 noteEl.classList.add('out');clearTimeout(noteT2);noteT2=setTimeout(()=>{noteEl.classList.remove('on','out')},320);stage.focus({preventScroll:true})}
noteBtn.addEventListener('click',closeNote);
noteEl.addEventListener('pointerdown',e=>{if(e.target===noteEl)closeNote()});
let dn=null;stage.addEventListener('pointerdown',e=>{dn=[e.clientX,e.clientY]},true);
stage.addEventListener('click',e=>{if(!active||noteOpen||!BT.ok)return;if(dn&&Math.hypot(e.clientX-dn[0],e.clientY-dn[1])>10)return;
 const r=stage.getBoundingClientRect();if(bHit(...aimXY(e,r)))openNote()});
addEventListener('keydown',e=>{if(noteOpen){if(e.code==='Escape')closeNote();e.stopPropagation();return}
 if(active&&BT.ok&&e.code==='KeyE'&&Math.hypot(BT.x-pos.x,BT.z-pos.z)<2.8){openNote();e.stopPropagation()}},true);
function bFree(x,z,a){const P=bSamples(x,z,a,[]);let bad=false;for(let i=0;i<5&&!bad;i++)eachHit(P[i*2],P[i*2+1],BT.r+.3,()=>{bad=true});return !bad}
function loadBottle(){try{loader.parse(b64(takeData('d_bottle')),'',g=>{try{
 const raw=g.scene,box=new THREE.Box3().setFromObject(raw),sz=box.getSize(new THREE.Vector3()),ctr=box.getCenter(new THREE.Vector3());
 const S=BT.len/sz.y;BT.r=Math.max(sz.x,sz.z)/2*S;BT.hl=BT.len/2-BT.r;raw.position.sub(ctr);
 const MG={};
 raw.traverse(o=>{if(!o.isMesh)return;const mt=o.material,nm=(mt&&mt.name||'').toLowerCase(),kind=/glass/.test(nm)?'glass':/cork/.test(nm)?'cork':'parch';
  o.renderOrder=kind==='glass'?3:kind==='cork'?2:1;o.frustumCulled=false;
  mt.emissive=new THREE.Color(kind==='glass'?0x6fd08a:kind==='cork'?0x8fb070:0xc8e8a0);if(kind==='parch'&&mt.map)mt.emissiveMap=mt.map;mt.emissiveIntensity=.8;mt.needsUpdate=true;MG[kind]=mt});
 BT.mg=MG;
 const inner=new THREE.Group();inner.add(raw);inner.scale.setScalar(S);inner.rotation.z=Math.PI/2;   // the model stands up: lay it along the local X axis
 const rg=new THREE.Group();rg.add(inner);const root=new THREE.Group();root.add(rg);
 const cv=document.createElement('canvas');cv.width=cv.height=64;const cx=cv.getContext('2d'),gr=cx.createRadialGradient(32,32,2,32,32,31);
 gr.addColorStop(0,'rgba(0,0,0,.7)');gr.addColorStop(.6,'rgba(0,0,0,.28)');gr.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=gr;cx.fillRect(0,0,64,64);
 const sh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false}));
 sh.rotation.x=-Math.PI/2;sh.scale.set(BT.len*1.15,BT.r*2*1.9,1);sh.position.y=-BT.r+.03;sh.renderOrder=0;root.add(sh);
 // golden light shining from inside the bottle
 const gtex=st=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);st.forEach(q=>g.addColorStop(q[0],q[1]));x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)};
 const light=new THREE.PointLight(0x9be6a0,.5,5,1.2);light.position.set(0,.03,0);root.add(light);BT.light=light;
 const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:gtex([[0,'rgba(190,255,200,.9)'],[.25,'rgba(120,225,150,.4)'],[.6,'rgba(80,190,120,.1)'],[1,'rgba(60,170,100,0)']]),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:.2}));
 halo.scale.set(1.5,1.5,1);halo.renderOrder=5;root.add(halo);BT.halo=halo;
 const pool=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:gtex([[0,'rgba(170,240,185,.8)'],[.5,'rgba(100,200,130,.22)'],[1,'rgba(70,180,110,0)']]),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:.16}));
 pool.rotation.x=-Math.PI/2;pool.scale.set(2.2,2.2,1);pool.position.y=-BT.r+.04;pool.renderOrder=0;root.add(pool);BT.pool=pool;
 // park it beside the chair, on the side that faces the door
 let cc=null;if(ROOMM){let bb=null;ROOMM.traverse(o=>{if(!o.isMesh)return;const nm=((o.material&&o.material.name)||'')+' '+o.name;if(!/chair/i.test(nm))return;
   const q=new THREE.Box3().setFromObject(o),c=q.getCenter(new THREE.Vector3());if(c.x<R.x0||c.x>R.x1||c.z<R.z0||c.z>R.z1)return;bb=bb?bb.union(q):q});
  if(bb){cc=bb.getCenter(new THREE.Vector3())}}
 const cx0=cc?cc.x:3.96,cz0=cc?cc.z:-4.82,toP=Math.atan2(pos.z-cz0,pos.x-cx0);let spot=null;
 for(let k=0;k<60&&!spot;k++){const rad=1.0+k*.12;for(let j=0;j<24&&!spot;j++){const an=toP+(j%2?1:-1)*Math.ceil(j/2)*(Math.PI/12),x=cx0+Math.cos(an)*rad,z=cz0+Math.sin(an)*rad;
   if(bFree(x,z,BT.a))spot=[x,z]}}
 if(!spot){console.warn('no free floor for the bottle');return}
 BT.x=spot[0];BT.z=spot[1];root.position.set(BT.x,FLOOR+BT.r,BT.z);root.rotation.y=BT.a;
 texRegister(root);scene.add(root);BT.root=root;BT.rg=rg;BT.ok=true;
 }catch(e){console.error('bottle',e)}},e=>console.error('bottle load',e))}catch(e){console.error(e)}}
// ---- the floating scroll box "About me": rests beside the stacks of books, flies to you and lifts its lid when clicked
const BK={ok:false,state:'closed',active:false,t:0,u:0,f:0,f0:0,op:0,s:1,clk:0,burst:0,hov:0,hover:false,ref:false,root:null,inner:null,mixer:null,act:null,mat:null,halo:null,
 base:new THREE.Vector3(),qBase:new THREE.Quaternion(),fpos:new THREE.Vector3(),fq:new THREE.Quaternion()};
// the box is long and narrow and lies diagonally in its own file: BOX_ANG turns its long axis along x, BOX_CX/CZ/CY centre it. TA..TB is the lid's closed..open stretch of the clip.
const BOX_LEN=.882,BOX_W=.12,BOX_CY=.055,BOX_BOT=-.005,BOX_ANG=2.0153,BOX_CX=-.0033,BOX_CZ=.0147,TA=3.4,TB=5.9,TILT=.65;
const _kv=new THREE.Vector3(),_kd=new THREE.Vector3(),_ku=new THREE.Vector3(),_kp=new THREE.Vector3(),_kq2=new THREE.Quaternion(),_kr=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),TILT);
const kTag=document.getElementById('ktag'),kClose=document.getElementById('kclose');
// the box uses the very same unrolling paper as the bottle; only the title and words change
const NOTE_T=document.getElementById('notet'),NOTE_B=document.querySelector('#note .nb'),LOG_TITLE=NOTE_T.textContent,LOG_BODY=NOTE_B.innerHTML,
 ABOUT_BODY='<p class="op">A message in a bottle… or rather, in a box.</p><p>This is only a trial, a small harbour built to test the waters of React Three Fiber and the reactive magic of JSX.</p><p>Here a scene is written like a sentence, and every lamp, every tentacle, every drifting page is a component waiting to be woven into the tide.</p><p class="em">Nothing here is finished.<br>Everything here is learning.</p><p>Think of it as a sketch drawn in light: a place to make mistakes, to chart new currents, and to see how far a few lines of code can sail.</p><p class="fl">Welcome aboard, explorer.</p>';
function setNote(box){NOTE_T.textContent=box?'About':LOG_TITLE;NOTE_B.innerHTML=box?ABOUT_BODY:LOG_BODY;NOTE_B.scrollTop=0}
function showBoxNote(){const P=bkScreen(BK.root.position)||{x:hero.clientWidth/2,y:hero.clientHeight/2};setNote(true);noteEl.classList.remove('out');
 noteEl.style.setProperty('--dx',(P.x-hero.clientWidth/2)+'px');noteEl.style.setProperty('--dy',(P.y-hero.clientHeight/2)+'px');
 rustle();noteEl.classList.add('on');noteBtn.focus({preventScroll:true})}
function kease(u){u=Math.max(0,Math.min(1,u));return u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2}
function gtex(st){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);st.forEach(q=>g.addColorStop(q[0],q[1]));x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)}
function bkPlace(){const k=BK,bx=BT.ok?BT.x:5.9,bz=BT.ok?BT.z:-4.7;let cx=bx,cz=bz,rad0=1.35;
 // find the stacks of books that sit on the floor and drop the box right beside the nearest stack
 {let best=1e9;bookStacks().forEach(c=>{const d=Math.hypot(c[0]-bx,c[1]-bz);if(d<best){best=d;cx=c[0];cz=c[1];rad0=.95}})}
 const toP=Math.atan2(bz-cz,bx-cx);let spot=null;
 const flat=(x,z)=>{let bad=false;eachHit(x,z,.62,()=>{bad=true});return !bad};   // clear of furniture, walls, other stacks and tentacles
 for(let n=0;n<40&&!spot;n++){const rad=rad0+n*.12;for(let j=0;j<16&&!spot;j++){const an=toP+(j%2?1:-1)*Math.ceil(j/2)*(Math.PI/8),x=cx+Math.cos(an)*rad,z=cz+Math.sin(an)*rad;
   if(x>R.x0+.7&&x<R.x1-.7&&z>R.z0+.7&&z<R.z1-.7&&flat(x,z))spot=[x,z]}}
 if(!spot)spot=[cx+1.5,cz];
 const yaw=.35,a=.5*BOX_LEN*k.s,w=.5*BOX_W*k.s,hx=Math.abs(Math.cos(yaw))*a+Math.abs(Math.sin(yaw))*w,hz=Math.abs(Math.sin(yaw))*a+Math.abs(Math.cos(yaw))*w;
 k.base.set(spot[0],FLOOR+(BOX_CY-BOX_BOT)*k.s+.004,spot[1]);k.qBase.setFromEuler(new THREE.Euler(0,yaw,0));   // resting on the floor, lid up
 XOBS.push({min:{x:spot[0]-hx,y:FLOOR,z:spot[1]-hz},max:{x:spot[0]+hx,y:FLOOR+.25,z:spot[1]+hz}})}
function bkScreen(p){camera.getWorldDirection(_kd);_kv.copy(p).sub(camera.position);const dist=_kv.length();if(_kv.dot(_kd)<=.15)return null;
 _kv.copy(p).project(camera);const w=stage.clientWidth,h=stage.clientHeight;
 return{x:(_kv.x*.5+.5)*w,y:(-_kv.y*.5+.5)*h,dist,px:(.42*BK.s/dist)*(h/2)/Math.tan(camera.fov*Math.PI/360)}}
function kHit(cx,cy){const P=bkScreen(BK.fpos);if(!P)return false;
 if(Math.hypot(cx-P.x,cy-P.y)<Math.max(30,P.px*1.1))return true;
 const ly=P.y-P.px-26;return Math.abs(cx-P.x)<62&&Math.abs(cy-ly)<18}
// where the box hangs while it is being read: in the lower part of the view, tilted toward you, so the text can sit above it
const _kry=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);
function bkReadPose(p,q){const hf=Math.tan(camera.fov*Math.PI/360),d=Math.max(BOX_LEN*BK.s/(.64*2*hf*camera.aspect),.45);
 camera.getWorldDirection(_kd);_ku.set(0,1,0).applyQuaternion(camera.quaternion);
 p.copy(camera.position).addScaledVector(_kd,d).addScaledVector(_ku,-.46*hf*d);
 q.copy(camera.quaternion).multiply(_kr).multiply(_kry)}   // _kry: box turned half a turn on its own axis so the hinge is at the back and the lid lifts UP, with the tray visible below
function openBook(){if(noteOpen||!BK.ok||BK.state!=='closed')return;noteOpen=true;BK.active=true;mo.over=true;unlockMouse();for(const k in keys)keys[k]=0;mv=look=null;stick.style.display='none';
 tagEl.classList.remove('on');BT.hover=false;BK.hover=false;stage.style.cursor='';kTag.classList.remove('on','hv');BK.state='fly';BK.t=0;BK.burst=1;chime();clink(.3)}
function closeBook(){if(!BK.active)return;kClose.classList.remove('on');
 if(BK.state==='fly')BK.state='back';else if(BK.state==='open'||BK.state==='read'){BK.f0=BK.f;BK.state='shut';BK.t=0}}
function finishBook(){BK.state='closed';BK.active=false;BK.u=0;BK.op=0;noteOpen=false;mo.over=false;rebase();lockMouse();kClose.classList.remove('on');stage.focus({preventScroll:true});clink(.35)}
function bookUpdate(dt){const k=BK;if(!k.ok)return;dt=Math.min(dt,.05);k.clk+=dt;
 if(!k.ref){if(!BT.ok&&k.clk<4)return;   // wait for the bottle so the box can be dropped next to it
  k.s=1;k.inner.scale.setScalar(k.s);k.halo.scale.set(k.s*1.7,k.s*1.7,1);bkPlace();k.root.visible=true;k.ref=true}
 k.fpos.copy(k.base);k.fq.copy(k.qBase);
 const st=k.state;let f=k.f;
 if(st==='closed'){k.u=0;f=0}
 else if(st==='fly'){k.u=Math.min(1,k.u+dt/1.1);f=0;if(k.u>=1){k.state='open';k.t=0;rustle()}}
 else if(st==='open'){k.t+=dt;k.u=1;f=kease(k.t/.95);if(k.t>=.95){k.state='read';k.t=0;showBoxNote()}}
 else if(st==='read'){k.t+=dt;k.u=1;f=1;k.op=Math.min(1,k.t/.55)}
 else if(st==='shut'){k.t+=dt;k.u=1;k.op=Math.max(0,1-k.t/.25);f=k.f0*(1-kease((k.t-.2)/.85));if(k.t>=1.05){k.state='back';k.t=0;f=0}}
 else if(st==='back'){k.u=Math.max(0,k.u-dt/1);f=0;k.op=0;if(k.u<=0)finishBook()}
 k.f=f;const u=kease(k.u);
 if(u>0){bkReadPose(_kp,_kq2);if(u>=1){k.root.position.copy(_kp);k.root.quaternion.copy(_kq2)}else{k.root.position.copy(k.fpos).lerp(_kp,u);k.root.quaternion.copy(k.fq).slerp(_kq2,u)}}
 else{k.root.position.copy(k.fpos);k.root.quaternion.copy(k.fq)}
 k.act.time=TA+(TB-TA)*f;k.mixer.update(0);
 // glow + hover + the "About me" label
 k.hover=!!(st==='closed'&&active&&!noteOpen&&mo.has&&mo.type==='mouse'&&!mo.over&&kHit(mo.x,mo.y));
 k.hov+=((k.hover?1:0)-k.hov)*Math.min(1,dt*6);k.burst=Math.max(0,k.burst-dt*1.1);
 const pul=reduce?0:.05*Math.sin(k.clk*1.7);
 k.halo.material.opacity=Math.min(1,(st==='closed'?.17:.07)+pul+.25*k.hov+.8*k.burst);const hs=k.s*1.7*(1+k.burst*.7);k.halo.scale.set(hs,hs,1);
 k.mat.color.setScalar(1.25+.25*k.hov+.4*k.burst);
 let show=false;
 if(st==='closed'&&active&&!noteOpen){const P=bkScreen(k.fpos);if(P&&P.dist<22){show=true;kTag.style.left=P.x+'px';kTag.style.top=(P.y-P.px-26)+'px'}}
 kTag.classList.toggle('on',show);kTag.classList.toggle('hv',show&&k.hover);stage.style.cursor=(k.hover||BT.hover)?'pointer':''}
function loadBook(){try{loader.parse(b64(takeData('d_book')),'',g=>{try{
 const raw=g.scene;raw.traverse(o=>{if(o.isMesh){o.frustumCulled=false;BK.mat=o.material}});BK.mat.color.setScalar(1.25);
 // turn the long axis along x and put the middle of the box at the origin
 const fix=new THREE.Group();fix.rotation.y=BOX_ANG;{const c=Math.cos(BOX_ANG),s=Math.sin(BOX_ANG);fix.position.set(-(BOX_CX*c+BOX_CZ*s),-BOX_CY,-(-BOX_CX*s+BOX_CZ*c))}fix.add(raw);
 const inner=new THREE.Group();inner.add(fix);const root=new THREE.Group();root.add(inner);root.visible=false;
 BK.mixer=new THREE.AnimationMixer(raw);BK.act=BK.mixer.clipAction(g.animations[0]);BK.act.play();BK.act.paused=true;BK.act.time=TA;BK.mixer.update(0);
 const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:gtex([[0,'rgba(190,255,205,.9)'],[.25,'rgba(120,225,150,.4)'],[.6,'rgba(80,190,120,.1)'],[1,'rgba(60,170,100,0)']]),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:.17}));
 halo.renderOrder=5;root.add(halo);BK.halo=halo;
 texRegister(root);scene.add(root);BK.root=root;BK.inner=inner;BK.ok=true;
 }catch(e){console.error('box',e)}},e=>console.error('box load',e))}catch(e){console.error(e)}}
kClose.addEventListener('click',closeBook);
stage.addEventListener('click',e=>{if(!active||noteOpen||!BK.ok||BK.state!=='closed')return;if(dn&&Math.hypot(e.clientX-dn[0],e.clientY-dn[1])>10)return;
 const r=stage.getBoundingClientRect();if(kHit(...aimXY(e,r)))openBook()});
addEventListener('keydown',e=>{if(noteOpen||!active||!BK.ok||BK.state!=='closed'||e.code!=='KeyE')return;if(Math.hypot(BK.fpos.x-pos.x,BK.fpos.z-pos.z)<4){e.stopPropagation();openBook()}},true);
// ---- memory: upload each texture to the GPU once, then release the decoded copy three.js would otherwise keep alive (ImageBitmap)
const TQ={q:[],cnt:new Map()};
function texRegister(root){const seen=new Set();
 root.traverse(o=>{if(!o.isMesh||!o.material)return;(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{for(const k in m){const t=m[k];
  if(!t||!t.isTexture||!t.source||seen.has(t))continue;seen.add(t);TQ.q.push(t);TQ.cnt.set(t.source,(TQ.cnt.get(t.source)||0)+1);
  const prev=t.onUpdate;t.onUpdate=function(){if(prev)prev.apply(this,arguments);if(this.__done)return;this.__done=1;
   const n=(TQ.cnt.get(this.source)||1)-1;TQ.cnt.set(this.source,n);
   if(n<=0){const im=this.source.data;if(typeof ImageBitmap!=='undefined'&&im instanceof ImageBitmap){try{im.close()}catch(e){}}}}}})})}
function texPump(){let n=0;while(TQ.q.length&&n<3){const t=TQ.q.shift();try{renderer.initTexture(t)}catch(e){}n++}}   // a few per frame so loading never stalls
// the decoded copies are gone after upload, so a lost WebGL context cannot be rebuilt in place: start fresh instead
renderer.domElement.addEventListener('webglcontextlost',e=>e.preventDefault());
renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());
// ---- speed: hundreds of separate meshes (601 are books) are merged per material into a few draw calls.
const MG={on:false,before:0,after:0,stacks:[]};
const KEEPA=new Set(['position','normal','tangent','uv','uv2','color']);
function mergeStatic(root){
 root.updateMatrixWorld(true);
 const inv=new THREE.Matrix4().copy(root.matrixWorld).invert(),groups=new Map(),tb=new THREE.Box3(),ctr=new THREE.Vector3(),T=new THREE.Vector3();let before=0;
 root.traverse(o=>{if(!o.isMesh)return;before++;if(o.isSkinnedMesh||o.isInstancedMesh)return;
  const mt=o.material,g=o.geometry;
  if(mt&&!Array.isArray(mt)&&/^Book_[123]_Mat$/.test(mt.name||'')){tb.setFromObject(o);if(tb.min.y<=FLOOR+.5){tb.getCenter(ctr);   // remember the stacks of books on the floor before they disappear into a merged mesh
    if(ctr.x>=R.x0+.5&&ctr.x<=R.x1&&ctr.z>=R.z0+.3&&ctr.z<=R.z1-.3)MG.stacks.push([ctr.x,ctr.z])}}
  if(!mt||Array.isArray(mt)||mt.transparent||mt.isShaderMaterial||/chair/i.test(mt.name||'')||!g||!g.attributes.position||!g.attributes.normal||!o.visible)return;
  if(g.morphAttributes&&Object.keys(g.morphAttributes).length)return;if(g.groups&&g.groups.length>1)return;
  for(let p=o.parent;p&&p!==root;p=p.parent)if(p.isBone)return;
  const names=Object.keys(g.attributes).filter(n=>KEEPA.has(n)).sort(),key=mt.uuid+'|'+names.join(',');
  let G=groups.get(key);if(!G){G={mt,names,list:[]};groups.set(key,G)}G.list.push(o)});
 const built=[];
 groups.forEach(G=>{if(G.list.length<2)return;
  let vc=0,ic=0;G.list.forEach(o=>{const g=o.geometry;vc+=g.attributes.position.count;ic+=g.index?g.index.count:g.attributes.position.count});
  const first=G.list[0].geometry,arrs={};G.names.forEach(n=>{arrs[n]=new Float32Array(vc*first.attributes[n].itemSize)});
  const idx=new Uint32Array(ic);let vo=0,io=0;
  G.list.forEach(o=>{const g=o.geometry,mtx=new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld),nm=new THREE.Matrix3().getNormalMatrix(mtx),flip=mtx.determinant()<0,n=g.attributes.position.count;
   G.names.forEach(name=>{const a=g.attributes[name],out=arrs[name],sz=a.itemSize;
    if(name==='position'){for(let i=0;i<n;i++){T.fromBufferAttribute(a,i).applyMatrix4(mtx);out[(vo+i)*3]=T.x;out[(vo+i)*3+1]=T.y;out[(vo+i)*3+2]=T.z}}
    else if(name==='normal'){for(let i=0;i<n;i++){T.fromBufferAttribute(a,i).applyNormalMatrix(nm).normalize();out[(vo+i)*3]=T.x;out[(vo+i)*3+1]=T.y;out[(vo+i)*3+2]=T.z}}
    else if(name==='tangent'){for(let i=0;i<n;i++){T.set(a.getX(i),a.getY(i),a.getZ(i)).transformDirection(mtx);const q=(vo+i)*4;out[q]=T.x;out[q+1]=T.y;out[q+2]=T.z;out[q+3]=flip?-a.getW(i):a.getW(i)}}
    else{for(let i=0;i<n;i++){const q=(vo+i)*sz;out[q]=a.getX(i);if(sz>1)out[q+1]=a.getY(i);if(sz>2)out[q+2]=a.getZ(i);if(sz>3)out[q+3]=a.getW(i)}}});
   const ix=g.index,cnt=ix?ix.count:n;
   for(let k=0;k<cnt;k+=3){const a=ix?ix.getX(k):k,b=ix?ix.getX(k+1):k+1,c=ix?ix.getX(k+2):k+2;
    if(flip){idx[io++]=vo+a;idx[io++]=vo+c;idx[io++]=vo+b}else{idx[io++]=vo+a;idx[io++]=vo+b;idx[io++]=vo+c}}   // a mirrored mesh needs its winding flipped
   vo+=n});
  const geo=new THREE.BufferGeometry();G.names.forEach(n=>geo.setAttribute(n,new THREE.BufferAttribute(arrs[n],first.attributes[n].itemSize)));
  geo.setIndex(new THREE.BufferAttribute(idx,1));geo.computeBoundingSphere();geo.computeBoundingBox();
  const mesh=new THREE.Mesh(geo,G.mt);mesh.name='merged_'+(G.mt.name||'');mesh.matrixAutoUpdate=false;built.push({mesh,list:G.list})});
 // nothing has been touched until every merged mesh has been built successfully
 built.forEach(b=>{root.add(b.mesh);b.list.forEach(o=>{if(o.parent)o.parent.remove(o)})});
 const users=new Map();let after=0;root.traverse(o=>{if(o.isMesh){after++;if(o.geometry)users.set(o.geometry,1)}});
 built.forEach(b=>b.list.forEach(o=>{const g=o.geometry;if(g&&!users.has(g)&&!g.__d){g.__d=1;g.dispose()}}));
 MG.on=true;MG.before=before;MG.after=after}
function bookStacks(){if(MG.stacks.length)return MG.stacks;const out=[];if(!ROOMM)return out;const tb=new THREE.Box3(),ctr=new THREE.Vector3();
 ROOMM.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh||!o.material||!/^Book_[123]_Mat$/.test(o.material.name||''))return;tb.setFromObject(o);if(tb.min.y>FLOOR+.5)return;tb.getCenter(ctr);
  if(ctr.x<R.x0+.5||ctr.x>R.x1||ctr.z<R.z0+.3||ctr.z>R.z1-.3)return;out.push([ctr.x,ctr.z])});return out}
// ---- cap at 60 fps (a 144 Hz screen would otherwise render 2.4x as much)
const FPS={last:0};
const loader=new THREE.GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
let mixer=null;const clock=new THREE.Clock();
// the sea picture seen through the windows ("Fon") sat about 9 units behind them: bring it close to the windows and shrink it so it still fills the view
const SEA_X=-6,SEA_K=.85;
function nearSea(m){m.updateMatrixWorld(true);m.traverse(o=>{if(!o.isMesh||!/Fon_0$/.test(o.name))return;
  const c0=new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
  o.scale.multiplyScalar(SEA_K);o.updateMatrixWorld(true);
  const c=new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()),to=new THREE.Vector3(SEA_X,c0.y,c0.z),pa=o.parent;   // keep its height and sideways position, slide it toward the windows
  if(pa){pa.updateMatrixWorld(true);o.position.add(pa.worldToLocal(to.clone()).sub(pa.worldToLocal(c.clone())))}
  o.updateMatrixWorld(true)})}
loader.parse(b64(takeData('d_glb')),'',gltf=>{
 const m=gltf.scene;scene.add(m);try{nearSea(m)}catch(e){console.error('sea',e)}
 if(gltf.animations.length){mixer=new THREE.AnimationMixer(m);gltf.animations.forEach(a=>mixer.clipAction(a).play())}
 m.updateMatrixWorld(true);
 m.traverse(o=>{if(o.isSkinnedMesh)o.frustumCulled=false});
 m.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh)return;const n=(o.material&&o.material.name||'').toLowerCase();
  if(/wall|floor|ceiling|window|note/.test(n))return;
  const b=new THREE.Box3().setFromObject(o),c=b.getCenter(new THREE.Vector3());
  if(c.x<R.x0||c.x>R.x1||c.z<R.z0||c.z>R.z1)return;
  if(b.min.y>EYE-.6||b.max.y<FLOOR+1.2)return;
  if(b.max.x-b.min.x>10||b.max.z-b.min.z>10)return;
  colliders.push(b)});
 try{buildTentacles(m)}catch(e){console.error('tentacle colliders',e)}
 try{mergeStatic(m)}catch(e){console.error("merge",e)}
 ROOMM=m;texRegister(m);loadBottle();loadBook();hero.classList.add('ready');
},e=>{document.getElementById('load').textContent='The model could not be loaded.';console.error(e)});
// input
const keys={};let look=null,mv=null;
addEventListener('keydown',e=>{if(!active)return;if(e.code==='Escape'){if(!locked())leave();return}keys[e.code]=1;if(/Arrow|Space/.test(e.code))e.preventDefault()});
addEventListener('keyup',e=>{keys[e.code]=0});
const mo={x:0,y:0,x0:0,y0:0,has:false,over:false,type:'mouse'};let yaw0=Math.PI/2,pitch0=-.2;
// ---- aim: the mouse is locked to the middle of the screen (like a first-person game). Only mouse *movement* turns the camera, so it never keeps spinning.
const canLock=!!stage.requestPointerLock;
function locked(){return document.pointerLockElement===stage}
function lockMouse(){if(!canLock||locked())return;try{const r=stage.requestPointerLock();if(r&&r.catch)r.catch(()=>{})}catch(e){}}
function unlockMouse(){if(document.pointerLockElement)document.exitPointerLock()}
function aimMode(){return active&&!noteOpen&&mo.type==='mouse'&&(locked()||!mo.over)}   // the crosshair is the pointer: used whether or not the browser grants the lock
function aimXY(e,r){return aimMode()?[r.width/2,r.height/2]:[e.clientX-r.left,e.clientY-r.top]}
document.addEventListener('pointerlockchange',()=>{if(locked()){mo.has=true;mo.type='mouse';mo.over=false}});
document.addEventListener('pointerlockerror',()=>{});
document.addEventListener('mousemove',e=>{if(!active||noteOpen||CIN.on||mo.type!=='mouse'||(!locked()&&mo.over))return;let dx=e.movementX||0,dy=e.movementY||0;if(Math.abs(dx)>250||Math.abs(dy)>250)return;const k=.0022*LOOK/.3;yaw-=dx*k;pitch=Math.max(PITCH_MIN,Math.min(.75,pitch-dy*k))});
stage.addEventListener('click',()=>{if(active&&!noteOpen&&!locked())lockMouse()});
addEventListener('pointermove',e=>{mo.type=e.pointerType;if(e.pointerType!=='mouse')return;const r=hero.getBoundingClientRect();mo.x=e.clientX-r.left;mo.y=e.clientY-r.top;mo.has=true;mo.over=!!(e.target.closest&&e.target.closest('#hud,#note'))},{passive:true});
const hint=document.getElementById('hint');if(matchMedia('(pointer:coarse)').matches)hint.textContent='Left thumb to move · drag to look';
function enter(){audioStart();active=true;hero.classList.add('walking');stage.focus({preventScroll:true});lockMouse();
 mo.x0=mo.has?mo.x:hero.clientWidth/2;mo.y0=mo.has?mo.y:hero.clientHeight/2;yaw0=yaw;pitch0=pitch}
function leave(){audioFade(0);active=false;hero.classList.remove('walking');if(window.__venomWake)window.__venomWake();for(const k in keys)keys[k]=0;stick.style.display='none';mv=look=null;if(document.pointerLockElement)document.exitPointerLock()}
const warnEl=document.getElementById('warn'),goBtn=document.getElementById('go');
function hideWarn(){warnEl.classList.remove('on')}
goBtn.onclick=()=>{warnEl.classList.add('on');document.getElementById('wgo').focus({preventScroll:true})};
document.getElementById('wgo').onclick=()=>{hideWarn();enter()};
document.getElementById('wrest').onclick=()=>{hideWarn();goBtn.focus({preventScroll:true})};
warnEl.addEventListener('pointerdown',e=>{if(e.target===warnEl)hideWarn()});
addEventListener('keydown',e=>{if(e.code==='Escape'&&warnEl.classList.contains('on')){hideWarn();goBtn.focus({preventScroll:true})}});
document.getElementById('leave').onclick=leave;
const PITCH_MIN=-1.52,DA=Math.atan2(-2.4,1.8)+.1,DB=Math.atan2(-2.4,-.2)-.1; // angular span of the door (x=15, z -7..-5) seen from the start spot; kept out of view
function turn(dx,dy){   // free 360° turn, and down far enough to see your own feet
 yaw-=dx*.0035*LOOK;pitch=Math.max(PITCH_MIN,Math.min(.75,pitch-dy*.007*LOOK))}
stage.addEventListener('pointerdown',e=>{
 if(!active)return;
 const r=stage.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
 stage.setPointerCapture(e.pointerId);
 if(e.pointerType==='touch'&&x<r.width*.45&&!mv){mv={id:e.pointerId,x,y,dx:0,dy:0};stick.style.display='block';stick.style.left=x+'px';stick.style.top=y+'px';dot.style.transform='none'}
 else if(!look&&e.pointerType==='touch'){look={id:e.pointerId,x:e.clientX,y:e.clientY}}
});
stage.addEventListener('pointermove',e=>{
 if(!active)return;
 if(mv&&e.pointerId===mv.id){const r=stage.getBoundingClientRect();let dx=e.clientX-r.left-mv.x,dy=e.clientY-r.top-mv.y;const l=Math.hypot(dx,dy),k=l>40?40/l:1;dx*=k;dy*=k;mv.dx=dx/40;mv.dy=dy/40;dot.style.transform=`translate(${dx}px,${dy}px)`;return}
 if(look&&e.pointerId===look.id){turn(e.clientX-look.x,e.clientY-look.y);look.x=e.clientX;look.y=e.clientY}
});
function up(e){if(mv&&e.pointerId===mv.id){mv=null;stick.style.display='none'}if(look&&e.pointerId===look.id)look=null}
stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',up);
function move(dt){const x0=pos.x,z0=pos.z;move0(dt);return Math.hypot(pos.x-x0,pos.z-z0)}
function move0(dt){
 let f=(keys.KeyW?1:0)-(keys.KeyS?1:0),s=(keys.KeyD?1:0)-(keys.KeyA?1:0);
 if(mv){f+=-mv.dy;s+=mv.dx}
 const l=Math.hypot(f,s);if(l<.05)return;if(l>1){f/=l;s/=l}
 const sp=(keys.ShiftLeft||keys.ShiftRight?5:2.7)*dt;
 pos.x+=(-Math.sin(yaw)*f+Math.cos(yaw)*s)*sp;pos.z+=(-Math.cos(yaw)*f-Math.sin(yaw)*s)*sp;
 for(let i=0;i<2;i++)for(const b of colliders){
  const x0=b.min.x-RAD,x1=b.max.x+RAD,z0=b.min.z-RAD,z1=b.max.z+RAD;
  if(pos.x>x0&&pos.x<x1&&pos.z>z0&&pos.z<z1){const dl=pos.x-x0,dr=x1-pos.x,dn=pos.z-z0,df=z1-pos.z,mn=Math.min(dl,dr,dn,df);
   if(mn===dl)pos.x=x0;else if(mn===dr)pos.x=x1;else if(mn===dn)pos.z=z0;else pos.z=z1}}
 pos.x=Math.max(R.x0+RAD,Math.min(R.x1-RAD,pos.x));pos.z=Math.max(R.z0+RAD,Math.min(R.z1-RAD,pos.z));
}
let t=0,bob=0;
(function tick(){requestAnimationFrame(tick);const _n=performance.now(),_e=_n-FPS.last;if(_e<15.6)return;FPS.last=_n-(_e%16.667);const dt=Math.min(clock.getDelta(),.05);t+=dt;
 if(mixer)mixer.update(dt);
 tcool-=dt;let moved=0;const px0=pos.x,pz0=pos.z;if(CIN.on){moved=cinStep(dt)}else if(active){moved=move(dt);if(hitTentacles()){pos.x=Math.max(R.x0+RAD,Math.min(R.x1-RAD,pos.x));pos.z=Math.max(R.z0+RAD,Math.min(R.z1-RAD,pos.z));if(tcool<=0){squelch();tcool=.7}}}
 {const am=aimMode();if(am){mo.x=hero.clientWidth/2;mo.y=hero.clientHeight/2;mo.has=true}hero.classList.toggle('aiming',am);hero.classList.toggle('aimhot',am&&!!(BT.hover||BK.hover))}
 texPump();bookUpdate(dt);bottleUpdate(dt,(pos.x-px0)/Math.max(dt,.001),(pos.z-pz0)/Math.max(dt,.001));sway+=((active?0:(reduce?0:.22))-sway)*Math.min(1,dt*3);
 const spd=dt>0?moved/dt:0,run=!!(keys.ShiftLeft||keys.ShiftRight);
 bobAmp+=(Math.min(1.5,spd/2.7)-bobAmp)*Math.min(1,dt*7);phase+=moved/(run?2.4:1.8)*Math.PI;
 const st=Math.floor(phase/Math.PI);if(st>lastStep){lastStep=st;if(active)footstep(run,st%2)}
 const bobY=(Math.abs(Math.sin(phase))*.13-.065)*bobAmp+Math.sin(t*1.25)*.014,roll=Math.sin(phase)*.011*bobAmp,swayY=Math.sin(phase)*.006*bobAmp;
 runK+=((run&&bobAmp>.3?1:0)-runK)*Math.min(1,dt*4);const nf=baseFov+runK*4;if(Math.abs(camera.fov-nf)>.01){camera.fov=nf;camera.updateProjectionMatrix()}
 camera.position.set(pos.x,EYE+bobY,pos.z);
 camera.rotation.set(pitch+Math.abs(Math.sin(phase))*.012*bobAmp,yaw+Math.sin(t*.25)*sway+swayY,roll);
 renderer.render(scene,camera)})();
})();

// ---- venom: viscous black liquid that seeps from under the button, drips, and stretches toward the cursor
(function(){
const hero=document.getElementById('hero'),cv=document.getElementById('venom'),ctx=cv.getContext('2d'),seal=document.getElementById('go');
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
let W=0,H=0,dpr=1,running=true;
function fit(){if(!running)return;dpr=Math.min(devicePixelRatio||1,1.5);W=hero.clientWidth;H=hero.clientHeight;cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr)}
addEventListener('resize',fit);fit();
const cur={x:0,y:0,on:false};
function setCur(e){const r=hero.getBoundingClientRect();cur.x=e.clientX-r.left;cur.y=e.clientY-r.top;cur.on=true}
addEventListener('pointermove',setCur,{passive:true});addEventListener('pointerdown',setCur,{passive:true});
addEventListener('pointerup',e=>{if(e.pointerType==='touch')setTimeout(()=>{cur.on=false},600)});
document.documentElement.addEventListener('mouseleave',()=>{cur.on=false});
const N=9,K=22,AR=[];
for(let i=0;i<N;i++)AR.push({a:(i+.5)/N*6.2832+(Math.random()-.5)*.25,ph:Math.random()*9,sp:.7+Math.random()*.7,c:0,pc:0,rest:30,p:null,f:0});
const drips=[],splats=[],drops=[];
let mx=0,my=0,ms=1,px=0,grip=0,t=0,last=0,fade=0,nextDrip=.8;
const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a};
function blob(x,y,r){ctx.fillStyle='#050608';ctx.beginPath();ctx.arc(x,y,r,0,6.2832);ctx.fill();
 ctx.fillStyle='rgba(170,195,215,.2)';ctx.beginPath();ctx.arc(x-r*.3,y-r*.36,r*.36,0,6.2832);ctx.fill()}
function tick(now){if(!running)return;requestAnimationFrame(tick);
 const dt=Math.min(.05,(now-last)/1000||.016),fr=Math.min(3,dt*60);last=now;
 if(hero.classList.contains('walking')){if(++fade>70){running=false;cv.width=cv.height=1;return}}else fade=0;
 t+=dt*.5;const A=reduce?.35:1;
 const hr=hero.getBoundingClientRect(),sr=seal.getBoundingClientRect();
 const bx=sr.left-hr.left+sr.width/2-mx,by=sr.top-hr.top+sr.height/2-my,bw=sr.width/ms,bh=sr.height/ms;
 const RCH=38,ex=Math.max(Math.abs(cur.x-bx)-bw/2,0),ey=Math.max(Math.abs(cur.y-by)-bh/2,0),de=Math.hypot(ex,ey),near=cur.on&&de<12;
 const pT=cur.on?Math.max(0,Math.min(1,1-de/RCH)):0;
 px+=(pT-px)*Math.min(1,dt*2.5);grip+=((near?1:0)-grip)*Math.min(1,dt*2.2);
 const k=px*px*(3-2*px),tx=cur.on?Math.max(-12,Math.min(12,(cur.x-bx)*.12*k)):0,ty=cur.on?Math.max(-8,Math.min(8,(cur.y-by)*.14*k)):0;
 mx+=(tx-mx)*Math.min(1,dt*4.5);my+=(ty-my)*Math.min(1,dt*4.5);ms+=((1+.05*k)-ms)*Math.min(1,dt*4);
 seal.style.transform=`translate3d(${mx.toFixed(2)}px,${my.toFixed(2)}px,0) scale(${ms.toFixed(3)})`;seal.style.setProperty('--h',k.toFixed(3));
 const cx=bx+mx,cy=by+my,rx=bw/2*.94,ry=bh/2*.86;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
 // 1. puddle breathing under the button: only its rim is visible, seeping out from beneath the frame
 for(let j=0;j<110;j++){const a=j/110*6.2832,wob=1+(.035*Math.sin(t*1.3+j*.31)+.03*Math.sin(t*2.1+j*.13))*A;
  blob(cx+Math.cos(a)*rx*.95*wob,cy+Math.sin(a)*ry*.9*wob,7.5+2.2*Math.sin(t*1.6+j*.5)*A)}
 // 2. liquid arms: which ones reach for the cursor
 const ang=Math.atan2(cur.y-cy,cur.x-cx);
 const order=AR.map(h=>{h.f=cur.on?Math.cos(wrap(h.a-ang)):-1;return h}).slice().sort((p,q)=>q.f-p.f);
 const nc=cur.on?Math.min(N,Math.round(px*6+grip*3)):0;
 order.forEach((h,i)=>{const want=(i<nc&&h.f>-.3)?1:0;h.pc=h.c;h.c+=(want-h.c)*Math.min(1,dt*(want?2.4:1.4))});
 let live=0;
 for(let i=0;i<N;i++){const h=AR[i],ca=Math.cos(h.a),sa=Math.sin(h.a),ax=cx+ca*rx*.45,ay=cy+sa*ry*.4;   // source hidden under the button
  const pulse=5+5*Math.sin(t*h.sp+h.ph)*A,ix=cx+ca*(rx+pulse),iy=cy+sa*(ry+pulse)+2;
  const jit=3*(1-grip),kx=cur.x+Math.cos(h.ph+t*(grip?14:2))*jit,ky=cur.y+Math.sin(h.ph+t*(grip?14:2))*jit;
  const tgx=ix+(kx-ix)*h.c,tgy=iy+(ky-iy)*h.c;
  const idleL=Math.hypot(ix-ax,iy-ay)*1.08,Dt=Math.hypot(kx-ax,ky-ay),restT=idleL+((Dt*1.06+4*Math.sin(t*6+h.ph))-idleL)*h.c;
  h.rest+=(restT-h.rest)*Math.min(1,dt*3);
  const seg=h.rest/(K-1);
  if(!h.p){h.p=[];for(let q=0;q<K;q++){const u=q/(K-1),x=ax+(ix-ax)*u,y=ay+(iy-ay)*u;h.p.push({x,y,ox:x,oy:y})}}
  const P=h.p,g=.035*(1-.9*h.c)*fr*fr;
  for(let q=1;q<K-1;q++){const o=P[q],vx=(o.x-o.ox)*.94,vy=(o.y-o.oy)*.94;o.ox=o.x;o.oy=o.y;o.x+=vx;o.y+=vy+g}
  const tipx=P[K-1].x+(tgx-P[K-1].x)*Math.min(1,.08*fr),tipy=P[K-1].y+(tgy-P[K-1].y)*Math.min(1,.08*fr);
  for(let it=0;it<6;it++){P[0].x=ax;P[0].y=ay;P[K-1].x=tipx;P[K-1].y=tipy;
   for(let q=0;q<K-1;q++){const a=P[q],b=P[q+1];const dx=b.x-a.x,dy=b.y-a.y,dd=Math.hypot(dx,dy)||1,df=(dd-seg)/dd*.5;
    if(q===0){b.x-=dx*df*2;b.y-=dy*df*2}else if(q===K-2){a.x+=dx*df*2;a.y+=dy*df*2}else{a.x+=dx*df;a.y+=dy*df;b.x-=dx*df;b.y-=dy*df}}}
  P[K-1].x=tipx;P[K-1].y=tipy;
  // flick off droplets when a stretched arm lets go
  if(h.pc>.6&&h.c<=.6&&!reduce)for(let j=0;j<3;j++)drops.push({x:P[K-1].x,y:P[K-1].y,vx:(P[K-1].x-P[K-3].x)*30*Math.random()+(Math.random()-.5)*120,vy:(P[K-1].y-P[K-3].y)*30*Math.random()-60*Math.random(),r:2+Math.random()*2.2,life:.9});
  // draw: thick at the hidden source, pinching thin as it stretches, bulges flowing toward the tip
  let Ltot=0;for(let q=0;q<K-1;q++)Ltot+=Math.hypot(P[q+1].x-P[q].x,P[q+1].y-P[q].y);
  const thin=1/(1+Ltot/300),flow=.3+.7*h.c;
  for(let q=0;q<K-1;q++){const a=P[q],b=P[q+1],len=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(len/2.6));
   for(let s=0;s<n;s++){const u=(q+s/n)/(K-1),x=a.x+(b.x-a.x)*s/n,y=a.y+(b.y-a.y)*s/n;
    const w=Math.max(0,Math.sin(u*15-t*7*flow+h.ph));
    blob(x,y,Math.max(2.3,(2.4+6.5*Math.pow(1-u,2.2))*(.3+.7*thin))+w*w*w*w*(.9+3.2*h.c)*A)}}
  blob(P[K-1].x,P[K-1].y,3.6+3.2*h.c+.8*Math.sin(t*9+h.ph)*h.c);
  if(h.c>.5)live++}
 // 3. drips that swell under the button, stretch, fall and splash on the floor
 nextDrip-=dt;if(nextDrip<=0&&drips.length<5&&!reduce){drips.push({x:cx+(Math.random()*2-1)*bw*.36,y0:cy+bh*.44,fy:H-8,cut:false,len:0,vy:0,age:0,fall:false,r:1.5});nextDrip=2.2+Math.random()*3}
 for(let i=drips.length-1;i>=0;i--){const q=drips[i];q.age+=dt*.6;
  if(!q.fall){q.r=1.5+Math.min(1,q.age/1.5)*2.9;q.len=Math.pow(Math.min(1,q.age/1.5),2)*15;
   blob(q.x,q.y0,5);for(let yy=0;yy<q.len;yy+=2.4)blob(q.x,q.y0+yy,Math.max(2.3,4.4-yy*.12));blob(q.x,q.y0+q.len,q.r);if(q.age>1.5){q.fall=true;q.y=q.y0+q.len}}
  else{q.vy+=650*dt;q.y+=q.vy*dt*.8;const st=q.y-q.y0;
   if(st<210){for(let yy=q.y0;yy<q.y-q.r*.5;yy+=2.6){const u=(yy-q.y0)/Math.max(1,st);blob(q.x,yy,Math.max(2.1,(4.6*(1-u)+2.2*u)*(1-st/300)))}}   // liquid string still joined to the button
   else{if(!q.cut){q.cut=true;for(let j=0;j<2;j++)drops.push({x:q.x,y:q.y0+20,vx:(Math.random()-.5)*40,vy:-30-Math.random()*40,r:2.2,life:.7})}
    const tr=Math.min(38,q.vy*.07);for(let yy=0;yy<tr;yy+=2.4)blob(q.x,q.y-yy,Math.max(1.9,q.r*(1-yy/tr)*.85))}
   blob(q.x,q.y,q.r);
   if(q.y>=q.fy){splats.push({x:q.x,y:q.fy,age:0});for(let j=0;j<3;j++)drops.push({x:q.x,y:q.fy,vx:(Math.random()-.5)*180,vy:-120-Math.random()*130,r:1.6+Math.random()*1.4,life:.6});drips.splice(i,1)}}}
 for(let i=splats.length-1;i>=0;i--){const s=splats[i];s.age+=dt*.6;const rad=(3+9*(1-Math.exp(-s.age*7)))*Math.pow(Math.max(0,1-s.age/2.4),.6);
  if(rad<.8){splats.splice(i,1);continue}ctx.save();ctx.translate(s.x,s.y);ctx.scale(1,.38);blob(0,0,rad);ctx.restore()}
 for(let i=drops.length-1;i>=0;i--){const o=drops[i];o.life-=dt;o.vy+=600*dt;o.x+=o.vx*dt*.7;o.y+=o.vy*dt*.7;if(o.life<=0){drops.splice(i,1);continue}blob(o.x,o.y,o.r*Math.min(1,o.life*3))}
 // 4. the cursor, caught in the liquid
 if(cur.on&&live>0){const r=3.6+px*4+grip*2.5;blob(cur.x,cur.y,r*(1+.1*Math.sin(t*11)));
  if(grip>.3)for(let j=0;j<3;j++){const a=t*3+j*2.094;blob(cur.x+Math.cos(a)*(r+5),cur.y+Math.sin(a)*(r+5),2.3)}}
}
window.__venomWake=()=>{if(running)return;running=true;fit();fade=0;last=0;requestAnimationFrame(tick)};
requestAnimationFrame(tick);
})();
