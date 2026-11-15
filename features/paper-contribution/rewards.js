import { app, auth } from "../../assets/js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
const listRewards=httpsCallable(getFunctions(app,"asia-south1"),"listContributorRewardBadges");
const list=document.getElementById("rewardList");
const message=document.getElementById("rewardMessage");
function el(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;}
onAuthStateChanged(auth,async user=>{
 if(!user){list.replaceChildren(el("p","","Please sign in to view contributor badges."));return;}
 try{
  const result=await listRewards({});
  const people=result.data.contributors||[];
  list.replaceChildren();
  if(!people.length){list.append(el("p","","No approved contributors yet. Be the first!"));return;}
  people.forEach((person,index)=>{
   const row=el("div","rm-reward-row");
   row.append(el("span","rm-reward-rank",index<3?["🏆","⭐","✨"][index]:"🌟"));
   row.append(el("strong","",person.name));
   row.append(el("span","rm-reward-badge",person.badgeEmoji+" "+person.badgeLabel));
   list.append(row);
  });
 }catch(error){list.replaceChildren(el("p","","Sign in to view the contributor list. "+(error.message||"")));}
});
