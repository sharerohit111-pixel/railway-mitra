(function(){
"use strict";
const APP_URL=new URL("../",window.location.href).href;
let installPrompt=null;
const installButton=document.getElementById("installButton");
const status=document.getElementById("installStatus");
const helpPanel=document.getElementById("helpPanel");
const helpText=document.getElementById("helpText");
const helpSteps=document.getElementById("helpSteps");
function isInstalled(){return window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;}
function showHelp(kind){
 helpPanel.hidden=false;
 if(kind==="ios"){
  helpText.textContent="On iPhone or iPad, use Safari to add Railway Mitra to your home screen.";
  helpSteps.innerHTML="<li>Open this link in <strong>Safari</strong>.</li><li>Tap the <strong>Share</strong> icon.</li><li>Choose <strong>Add to Home Screen</strong>, then tap Add.</li>";
 }else{
  helpText.textContent="Your browser has not offered the automatic install prompt. You can still add Railway Mitra from the browser menu.";
  helpSteps.innerHTML="<li>Open this page in <strong>Chrome</strong>.</li><li>Tap the three-dot menu.</li><li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>";
 }
}
if("serviceWorker" in navigator){
 window.addEventListener("load",function(){navigator.serviceWorker.register("../service-worker.js").catch(function(error){console.warn("Install page service worker registration failed",error);});});
}
window.addEventListener("beforeinstallprompt",function(event){
 event.preventDefault();installPrompt=event;installButton.disabled=false;installButton.innerHTML="<span aria-hidden=\"true\">↓</span> Install Railway Mitra";status.textContent="Ready to install on your device.";
});
window.addEventListener("appinstalled",function(){
 installPrompt=null;installButton.textContent="App Installed";installButton.disabled=true;status.textContent="Railway Mitra has been installed. You can open it from your home screen.";
});
installButton.addEventListener("click",async function(){
 if(isInstalled()){window.location.href=APP_URL;return;}
 if(installPrompt){
  installButton.disabled=true;
  try{
   await installPrompt.prompt();
   const choice=await installPrompt.userChoice;
   if(choice&&choice.outcome==="accepted"){status.textContent="Installation started. Railway Mitra will be available on your home screen.";installButton.textContent="Installation Started";}
   else{status.textContent="Installation was not completed. You can try again or use the browser menu.";}
  }catch(error){status.textContent="Automatic installation is unavailable. Use the browser menu below.";}
  installPrompt=null;installButton.disabled=false;return;
 }
 const ua=navigator.userAgent||"";
 if(/iphone|ipad|ipod/i.test(ua)){showHelp("ios");}
 else{showHelp("browser");}
 status.textContent="Follow the steps below to add Railway Mitra to your home screen.";
});
if(isInstalled()){
 installButton.innerHTML="Open Railway Mitra";
 status.textContent="Railway Mitra is already installed on this device.";
}else{
 installButton.disabled=false;
 const ua=navigator.userAgent||"";
 if(/iphone|ipad|ipod/i.test(ua)){showHelp("ios");}
}
})();