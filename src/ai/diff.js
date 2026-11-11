/* Word-level diff and sensitive-wording detection, verbatim from Report Studio v1.6.0. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AiDiff = api;
})(globalThis, function () {
  'use strict';

// Exact token diff, bounded to one million LCS cells. Large edits retain all text.
function textDiff(before,after){
  const tokenize=text=>text.match(/\s+|[\p{L}\p{N}]+(?:[.,]\d+)*|[^\s\p{L}\p{N}]/gu)||[];
  const a=tokenize(before),b=tokenize(after),parts=[];
  const add=(kind,text)=>{if(!text)return;if(parts.at(-1)?.kind===kind)parts.at(-1).text+=text;else parts.push({kind,text});};
  let prefix=0,suffix=0;
  while(prefix<a.length&&prefix<b.length&&a[prefix]===b[prefix])prefix++;
  while(suffix<a.length-prefix&&suffix<b.length-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
  add('equal',a.slice(0,prefix).join(''));
  const left=a.slice(prefix,a.length-suffix),right=b.slice(prefix,b.length-suffix),n=left.length,m=right.length;
  const coarse=(n+1)*(m+1)>1000000;
  if(coarse){add('delete',left.join(''));add('insert',right.join(''));}
  else {
    const width=m+1,table=new Uint32Array((n+1)*width);
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)table[i*width+j]=left[i]===right[j]?table[(i+1)*width+j+1]+1:Math.max(table[(i+1)*width+j],table[i*width+j+1]);
    let i=0,j=0;
    while(i<n||j<m){if(i<n&&j<m&&left[i]===right[j]){add('equal',left[i]);i++;j++;}else if(i<n&&(j===m||table[(i+1)*width+j]>=table[i*width+j+1]))add('delete',left[i++]);else add('insert',right[j++]);}
  }
  add('equal',suffix?a.slice(a.length-suffix).join(''):'');
  return {parts,coarse};
}
function hasSensitiveWording(text){return /\d|\b(?:mm|cm|ml|mg|kg|hu|left|right|bilateral|no|not|without|absent|possible|possibly|probable|probably|suspected|cannot|unlikely|uncertain|links(?:e[nmrs]?)?|rechts(?:e[nmrs]?)?|linksseitig\w*|rechtsseitig\w*|beidseits|beidseitig\w*|kein(?:e[nmrs]?)?|nicht|ohne|unauffällig|unwahrscheinlich|wahrscheinlich|möglich\w*|fraglich|verdacht|ausgeschlossen|ausschluss)\b/iu.test(text);}

  return { textDiff, hasSensitiveWording };
});
