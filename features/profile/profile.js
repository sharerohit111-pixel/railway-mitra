document.addEventListener("DOMContentLoaded", async function () {
  const api = window.RailwayMitraEmployeeData;
  const form = document.getElementById("employeeProfileForm");
  const message = document.getElementById("profileMessage");
  if (!api || !form) return;

  const baseFields = ["employeeId","name","post","level","basicPay","tpa","division","zone","employeeNumber","department"];
  const optionalFields = ["billUnit","hrmsId","pfNumber","officialMobile","officialEmail"];
  const allFields = baseFields.concat(optionalFields);
  const employeeId = document.getElementById("employeeId");
  const panel = document.getElementById("optionalPanel");
  const toggle = document.getElementById("toggleOptional");
  const customFields = document.getElementById("customFields");
  const cloudStatus = document.getElementById("profileCloudStatus");
  let customRows = [];
  let currentUser = null;
  let firebaseFns = null;
  let saving = false;

  function status(text, error=false) {
    cloudStatus.textContent = text;
    cloudStatus.style.color = error ? "#fca5a5" : "#6ee7b7";
  }
  function showMessage(text, error=false) {
    message.textContent = text;
    message.className = error ? "error" : "success";
  }
  function fillForm(data) {
    allFields.forEach(id => {
      const el = document.getElementById(id);
      if (el && data[id] !== undefined && data[id] !== null) el.value = data[id];
    });
    employeeId.value = data.employeeId || employeeId.value;
    document.getElementById("heroEmployeeId").textContent = employeeId.value;
    customRows = Array.isArray(data.customFields) ? data.customFields.slice(0,10).map(x=>({label:x.label||"",value:x.value||""})) : [];
    if (optionalFields.some(id=>data[id]) || customRows.length) panel.hidden = false;
    toggle.setAttribute("aria-expanded",String(!panel.hidden));
    renderCustomFields();
  }
  function renderCustomFields() {
    customFields.replaceChildren();
    customRows.forEach((item,index)=>{
      const row=document.createElement("div");row.className="custom-field-row";
      const label=document.createElement("input");label.type="text";label.maxLength=50;label.placeholder="अपना नाम लिखें";label.setAttribute("aria-label","Custom field name "+(index+1));label.value=item.label;
      label.addEventListener("input",()=>customRows[index].label=label.value);
      const value=document.createElement("input");value.type="text";value.maxLength=150;value.placeholder="अपनी जानकारी लिखें";value.setAttribute("aria-label","Custom field value "+(index+1));value.value=item.value;
      value.addEventListener("input",()=>customRows[index].value=value.value);
      row.append(label,value);customFields.appendChild(row);
    });
    document.getElementById("addCustomField").disabled=customRows.length>=10;
  }
  function collectForm() {
    const data={};
    allFields.forEach(id=>data[id]=document.getElementById(id).value);
    data.customFields=customRows.map(x=>({label:String(x.label||"").trim(),value:String(x.value||"").trim()})).filter(x=>x.label||x.value);
    return data;
  }
  function localSave(data) {
    const saved=api.saveProfile(data);
    employeeId.value=saved.employeeId;
    document.getElementById("heroEmployeeId").textContent=saved.employeeId;
    return saved;
  }

  const localProfile=api.getProfile()||{};
  employeeId.value=localProfile.employeeId||("RM-"+String(Date.now()).slice(-8));
  fillForm(localProfile);
  toggle.addEventListener("click",()=>{
    panel.hidden=!panel.hidden;
    toggle.setAttribute("aria-expanded",String(!panel.hidden));
    toggle.innerHTML=(panel.hidden?"＋":"−")+" Add More Employee Details <span class=\"optional-tag\">OPTIONAL</span>";
  });
  document.getElementById("addCustomField").addEventListener("click",()=>{
    if(customRows.length>=10)return;
    customRows.push({label:"",value:""});renderCustomFields();
  });

  // Firebase is loaded lazily so the profile remains usable offline.
  try {
    const [{auth,db},{onAuthStateChanged},{doc,getDoc,setDoc,deleteDoc}] = await Promise.all([
      import("../../assets/js/firebase.js"),
      import("https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js")
    ]);
    firebaseFns={db,doc,getDoc,setDoc};
    onAuthStateChanged(auth,async user=>{
      currentUser=user||null;
      if(!user){status("Not signed in · device-only save");return;}
      status("Connecting to secure cloud…");
      const profileRef=doc(db,"users",user.uid,"employeeProfile","main");
      try{
        const snap=await getDoc(profileRef);
        if(snap.exists()){
          const remote=snap.data();
          // Prefer cloud as the latest cross-device copy once a cloud profile exists.
          localSave(remote);fillForm(remote);
          status("Cloud synced · "+(user.email||user.phoneNumber||"signed-in account"));
        } else if(api.getProfile()) {
          await setDoc(profileRef,{...api.getProfile(),updatedAt:new Date().toISOString()});
          status("Existing device profile uploaded to cloud");
          showMessage("पुरानी प्रोफाइल इस अकाउंट के Cloud में सुरक्षित कर दी गई।");
        } else {
          status("Cloud ready · no profile saved yet");
        }
      }catch(error){
        console.error("Profile cloud load error:",error);
        status("Cloud unavailable",true);
        showMessage("प्रोफाइल इस डिवाइस में उपलब्ध है, लेकिन Cloud लोड नहीं हुआ: "+(error.code||error.message),true);
      }
    });
  } catch(error) {
    console.error("Firebase profile setup:",error);
    status("Cloud setup unavailable",true);
  }

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(saving)return;
    saving=true;
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const saved=localSave(collectForm());
      if(currentUser&&firebaseFns){
        status("Uploading to cloud…");
        const profileRef=firebaseFns.doc(firebaseFns.db,"users",currentUser.uid,"employeeProfile","main");
        await firebaseFns.setDoc(profileRef,{...saved,updatedAt:new Date().toISOString()},{merge:true});
        status("Cloud synced · available on your other devices");
        showMessage("प्रोफाइल इस डिवाइस और Firebase Cloud दोनों में सुरक्षित है।");
      } else {
        status("Device saved · sign in to sync");
        showMessage("प्रोफाइल इस डिवाइस में सेव है। दूसरे डिवाइस पर पाने के लिए लॉगिन करके Cloud Sync करें।");
      }
    }catch(error){
      console.error("Profile save error:",error);
      status("Device saved · cloud sync failed",true);
      showMessage("डिवाइस में सेव हो गई, लेकिन Cloud Sync नहीं हुआ: "+(error.code||error.message),true);
    }finally{saving=false;button.disabled=false;}
  });

  document.getElementById("clearProfile").addEventListener("click",async()=>{
    if(!confirm("क्या आप इस डिवाइस और अपने खाते की Cloud प्रोफाइल हटाना चाहते हैं?"))return;
    try{
      if(currentUser&&firebaseFns){
        await firebaseFns.deleteDoc(firebaseFns.doc(firebaseFns.db,"users",currentUser.uid,"employeeProfile","main"));
      }
      localStorage.removeItem(api.storageKey);
      form.reset();customRows=[];renderCustomFields();panel.hidden=true;toggle.setAttribute("aria-expanded","false");
      employeeId.value="RM-"+String(Date.now()).slice(-8);
      document.getElementById("heroEmployeeId").textContent=employeeId.value;
      status(currentUser?"Cloud profile deleted":"Device profile deleted");
      showMessage("प्रोफाइल हटा दी गई है।");
    }catch(error){console.error(error);showMessage("Cloud प्रोफाइल नहीं हट सकी: "+(error.code||error.message),true);}
  });
});