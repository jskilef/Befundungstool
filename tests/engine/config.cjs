const assert=require('assert/strict'),C=require('../../src/settings/config.js');
const settings={language:'de',theme:'dark',builder:'chest',selectedTemplate:'custom-t',saveDraft:false,macrosOpen:false,shortcutsOpen:true,settingsOpen:true,chestStyle:'detailed',chestAuto:false};
const macro={title:'Rechts',code:'re',text:'rechts',trigger:'space',category:'general',favorite:true};
const template={id:'custom-t',name:'Eigene Vorlage',fields:[{id:'custom-f',label:'Befund',defaultText:'Standard'}]};
const favorite={id:'fav-1',name:'Beispiel',snapshot:{findings:{},customMacroCodes:['re']}};
const backup={format:C.format,version:C.version,macros:[macro],templates:[template],chestFavorites:[favorite],settings};
const empty={macros:[],templates:[],chestFavorites:[],settings:{...settings,selectedTemplate:'structured'}};
let id=0;const nextId=()=>'custom-import-'+(++id);
const parsed=C.parse(JSON.parse(JSON.stringify(backup)));const merged=C.merge(empty,parsed,nextId);
assert.deepEqual(merged,{macros:[macro],templates:[template],chestFavorites:[favorite],settings});
assert.deepEqual(C.merge(merged,parsed,nextId),merged,'Identical imports must be idempotent');
const changed=structuredClone(backup);changed.templates[0].fields[0].defaultText='Neue Fassung';changed.chestFavorites[0].name='Andere Fassung';
const conflict=C.merge(merged,C.parse(changed),nextId);assert.equal(conflict.templates.length,2);assert.equal(conflict.templates[0].fields[0].defaultText,'Standard');assert.equal(conflict.templates[1].fields[0].defaultText,'Neue Fassung');assert.notEqual(conflict.templates[1].fields[0].id,'custom-f');assert.equal(conflict.settings.selectedTemplate,conflict.templates[1].id);assert.equal(conflict.chestFavorites.length,2);
for(const legacy of [[{title:'Alt',code:'.alt',text:'Text'}],{version:1,macros:[{title:'Alt',code:'.alt',text:'Text'}]},{version:2,macros:[macro]}])assert.equal(C.parse(legacy).kind,'macros');
for(const alter of [b=>b.version=99,b=>b.format='unknown',b=>b.macros.push(macro),b=>b.macros[0].trigger='invalid',b=>b.templates[0].fields[0].id='findings',b=>b.templates[0].fields.push({...b.templates[0].fields[0]}),b=>b.templates[0].id='constructor',b=>b.settings.theme='purple',b=>b.settings.settingsOpen='yes',b=>b.settings.selectedTemplate='custom-missing',b=>b.chestFavorites.push(favorite),b=>b.chestFavorites[0].snapshot=null,b=>delete b.format]){const bad=structuredClone(backup);alter(bad);assert.throws(()=>C.parse(bad))}
const cross={...structuredClone(backup),templates:[{id:'custom-f',name:'Überlappung',fields:[{id:'custom-other',label:'Text',defaultText:''}]}],settings:{...settings,selectedTemplate:'custom-f'}};
const crossMerge=C.merge(merged,C.parse(cross),nextId);assert(C.validTemplates(crossMerge.templates));assert.notEqual(crossMerge.settings.selectedTemplate,'custom-f');
const limits={...empty,macros:Array.from({length:1000},(_,i)=>({...macro,code:'m'+i}))};assert.throws(()=>C.merge(limits,C.parse([{...macro,code:'one-more'}]),nextId));
assert.deepEqual(backup.templates,[template]);console.log('Konfiguration: Rundlauf, alte Makrodateien, Konfliktkopien, eindeutige IDs, Schema- und Grenzwertprüfung bestanden.');
