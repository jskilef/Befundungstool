/* Versioned personal configuration. Report drafts are deliberately separate. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('../builders/persistence.js'):root.BuilderPersistence);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadnoteConfig=api})(globalThis,function(P){'use strict';
const format='radnote-settings',version=2,builtins=['structured','chest','skeletal','combined','freestyle'];
const clone=value=>JSON.parse(JSON.stringify(value));
function validMacro(m){return !!(m&&(m.category==null||(typeof m.category==='string'&&m.category.length<=100))&&(m.favorite==null||typeof m.favorite==='boolean')&&typeof m.title==='string'&&m.title.trim()&&m.title.length<=80&&typeof m.code==='string'&&m.code.length<=80&&['tab','space'].includes(m.trigger||'tab')&&((m.trigger||'tab')==='space'?/^[\p{L}\p{N}_-]+$/u:/^\.[A-Za-z0-9_-]+$/).test(m.code)&&typeof m.text==='string'&&m.text.trim()&&m.text.length<=100000)}
function validTemplates(data){const keys=new Set();return Array.isArray(data)&&data.length<=100&&data.every(t=>{if(!t||typeof t.id!=='string'||!/^custom-[a-z0-9-]+$/i.test(t.id)||keys.has(t.id)||typeof t.name!=='string'||!t.name.trim()||t.name.length>80||!Array.isArray(t.fields)||!t.fields.length||t.fields.length>30)return false;keys.add(t.id);return t.fields.every(f=>{if(!f||typeof f.id!=='string'||!/^custom-[a-z0-9-]+$/i.test(f.id)||keys.has(f.id)||typeof f.label!=='string'||!f.label.trim()||f.label.length>80||typeof f.defaultText!=='string'||f.defaultText.length>100000)return false;keys.add(f.id);return true})})}
function validSettings(s){return !!(s&&['de','en'].includes(s.language)&&['auto','light','dark'].includes(s.theme)&&['none','chest','mra','head','skeleton','esophagram'].includes(s.builder)&&typeof s.selectedTemplate==='string'&&typeof s.saveDraft==='boolean'&&typeof s.macrosOpen==='boolean'&&typeof s.shortcutsOpen==='boolean'&&(s.settingsOpen===undefined||typeof s.settingsOpen==='boolean')&&['short','standard','detailed'].includes(s.chestStyle)&&typeof s.chestAuto==='boolean'&&(s.builderPreferences===undefined||s.builderPreferences&&typeof s.builderPreferences==='object'&&!Array.isArray(s.builderPreferences)&&Object.entries(s.builderPreferences).every(([id,p])=>['head','skeleton','esophagram'].includes(id)&&p&&['short','standard','detailed'].includes(p.style)&&typeof p.auto==='boolean')))}
function validFavorites(list){return Array.isArray(list)&&list.length<=100&&new Set(list.map(f=>f?.id)).size===list.length&&list.every(f=>f&&typeof f.id==='string'&&f.id.length>0&&f.id.length<=100&&typeof f.name==='string'&&f.name.trim()&&f.name.length<=80&&f.snapshot&&typeof f.snapshot.findings==='object'&&f.snapshot.findings!==null&&!Array.isArray(f.snapshot.findings)&&Array.isArray(f.snapshot.customMacroCodes)&&f.snapshot.customMacroCodes.length<=100&&f.snapshot.customMacroCodes.every(c=>typeof c==='string'&&c.length<=80))}
function parse(data){
 const full=data?.format===format;
 if(data?.format&&!full)throw Error('Invalid configuration file');
 if(full&&![1,version].includes(data.version))throw Error('Unsupported configuration version');
 const raw=Array.isArray(data)?data:data?.macros;
 if(!Array.isArray(raw)||raw.length>1000||!raw.every(validMacro)||new Set(raw.map(m=>m.code)).size!==raw.length)throw Error('Invalid configuration file');
 const macros=raw.map(m=>({title:m.title,code:m.code,text:m.text,trigger:m.trigger||'tab',category:m.category||'general',favorite:m.favorite===true}));
 if(!full){if(data?.templates!==undefined||data?.settings!==undefined||data?.chestFavorites!==undefined)throw Error('Invalid configuration file');return {kind:'macros',macros}};
 if(data.builderFavorites!==undefined&&!P.valid(data.builderFavorites)||!validTemplates(data.templates)||!validSettings(data.settings)||!validFavorites(data.chestFavorites)||!builtins.concat(data.templates.map(t=>t.id)).includes(data.settings.selectedTemplate))throw Error('Invalid configuration file');
 return {kind:'settings',macros,templates:data.templates.map(t=>({id:t.id,name:t.name,fields:t.fields.map(f=>({id:f.id,label:f.label,defaultText:f.defaultText}))})),chestFavorites:clone(data.chestFavorites),...(data.builderFavorites!==undefined?{builderFavorites:clone(data.builderFavorites)}:{}),settings:clone(data.settings)};
}
function merge(current,incoming,newId){
 const macros=[...new Map([...current.macros,...incoming.macros].map(m=>[m.code,clone(m)])).values()];
 if(macros.length>1000)throw Error('Configuration limit exceeded');
 if(incoming.kind==='macros')return {...current,macros};
 const templates=clone(current.templates),keys=new Set(templates.flatMap(t=>[t.id,...t.fields.map(f=>f.id)])),mapping=new Map();
 function unused(){let id;do{id=newId()}while(keys.has(id));keys.add(id);return id}
 for(const raw of incoming.templates){let t=clone(raw);const same=templates.find(x=>x.id===t.id&&JSON.stringify(x)===JSON.stringify(t));if(same){mapping.set(raw.id,same.id);continue}
  if([t.id,...t.fields.map(f=>f.id)].some(id=>keys.has(id))){t.id=unused();t.fields.forEach(f=>f.id=unused())}else [t.id,...t.fields.map(f=>f.id)].forEach(id=>keys.add(id));
  const name=t.name;let suffix=1;while(templates.some(x=>x.name.toLowerCase()===t.name.toLowerCase()))t.name=name.slice(0,65)+' (Import '+(++suffix)+')';
  mapping.set(raw.id,t.id);templates.push(t);
 }
 const chestFavorites=clone(current.chestFavorites);
 for(const raw of incoming.chestFavorites){const same=chestFavorites.find(f=>f.id===raw.id);if(same&&JSON.stringify(same)===JSON.stringify(raw))continue;const f=clone(raw);if(same){do{f.id=newId()}while(chestFavorites.some(x=>x.id===f.id))}chestFavorites.push(f)}
 if(!validTemplates(templates)||!validFavorites(chestFavorites))throw Error('Configuration limit exceeded');
 return {macros,templates,chestFavorites,...(current.builderFavorites||incoming.builderFavorites?{builderFavorites:P.merge(current.builderFavorites,incoming.builderFavorites,newId)}:{}),settings:{...incoming.settings,selectedTemplate:mapping.get(incoming.settings.selectedTemplate)||incoming.settings.selectedTemplate}};
}
return {format,version,builtins,validMacro,validTemplates,validSettings,parse,merge};
});
