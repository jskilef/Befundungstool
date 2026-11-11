/* Personal reusable presets only. Patient report state is persisted by Radnote. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./state.js'):root.ChestState);if(typeof module==='object'&&module.exports)module.exports=api;else root.ChestPersistence=api})(globalThis,function(S){'use strict';
const key='radnote-chest-favorites-v1';
function snapshot(state){const s=S.sanitize(state);for(const f of Object.values(s.findings)){f.course='';f.featureCourses={};for(const x of [...(f.lesions||[]),...(f.fractures||[]),...(f.items||[])])x.course='';for(const group of [f.effusions,f.pneumothoraces])if(group)for(const x of Object.values(group))x.course=''}return {findings:s.findings,customMacroCodes:s.customMacroCodes}}
function load(storage){try{const raw=JSON.parse(storage.getItem(key));if(!Array.isArray(raw))return [];return raw.filter(f=>f&&typeof f.id==='string'&&typeof f.name==='string'&&f.name.trim()&&f.name.length<=80&&f.snapshot).slice(0,100).map(f=>({id:f.id.slice(0,100),name:f.name,snapshot:snapshot({...S.empty(),...f.snapshot})}))}catch(e){return []}}
function save(storage,favorites){try{storage.setItem(key,JSON.stringify(favorites));return true}catch(e){return false}}
function apply(state,favorite){const s=S.clone(state),snap=snapshot({...S.empty(),...favorite.snapshot});s.findings=snap.findings;s.customMacroCodes=snap.customMacroCodes;s.interpretations=[];return s}
return {key,snapshot,load,save,apply};
});
