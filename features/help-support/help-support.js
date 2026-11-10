(function(){
  "use strict";
  const search=document.getElementById("helpSearch");
  if(!search)return;
  const cards=Array.from(document.querySelectorAll(".rm-help-section"));
  search.addEventListener("input",function(){
    const term=search.value.trim().toLowerCase();
    cards.forEach(section=>{
      const matches=!term||section.textContent.toLowerCase().includes(term);
      section.classList.toggle("rm-help-hidden",!matches);
      if(term&&matches){
        section.querySelectorAll("details").forEach(item=>{
          if(item.textContent.toLowerCase().includes(term))item.open=true;
        });
      }
    });
  });
})();
