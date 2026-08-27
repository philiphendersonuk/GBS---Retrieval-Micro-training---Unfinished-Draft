/* Minimal SCORM 1.2 API wrapper */
var apiHandle = null, initialized=false, finished=false;
function findAPI(win){var t=0;while(win && !win.API && win.parent && win.parent!=win && t++<10){win=win.parent}return win?win.API:null;}
function getAPIHandle(){if(apiHandle) return apiHandle; apiHandle = findAPI(window) || (window.opener?findAPI(window.opener):null); return apiHandle;}
function LMSInitialize(){var API=getAPIHandle(); if(!API) return "true"; var res=API.LMSInitialize(""); initialized=(res==="true"); return res;}
function LMSFinish(){ if(finished) return "true"; var API=getAPIHandle(); var res="true"; if(API && initialized){res=API.LMSFinish("")} finished=true; return res;}
function LMSGetValue(n){var API=getAPIHandle(); if(!API) return ""; return API.LMSGetValue(n);}
function LMSSetValue(n,v){var API=getAPIHandle(); if(!API) return "true"; return API.LMSSetValue(n,String(v));}
function LMSCommit(){var API=getAPIHandle(); if(!API) return "true"; return API.LMSCommit("");}
window.addEventListener("beforeunload",function(){try{LMSCommit()}catch(e){} try{LMSFinish()}catch(e){}});
