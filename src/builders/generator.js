(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./registry.js'):root.ExaminationRegistry,node?require('./state.js'):root.BuilderState,node?require('./validation.js'):root.BuilderValidation,node?require('./text.js'):root.BuilderText,node?require('./preview.js'):root.ExamPreview,node?{head:require('./head-generator.js'),skeleton:require('./skeleton-generator.js'),esophagram:require('./esophagram-generator.js')}:{head:root.HeadCTGenerator,skeleton:root.SkeletonGenerator,esophagram:root.EsophagramGenerator});if(node)module.exports=api;else root.ReportGenerator=api})(globalThis,function(R,S,V,T,P,generators){'use strict';
 function generate(id,raw){const s=S.sanitize(id,raw),d=R.get(id);
  // Resolve inherited courses before clinical conflict checks and derived findings.
  for(const c of d.categories)for(const field of c.fields)if(field.type==='list'&&Array.isArray(s.findings[c.id][field.key]))for(const item of s.findings[c.id][field.key])if('course' in item)item.course=item.course||s.findings[c.id].course;
  const check=V.validate(id,s);let records=generators[id].generate(s).filter(r=>r.text&&(!d.categories.find(c=>c.id===r.category)?.when||d.categories.find(c=>c.id===r.category).when(s)));
  records=records.map(r=>({...r,course:r.course||s.findings[r.category]?.course||''}));
  records=records.map(r=>({...r,text:T.course(r.text,r.course,s.comparison),impression:r.impression?T.course(T.sentence(r.impression),r.course,s.comparison):'',priority:r.course==='resolved'?80:r.priority}));
  // Acute findings precede incidental findings; selected mode orders equal priorities.
  const order=d.orders?.[s.mode]||[];records.sort((a,b)=>a.context?-1:b.context?1:a.priority-b.priority||(order.indexOf(a.category)<0?99:order.indexOf(a.category))-(order.indexOf(b.category)<0?99:order.indexOf(b.category)));
  const pathological=records.filter(r=>!r.normal&&!r.limited&&!r.context),hasPathology=pathological.length>0;
  const necessary={head:['hemorrhage','skull','ischemia'],skeleton:['fractures','alignment'],esophagram:['extravasation']}[id];
  if(s.style==='short'&&hasPathology)records=records.filter(r=>!r.normal||necessary.includes(r.category));
  const parts=[];
  if(s.comparison.enabled){parts.push(s.comparison.date?'Vergleich mit der Voruntersuchung vom '+s.comparison.date.split('-').reverse().join('.')+'.':'Vergleich mit der Voruntersuchung.')}
  if(id==='skeleton'&&records.length){const region=d.selectedRegion(s);parts.push(T.join(['Untersuchungsregion:',region?.label,T.side(s.context.side)])+'.')}
  if(id==='head'&&s.context.quality&&s.context.quality!=='normal')parts.push({motion:'Beurteilbarkeit durch Bewegungsartefakte eingeschränkt.',metal:'Beurteilbarkeit durch Metallartefakte eingeschränkt.',limited:'Eingeschränkte Beurteilbarkeit der Untersuchung.'}[s.context.quality]);
  if(id!=='head'&&s.context.quality==='limited')parts.push('Eingeschränkte Beurteilbarkeit'+(s.context.limitation?' durch '+s.context.limitation:'')+'.');
  if(s.context.includeTechnique){if(id==='skeleton'){const projections=S.options(d.context.find(f=>f.key==='projections'),s);const labels=s.context.projections.map(v=>projections.find(o=>o[0]===v)?.[1]);if(labels.length)parts.push('Röntgenuntersuchung: '+T.enumeration(labels)+(s.context.projectionText?' ('+s.context.projectionText+')':'')+'.')}if(id==='esophagram'){const c=s.context,tech=[{iodine:'mit wasserlöslichem iodhaltigem Kontrastmittel',barium:'mit Bariumsulfat'}[c.contrast],c.position.length?'in '+T.enumeration(c.position.map(v=>({standing:'stehender',seated:'sitzender',supine:'liegender',oblique:'schräger'}[v])))+' Position':''];const acquisitions=c.acquisition.map(v=>({dynamic:'dynamische Durchleuchtung',single:'Einzelaufnahmen',delayed:'zeitverzögerte Aufnahmen'}[v]));if(tech.some(Boolean)||acquisitions.length)parts.push(T.sentence(T.join(['Ösophaguspassage',...tech])+(acquisitions.length?'; '+T.enumeration(acquisitions):'')))}}
  const unique=[...new Set(records.map(r=>s.style==='detailed'&&!r.context?(d.categories.find(c=>c.id===r.category)?.label||'')+': '+r.text:r.text))];parts.push(...unique);
  let impression=[...new Set(records.filter(r=>!r.context&&(!r.normal||id==='esophagram'&&['poem','z_poem','fundoplication','esophagectomy','postop'].includes(s.mode)&&r.category==='extravasation')).map(r=>r.impression||(r.limited||r.normal?r.text:'')).filter(Boolean))];
  const allNormal=keys=>keys.every(key=>s.findings[key].status==='normal');
  if(!impression.length&&records.length){
   const complete=id==='head'?allNormal(['parenchyma','hemorrhage','ischemia','csf','mass','skull']):id==='esophagram'?allNormal(['morphology','motility','stenosis','diverticula','reflux']):false;
   if(!hasPathology&&complete&&!check.errors.length&&(!s.context.quality||s.context.quality==='normal'))impression=[id==='head'?'Kein Nachweis einer akuten intrakraniellen Pathologie'+(s.context.examination==='contrast'?' im kontrastmittelgestützten CT.':s.context.examination==='native'?' im nativen CT.':' im CT.'):'Unauffällige Ösophaguspassage.'];
   else if(!hasPathology&&records.some(r=>r.normal))impression=['Kein pathologischer Befund in den beurteilten Strukturen.'];
   else impression=pathological.slice(0,4).map(r=>r.text);
  }
  if(id==='head'&&s.mode==='stroke'&&records.some(r=>r.category==='hemorrhage'&&r.normal)&&hasPathology)impression.push('Keine intrakranielle Blutung.');
  if(id==='head'&&(s.findings.ischemia.status==='normal'||s.mode==='stroke'&&records.length)&&s.context.examination!=='contrast')impression.push(s.context.examination==='native'?'Eine frühe zerebrale Ischämie ist im nativen CT nicht sicher auszuschließen.':'Eine frühe zerebrale Ischämie ist CT-morphologisch nicht sicher auszuschließen.');
  if(s.context.quality&&s.context.quality!=='normal'&&records.length)impression.push('Beurteilbarkeit der Untersuchung eingeschränkt.');
  return {befund:parts.join(' '),beurteilung:d.reportStructure==='separate'?impression.join(' '):'',reportStructure:d.reportStructure,...check,assessed:d.categories.filter(c=>s.findings[c.id].status!=='pending').length,records};
 }
 function syncPreview(id,raw){const s=S.sanitize(id,raw),g=generate(id,s),p=s.preview,next=P.sync({befund:p.befund,beurteilung:p.beurteilung},{befund:p.lastBefund,beurteilung:p.lastBeurteilung},{befund:g.befund,beurteilung:g.beurteilung},p.auto);Object.assign(p,next.current,{lastBefund:next.baseline.befund,lastBeurteilung:next.baseline.beurteilung,pending:next.pending});return s}
 function regenerate(id,raw){const s=S.sanitize(id,raw),g=generate(id,s),p=s.preview;p.backup={befund:p.befund,beurteilung:p.beurteilung};Object.assign(p,{befund:g.befund,beurteilung:g.beurteilung,lastBefund:g.befund,lastBeurteilung:g.beurteilung,pending:false});return s}
 return {generate,syncPreview,regenerate};
});
