(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BuilderText=api})(globalThis,function(){'use strict';
 const side=value=>({right:'rechts',left:'links',bilateral:'beidseits'}[value]||'');
 const adjective=(value,gender='f')=>({mild:{f:'Geringgradige',n:'Geringgradiges',m:'Geringgradiger',adv:'geringgradig'},moderate:{f:'Mittelgradige',n:'Mittelgradiges',m:'Mittelgradiger',adv:'mittelgradig'},severe:{f:'Ausgeprägte',n:'Ausgeprägtes',m:'Ausgeprägter',adv:'ausgeprägt'}}[value]?.[gender]||'');
 const join=values=>values.filter(Boolean).join(' ');
 const enumeration=values=>{const list=[...new Set(values.filter(Boolean))];return list.length<2?list.join(''):list.slice(0,-1).join(', ')+' und '+list.at(-1)};
 const sentence=value=>value?value.trim().replace(/[.\s]+$/,'')+'.':'';
 const lower=value=>value?value[0].toLowerCase()+value.slice(1):'';
 const mm=value=>String(value).replace('.',',');
 function course(text,value,comparison){if(!text||!comparison.enabled||!value)return text;const words={new:'Neu aufgetreten',stable:'Im Vergleich unverändert',decreased:'Im Vergleich regredient',increased:'Im Vergleich progredient',resolved:'Nicht mehr nachweisbar'};return (words[value]||'Im Vergleich')+': '+text}
 function record(text,category,extra={}){return {text:sentence(text),category,priority:30,normal:false,...extra}}
 return {side,adjective,join,enumeration,sentence,lower,mm,course,record};
});
