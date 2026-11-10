import {auth} from "../../assets/js/firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
onAuthStateChanged(auth,async user=>{
 if(!user)return;
 try{
  const token=await user.getIdTokenResult(true);
  if(token.claims.admin!==true)return;
  const main=document.querySelector(".exam-shell");
  if(!main||document.getElementById("ownerWorkspaceEntry"))return;
  const link=document.createElement("a");
  link.id="ownerWorkspaceEntry";
  link.className="exam-admin-note";
  link.href="admin-workspace.html";
  link.textContent="🔐 Owner Admin Workspace →";
  link.style.display="block";
  link.style.textDecoration="none";
  link.style.marginTop="18px";
  main.appendChild(link);
 }catch(_error){/* Keep owner controls hidden unless the claim is verified. */}
});