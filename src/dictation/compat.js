/* Browser-side compatibility only. Native Fluency Direct targeting remains in its desktop client. */
(function(root){'use strict';
function mount({getFields,getLabel,onChange,hasChanges,host,english}){
 let target=null,interval=null;const composing=new WeakSet(),buttons=new Map();
 const status=document.createElement('div');status.className='dictation-status';status.hidden=true;
 const message=document.createElement('span');message.id='dictationStatus';message.setAttribute('role','status');
 const stop=document.createElement('button');stop.type='button';stop.id='stopDictation';stop.onclick=()=>end();
 const help=document.createElement('a');help.href='https://github.com/jskilef/radnote/blob/main/FLUENCY_DIRECT.md';help.target='_blank';help.rel='noopener noreferrer';
 status.append(message,stop,help);host.after(status);
 function end(){if(target)delete target.dataset.dictation;target=null;clearInterval(interval);interval=null;render()}
 function sync(){if(!target)return;if(!target.isConnected||target.closest('.section')?.hidden){end();return}commit(target)}
 function commit(field){if(!composing.has(field)&&hasChanges(field))onChange(field)}
 function begin(field){sync();if(target===field){end();return}end();target=field;field.dataset.dictation='active';field.focus();interval=setInterval(sync,300);render()}
 function render(){const en=english();status.hidden=!target;message.textContent=target?(en?'Dictation mode: ':'Diktiermodus: ')+getLabel(target.id)+(en?' · Set the dictation target in Fluency Direct.':' · Diktierziel in Fluency Direct festlegen.'):'';stop.textContent=en?'End dictation mode':'Diktiermodus beenden';help.textContent=en?'Setup & help':'Einrichtung & Hilfe';for(const [field,button]of buttons){button.textContent=en?'Dictation':'Diktieren';button.setAttribute('aria-pressed',String(target===field));button.setAttribute('aria-label',(en?'Dictation mode for ':'Diktiermodus für ')+getLabel(field.id))}}
 function refresh(){for(const field of getFields()){if(buttons.has(field))continue;field.name=field.id;field.setAttribute('aria-label',getLabel(field.id));const button=document.createElement('button');button.type='button';button.className='dictation-action';button.dataset.dictationFor=field.id;button.onmousedown=e=>e.preventDefault();button.onclick=()=>begin(field);field.closest('.section').querySelector('.section-heading').append(button);buttons.set(field,button);
 field.addEventListener('compositionstart',()=>composing.add(field));field.addEventListener('compositionend',()=>{composing.delete(field);commit(field)});
 for(const type of ['change','blur'])field.addEventListener(type,()=>commit(field));
 }for(const field of buttons.keys()){if(!field.isConnected)buttons.delete(field);else field.setAttribute('aria-label',getLabel(field.id))}if(target&&(!target.isConnected||target.closest('.section')?.hidden))end();else render()}
 // Flush delayed external updates before copy, export, navigation, or losing the window.
 window.addEventListener('blur',sync);window.addEventListener('pagehide',sync);document.addEventListener('visibilitychange',sync);document.addEventListener('pointerdown',sync,true);document.addEventListener('keydown',sync,true);
 refresh();return {refresh,sync,isActive:field=>target===field,isComposing:field=>composing.has(field),end};
}
root.RadnoteDictation={mount};
})(globalThis);
