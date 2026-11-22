// the gauntlet only animates when you click: still hand normally, glowing hand while pressed (and for a beat after)
(function(){let t=0;const cl=document.body.classList;
 addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;clearTimeout(t);cl.add('press')},true);
 const up=()=>{clearTimeout(t);t=setTimeout(()=>cl.remove('press'),180)};
 addEventListener('pointerup',up,true);addEventListener('pointercancel',up,true);addEventListener('blur',up);
})();
