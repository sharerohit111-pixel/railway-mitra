(() => {
"use strict";
const $ = id => document.getElementById(id);
let folders = [];
const normalize = value => String(value || "").trim().toUpperCase().replace(/\s+/g, "");
async function codeFor(path) {
  if (!window.crypto || !crypto.subtle || !window.TextEncoder) throw new Error("Secure SHA-256 is unavailable in this browser.");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("railway-mitra-folder:" + path));
  const hex = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
  return "RM-F-" + hex.slice(0, 16).toUpperCase();
}
function showResult(entry) {
 const box=$("result");
 if(!entry){box.className="result not-found";box.textContent="No matching folder code found in the current directory. Check the code spelling or refresh the app.";return;}
 box.className="result found";
 box.innerHTML="";
 const title=document.createElement("strong");title.textContent=entry.name;
 const code=document.createElement("code");code.textContent=entry.code;
 const path=document.createElement("span");path.textContent="Path: features/"+entry.path+"/";
 const link=document.createElement("a");link.href="../"+entry.path+"/";link.textContent="Open folder";
 box.append(title,code,path,link);
}
function renderList(query=""){
 const host=$("folderList");host.replaceChildren();
 const q=query.trim().toLowerCase();
 const matches=folders.filter(x=>x.name.toLowerCase().includes(q)||x.path.toLowerCase().includes(q));
 $("count").textContent=matches.length+" folders";
 matches.slice(0,150).forEach(x=>{
  const row=document.createElement("div");row.className="folder-row";
  const name=document.createElement("span");name.textContent=x.name;
  const path=document.createElement("small");path.textContent=x.path;
  const code=document.createElement("code");code.textContent=x.code;
  row.append(name,path,code);row.addEventListener("click",()=>{ $("folderCode").value=x.code;showResult(x);window.scrollTo({top:0,behavior:"smooth"});});
  host.append(row);
 });
 if(!matches.length){const empty=document.createElement("p");empty.textContent="No folders match this search.";host.append(empty);}
}
async function init(){
 try{
  const response=await fetch("./folders.json",{cache:"no-store"});if(!response.ok)throw new Error("Folder directory could not be loaded.");
  const data=await response.json();
  folders=await Promise.all(data.folders.map(async item=>({...item,code:await codeFor(item.path)})));
  $("count").textContent=folders.length+" folders";
  renderList();
  const params=new URLSearchParams(location.search),initial=params.get("code");
  if(initial){$("folderCode").value=initial;lookup();}
 }catch(error){$("result").className="result not-found";$("result").textContent=error.message;}
}
function lookup(){
 const value=normalize($("folderCode").value);
 const entry=folders.find(x=>x.code===value);
 showResult(entry);
}
$("searchBtn").addEventListener("click",lookup);
$("folderCode").addEventListener("keydown",e=>{if(e.key==="Enter")lookup();});
$("folderFilter").addEventListener("input",e=>renderList(e.target.value));
init();
})();