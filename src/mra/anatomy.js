/* Reusable arterial anatomy. Add a row or region without changing the UI or generator. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MRAAnatomy=api})(globalThis,function(){
'use strict';
const regions=[
 ['brain','Intrakranielle Arterien'],['neck','Extrakranielle Halsarterien'],['thorax','Thorakale Aorta'],['abdomen','Abdominelle Aorta'],['visceral','Viszeralarterien'],['renal','Nierenarterien'],['pelvis','Beckenarterien'],['thigh','Oberschenkelarterien'],['calf','Unterschenkelarterien'],['foot','Fußarterien'],['arm-r','Obere Extremität rechts'],['arm-l','Obere Extremität links']
].map(([id,label],order)=>({id,label,order}));
const vessels=[];
function add(id,name,regionIds,paired=true,options={}){
 const sides=paired?['r','l']:['mid'];
 for(const side of sides){let memberships=regionIds.filter(r=>!r.startsWith('arm-')||r==='arm-'+side);if(!memberships.length)continue;
 const sideText=side==='r'?'rechts':side==='l'?'links':'';
 vessels.push({id:id+'-'+side,baseId:id,name,side,sideText,regions:memberships,order:vessels.length,genitive:options.genitive||'der '+name,...options});}
}
add('ica-intra','A. carotis interna, intrakranieller Abschnitt',['brain'],true,{genitive:'des intrakraniellen Abschnitts der A. carotis interna'});
for(const seg of ['A1','A2'])add('aca-'+seg.toLowerCase(),'A. cerebri anterior ('+seg+')',['brain'],true,{genitive:'des '+seg+'-Segments der A. cerebri anterior'});
add('acom','A. communicans anterior',['brain'],false);
for(const seg of ['M1','M2'])add('mca-'+seg.toLowerCase(),'A. cerebri media ('+seg+')',['brain'],true,{genitive:'des '+seg+'-Segments der A. cerebri media'});
for(const seg of ['P1','P2'])add('pca-'+seg.toLowerCase(),'A. cerebri posterior ('+seg+')',['brain'],true,{genitive:'des '+seg+'-Segments der A. cerebri posterior'});
add('pcom','A. communicans posterior',['brain']);add('va-v4','A. vertebralis (V4)',['brain'],true,{genitive:'des V4-Segments der A. vertebralis'});
add('basilar','A. basilaris',['brain'],false);
for(const [id,name] of [['pica','A. cerebelli inferior posterior (PICA)'],['aica','A. cerebelli inferior anterior (AICA)'],['sca','A. cerebelli superior (SCA)'],['ophthalmic','A. ophthalmica']])add(id,name,['brain'],true,{optional:true});
add('cca','A. carotis communis',['neck']);add('bifurcation','Karotisbifurkation',['neck']);add('ica-extra','A. carotis interna, extrakranieller Abschnitt',['neck'],true,{genitive:'des extrakraniellen Abschnitts der A. carotis interna'});add('eca','A. carotis externa',['neck']);
for(const seg of ['V1','V2','V3'])add('va-'+seg.toLowerCase(),'A. vertebralis ('+seg+')',['neck'],true,{genitive:'des '+seg+'-Segments der A. vertebralis'});
add('brachiocephalic','Truncus brachiocephalicus',['neck','thorax'],false,{genitive:'des Truncus brachiocephalicus'});
add('subclavian','A. subclavia',['neck','arm-r','arm-l']);
add('aortic-root','Aortenwurzel',['thorax'],false,{optional:true});add('aorta-ascending','Aorta ascendens',['thorax'],false);add('aortic-arch','Aortenbogen',['thorax'],false,{genitive:'des Aortenbogens'});add('aorta-descending','Aorta descendens',['thorax'],false);
add('origin-cca-left','Abgang der A. carotis communis links',['thorax'],false,{genitive:'des Abgangs der A. carotis communis links'});add('origin-subclavian-left','Abgang der A. subclavia links',['thorax'],false,{genitive:'des Abgangs der A. subclavia links'});
add('aorta-abdominal','Aorta abdominalis',['abdomen'],false);
add('coeliac','Truncus coeliacus',['visceral'],false,{genitive:'des Truncus coeliacus'});add('hepatic','A. hepatica communis',['visceral'],false);add('splenic','A. splenica',['visceral'],false);add('sma','A. mesenterica superior',['visceral'],false);add('ima','A. mesenterica inferior',['visceral'],false);
add('renal','A. renalis',['renal']);add('renal-accessory','Akzessorische Nierenarterie',['renal'],true,{optional:true,genitive:'der akzessorischen Nierenarterie'});
for(const [id,name] of [['iliac-common','A. iliaca communis'],['iliac-internal','A. iliaca interna'],['iliac-external','A. iliaca externa']])add(id,name,['pelvis']);
for(const [id,name] of [['femoral-common','A. femoralis communis'],['profunda','A. profunda femoris'],['femoral-superficial','A. femoralis superficialis'],['popliteal','A. poplitea']])add(id,name,['thigh']);
for(const [id,name] of [['tibioperoneal','Truncus tibiofibularis'],['tibial-anterior','A. tibialis anterior'],['tibial-posterior','A. tibialis posterior'],['fibular','A. fibularis']])add(id,name,['calf'],true,{genitive:(id==='tibioperoneal'?'des ':'der ')+name});
for(const [id,name] of [['dorsalis-pedis','A. dorsalis pedis'],['plantar-medial','A. plantaris medialis'],['plantar-lateral','A. plantaris lateralis'],['plantar-arch','Arcus plantaris']])add(id,name,['foot'],true,{genitive:(id==='plantar-arch'?'des ':'der ')+name});
for(const [id,name] of [['axillary','A. axillaris'],['brachial','A. brachialis'],['radial','A. radialis'],['ulnar','A. ulnaris'],['palmar-arch','Arcus palmaris']])add(id,name,['arm-r','arm-l'],true,{genitive:(id==='palmar-arch'?'des ':'der ')+name});
const byId=Object.fromEntries(vessels.map(v=>[v.id,v]));
function selectedVessels(selected){const set=new Set(selected);return vessels.filter(v=>v.regions.some(r=>set.has(r)))}
function groups(selected){const assigned=new Set(),bothArms=selected.includes('arm-r')&&selected.includes('arm-l');return regions.filter(r=>selected.includes(r.id)&&!(bothArms&&r.id==='arm-l')).map(r=>{const scope=bothArms&&r.id==='arm-r'?['arm-r','arm-l']:[r.id];const region={...r,scope,label:scope.length===2?'Obere Extremitäten rechts und links':r.label};return {region,vessels:vessels.filter(v=>v.regions.some(id=>scope.includes(id))&&!assigned.has(v.id)).map(v=>{assigned.add(v.id);return v})}})}
function label(v){return v.name+(v.sideText?' '+v.sideText:'')}
function genitive(v){return v.genitive+(v.sideText?' '+v.sideText:'')}
return {regions,vessels,byId,selectedVessels,groups,label,genitive};
});
