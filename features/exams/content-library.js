import {app,auth} from "../../assets/js/firebase.js";
import {requireOwner} from "./admin-guard.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import {getStorage,ref as storageRef,uploadBytes,getDownloadURL,deleteObject} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-storage.js";
const functions=getFunctions(app,"asia-south1"),storage=getStorage(app),call=name=>httpsCallable(functions,name);
const api={list:call("listExamContent"),createFolder:call("createExamContentFolder"),renameFolder:call("renameExamContentFolder"),deleteFolder:call("deleteExamContentFolder"),registerFile:call("registerExamContentFile"),renameFile:call("renameExamContentFile"),deleteFile:call("deleteExamContentFile"),publish:call("adminSetMaterialPublication"),price:call("adminSetMaterialPrice"),search:call("searchExamContent")};
const panel=document.getElementById("protectedPanel"),itemsEl=document.getElementById("contentItems"),statusEl=document.getElementById("contentStatus"),titleEl=document.getElementById("currentFolderTitle"),descEl=document.getElementById("folderDescription"),crumbsEl=document.getElementById("folderBreadcrumbs"),newFolderBtn=document.getElementById("newFolderBtn"),uploadBtn=document.getElementById("uploadPdfBtn"),pdfInput=document.getElementById("pdfInput");
const searchInput=document.getElementById("contentSearchInput"),searchBtn=document.getElementById("contentSearchBtn"),searchClear=document.getElementById("contentSearchClear");
const MAX_BYTES=20*1024*1024;let currentId=null,currentName="Main Folders",path=[],busy=false;
const safe=v=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function status(message,error=false){statusEl.textContent=message;statusEl.classList.toggle("error",error);}
function setBusy(value){busy=value;newFolderBtn.disabled=value||!currentId;uploadBtn.disabled=value||!currentId;}
function button(label,action){const b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",action);return b;}
function renderCrumbs(){crumbsEl.replaceChildren();const root=button("Main Folders",()=>openFolder(null,"Main Folders",[]));root.className="folder-crumb";crumbsEl.append(root);for(let i=0;i<path.length;i++){const sep=document.createElement("span");sep.textContent="›";crumbsEl.append(sep);const x=path[i],b=button(x.name,()=>openFolder(x.id,x.name,path.slice(0,i+1)));b.className="folder-crumb";if(i===path.length-1)b.setAttribute("aria-current","page");crumbsEl.append(b);}}
async function searchContent(){
 const query=searchInput.value.trim();
 if(query.length<2){status("Enter at least 2 characters to search.",true);return;}
 setBusy(true);status("Searching folders and PDFs…");
 try{
  const result=(await api.search({query})).data;itemsEl.replaceChildren();
  for(const folder of result.folders||[]){
   const card=document.createElement("article");card.className="content-item";
   const open=button("📁 "+folder.name,async()=>{try{const d=(await api.search({folderId:folder.id})).data.item;const last=d.path[d.path.length-1];await openFolder(last.id,last.name,d.path);}catch(e){status(e.message||"Folder could not be opened.",true);}});
   const meta=document.createElement("p");meta.textContent="Folder • "+(folder.category||"Content");
   card.append(open,meta);itemsEl.append(card);
  }
  for(const file of result.files||[]){
   const card=document.createElement("article");card.className="content-item";
   const open=button("📄 "+file.name,()=>openPdf(file));const meta=document.createElement("p");meta.textContent="PDF • "+file.folderId;
   card.append(open,meta);itemsEl.append(card);
  }
  if(!(result.folders||[]).length&&!(result.files||[]).length)itemsEl.innerHTML='<div class="content-empty">No matching folders or PDFs.</div>';
  status("Search results: "+(result.folders||[]).length+" folder(s), "+(result.files||[]).length+" PDF(s).");
 }catch(e){status(e.message||"Search failed.",true);}finally{setBusy(false);}
}

async function openFolder(id,name,nextPath){currentId=id;currentName=name;path=nextPath;titleEl.textContent=id?name:"Main Folders";descEl.textContent=id?"Manage subfolders and PDF files in this folder.":"Choose LDCE, GDCE or STUDY MATERIAL.";renderCrumbs();setBusy(true);status("Loading folder contents…");itemsEl.innerHTML='<div class="content-empty">Loading…</div>';try{const result=(await api.list({parentId:id})).data;itemsEl.replaceChildren();const folders=result.folders||[],files=result.files||[];for(const folder of folders){const card=document.createElement("article");card.className="content-item";const open=document.createElement("button");open.type="button";open.className="item-open";open.innerHTML='<div class="item-icon">📁</div><h3>'+safe(folder.name)+'</h3><p>Folder • '+(folder.isRoot?"Main category":"Subfolder")+'</p>';open.addEventListener("click",()=>openFolder(folder.id,folder.name,[...path,{id:folder.id,name:folder.name}]));const actions=document.createElement("div");actions.className="item-actions";actions.append(button("Rename",()=>renameFolder(folder)));if(!folder.isRoot)actions.append(button("Delete",()=>removeFolder(folder)));card.append(open,actions);itemsEl.append(card);}for(const file of files){const card=document.createElement("article");card.className="content-item";card.innerHTML='<div class="item-icon">📄</div><h3>'+safe(file.name)+'</h3><p>PDF • '+(Number(file.size)/1024/1024).toFixed(2)+' MB • ₹'+Number(file.price||0)+'</p><p class="file-id">File ID: '+safe(file.id)+'</p>';const actions=document.createElement("div");actions.className="item-actions";actions.append(button("Open PDF",()=>openPdf(file)),button("Rename",()=>renameFile(file)),button(file.published?"Unpublish":"Publish",()=>togglePublication(file)),button("Set Price",()=>setFilePrice(file)),button("Delete",()=>removeFile(file)));card.append(actions);itemsEl.append(card);}if(!folders.length&&!files.length)itemsEl.innerHTML='<div class="content-empty">This folder is empty. Use “New Folder” or “Upload PDF” to add content.</div>';status("Loaded "+folders.length+" folder(s) and "+files.length+" PDF(s).");}catch(error){itemsEl.innerHTML='<div class="content-empty">Could not load content. '+safe(error.message||"Please try again.")+'</div>';status(error.message||"Unable to load content.",true);}finally{setBusy(false);}}
async function createFolder(){const name=prompt("Enter the new folder name:");if(!name||!name.trim())return;setBusy(true);status("Creating folder…");try{await api.createFolder({name:name.trim(),parentId:currentId});status("Folder created.");await openFolder(currentId,currentName,path);}catch(error){status(error.message||"Folder could not be created.",true);setBusy(false);}}
async function renameFolder(folder){const name=prompt("Enter the new folder name:",folder.name);if(!name||!name.trim()||name.trim()===folder.name)return;setBusy(true);try{await api.renameFolder({folderId:folder.id,name:name.trim()});status("Folder renamed.");await openFolder(currentId,currentName,path);}catch(error){status(error.message||"Folder could not be renamed.",true);setBusy(false);}}
async function removeFolder(folder){if(!confirm('Permanently delete folder "'+folder.name+'" and ALL its subfolders and PDFs? This cannot be undone.'))return;setBusy(true);try{await api.deleteFolder({folderId:folder.id});status("Folder deleted.");await openFolder(currentId,currentName,path);}catch(error){status(error.message||"Folder could not be deleted.",true);setBusy(false);}}
async function renameFile(file){const name=prompt("Enter the PDF display name:",file.name);if(!name||!name.trim()||name.trim()===file.name)return;setBusy(true);try{await api.renameFile({fileId:file.id,name:name.trim()});status("PDF name updated.");await openFolder(currentId,currentName,path);}catch(error){status(error.message||"PDF could not be renamed.",true);setBusy(false);}}
async function setFilePrice(file){const current=Number(file.price||0);const value=prompt("Set individual PDF price in ₹ (0 = free):",String(current));if(value===null)return;const price=Number(value);if(!Number.isFinite(price)||price<0||price>100000){status("Enter a valid price from ₹0 to ₹100,000.",true);return;}setBusy(true);try{await api.price({fileId:file.id,price});status("PDF price saved: ₹"+price);await openFolder(currentId,currentName,path);}catch(error){status(error.message||"PDF price could not be saved.",true);setBusy(false);}}
async function togglePublication(file){setBusy(true);try{await api.publish({fileId:file.id,published:!file.published});status(file.published?"Material unpublished.":"Material published in the candidate store.");await openFolder(currentId,currentName,path);}catch(error){status(error.message||"Publication setting failed.",true);setBusy(false);}}
async function removeFile(file){if(!confirm('Permanently delete "'+file.name+'"?'))return;setBusy(true);try{await api.deleteFile({fileId:file.id});status("PDF deleted.");await openFolder(currentId,currentName,path);}catch(error){status(error.message||"PDF could not be deleted.",true);setBusy(false);}}
async function openPdf(file){try{const url=await getDownloadURL(storageRef(storage,file.storagePath));window.open(url,"_blank","noopener");}catch(error){status(error.message||"PDF could not be opened.",true);}}
async function uploadPdf(file){if(!file)return;if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf")){status("Only PDF files are allowed.",true);return;}if(file.size<1||file.size>MAX_BYTES){status("PDF must be smaller than or equal to 20 MB.",true);return;}if(!auth.currentUser){status("Please sign in again.",true);return;}const fileId=crypto.randomUUID().replace(/-/g,""),objectPath="exam-content/"+auth.currentUser.uid+"/"+currentId+"/"+fileId+".pdf";setBusy(true);status("Uploading PDF securely…");try{await uploadBytes(storageRef(storage,objectPath),file,{contentType:"application/pdf",customMetadata:{originalName:file.name.slice(0,180)}});await api.registerFile({folderId:currentId,fileId,name:file.name.replace(/\.pdf$/i,"").slice(0,100),size:file.size,contentType:"application/pdf"});status("PDF uploaded and saved online.");await openFolder(currentId,currentName,path);}catch(error){try{await deleteObject(storageRef(storage,objectPath));}catch(_cleanupError){}status(error.message||"PDF upload failed.",true);setBusy(false);}}
searchBtn.addEventListener("click",searchContent);searchInput.addEventListener("keydown",e=>{if(e.key==="Enter")searchContent();});searchClear.addEventListener("click",()=>{searchInput.value="";openFolder(currentId,currentName,path);});
newFolderBtn.addEventListener("click",createFolder);uploadBtn.addEventListener("click",()=>pdfInput.click());pdfInput.addEventListener("change",async()=>{const file=pdfInput.files&&pdfInput.files[0];pdfInput.value="";await uploadPdf(file);});
requireOwner(async ()=>{
 panel.hidden=false;
 await api.list({parentId:null});
 const params=new URLSearchParams(location.search);
 const folderId=params.get("folder"),fileId=params.get("file");
 if(folderId||fileId){
  try{
   const result=(await api.search(fileId?{fileId}:{folderId})).data.item;
   if(result.type==="folder"){
    const chain=result.path||[];
    const last=chain[chain.length-1];
    await openFolder(last.id,last.name,chain);
   }else if(result.type==="file"){
    const folder=await api.list({parentId:result.folderId});
    const file=(folder.data.files||[]).find(x=>x.id===result.id);
    if(file){await openFolder(result.folderId,"Search Result",[ {id:result.folderId,name:"Search Result"} ]);await openPdf(file);}
    else status("PDF record was not found in its folder.",true);
   }
  }catch(error){status(error.message||"Search result could not be opened.",true);await openFolder(null,"Main Folders",[]);}
 }else openFolder(null,"Main Folders",[]);
});