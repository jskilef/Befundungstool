/* Small, framework-free controls reused by examination modules. */
(function(root){'use strict';
function node(tag,text,attrs={}){const e=document.createElement(tag);if(text!=null)e.textContent=text;for(const [key,value]of Object.entries(attrs)){if(['checked','disabled','open'].includes(key))e[key]=!!value;else if(key==='class')e.className=value;else e.setAttribute(key,value)}return e}
function button(text,fn,attrs={}){const e=node('button',text,{type:'button',...attrs});e.onclick=fn;return e}
function select(title,options,value,fn,attrs={}){const label=node('label',title),e=node('select',null,attrs);e.append(node('option','Nicht angegeben',{value:''}));options.forEach(([v,t])=>e.append(node('option',t,{value:v})));e.value=value||'';e.onchange=()=>fn(e.value);label.append(e);return label}
function input(title,value,fn,attrs={}){const label=node('label',title),e=node('input',null,{type:'text',...attrs});e.value=value??'';e.oninput=()=>fn(e.value);label.append(e);return label}
function check(title,value,fn,attrs={}){const label=node('label',null,{class:'cx-check'}),e=node('input',null,{type:'checkbox',checked:value,...attrs});e.onchange=()=>fn(e.checked);label.append(e,document.createTextNode(title));return label}
function multi(title,options,values,fn,attrs={}){const field=node('fieldset',null,attrs);field.append(node('legend',title));const optionsBox=node('div',null,{class:'cx-options'});for(const [id,text]of options)optionsBox.append(check(text,values.includes(id),checked=>fn(id,checked),{'data-option':id}));field.append(optionsBox);return field}
root.ExamComponents={node,button,select,input,check,multi};
})(globalThis);
