(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?[require('./head-definition.js'),require('./skeleton-definition.js'),require('./esophagram-definition.js')]:[root.HeadCTDefinition,root.SkeletonDefinition,root.EsophagramDefinition]);if(node)module.exports=api;else root.ExaminationRegistry=api})(globalThis,function(definitions){'use strict';
 const entries=Object.fromEntries(definitions.map(d=>[d.id,d]));
 const builders=[{id:'chest',title:'Röntgen-Thorax',reportStructure:'combined'},{id:'mra',title:'MR-Angiographie',reportStructure:'separate'},...definitions.map(d=>({id:d.id,title:d.title,reportStructure:d.reportStructure}))];
 return {builders,ids:definitions.map(d=>d.id),definitions,get:id=>{if(!Object.hasOwn(entries,id))throw Error('Unknown examination');return entries[id]}};
});
