/* Shared by the existing Thorax/MRA modules and the three new examinations. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExamPreview=api})(globalThis,function(){'use strict';
 function sync(current,baseline,generated,auto=true){const keys=Object.keys(generated),edited=keys.some(key=>current[key]!==baseline[key]),changed=keys.some(key=>generated[key]!==baseline[key]);if(edited||auto===false)return {current:{...current},baseline:{...baseline},pending:changed};return {current:{...generated},baseline:{...generated},pending:false}}
 return {sync};
});
