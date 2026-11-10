(function(){
  const mapNode=document.getElementById("indiaMap");
  const message=document.getElementById("mapMessage");
  if(!mapNode||!message)return;
  if(typeof maplibregl==="undefined"){
    message.textContent="Map library could not load. Please check your internet connection.";
    return;
  }
  const indiaBounds=[[67.0,5.0],[98.0,37.5]];
  const map=new maplibregl.Map({
    container:"indiaMap",
    style:"https://tiles.openfreemap.org/styles/liberty",
    center:[78.9629,22.5937],
    zoom:4.15,
    minZoom:3,
    maxZoom:18,
    maxBounds:indiaBounds,
    attributionControl:true
  });
  map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),"top-right");
  map.addControl(new maplibregl.ScaleControl({maxWidth:110,unit:"metric"}),"bottom-left");
  map.on("load",function(){
    const style=map.getStyle();
    const sourceId=style.sources && style.sources.openmaptiles ? "openmaptiles" : null;
    if(!sourceId){
      message.textContent="Map ready, but the railway-line data layer is unavailable in this map style.";
      const toggle=document.getElementById("toggleRailways");
      if(toggle)toggle.disabled=true;
      return;
    }
    const firstSymbol=(style.layers||[]).find(layer=>layer.type==="symbol");
    const beforeId=firstSymbol ? firstSymbol.id : undefined;
    map.addLayer({
      id:"rm-railway-lines",
      type:"line",
      source:sourceId,
      "source-layer":"transportation",
      filter:["all",["==",["get","class"],"rail"],["==",["geometry-type"],"LineString"]],
      minzoom:4,
      layout:{"line-cap":"round","line-join":"round","visibility":"visible"},
      paint:{
        "line-color":"#e13cc7",
        "line-width":["interpolate",["linear"],["zoom"],4,0.9,7,1.6,11,2.4,15,4.2],
        "line-opacity":0.96
      }
    },beforeId);
    const toggle=document.getElementById("toggleRailways");
    if(toggle){
      toggle.setAttribute("aria-pressed","true");
      toggle.addEventListener("click",function(){
        const visible=map.getLayoutProperty("rm-railway-lines","visibility")!=="none";
        map.setLayoutProperty("rm-railway-lines","visibility",visible?"none":"visible");
        toggle.setAttribute("aria-pressed",String(!visible));
        toggle.textContent=visible?"Show railway lines":"Hide railway lines";
        message.textContent=visible?"Railway line overlay is hidden.":"Railway lines mapped in OpenStreetMap are highlighted.";
      });
    }
    message.textContent="Map ready. Railway lines mapped in OpenStreetMap are highlighted; coverage may vary.";
  });
  map.on("error",function(){message.textContent="Some map tiles could not load. Check your internet connection and try again.";});
  document.getElementById("indiaView").addEventListener("click",function(){
    map.fitBounds(indiaBounds,{padding:28,duration:700});
  });
  document.getElementById("locateMe").addEventListener("click",function(){
    if(!navigator.geolocation){message.textContent="Location is not supported by this browser.";return;}
    message.textContent="Requesting your location permission…";
    navigator.geolocation.getCurrentPosition(function(position){
      const point=[position.coords.longitude,position.coords.latitude];
      if(window.rmUserMarker)window.rmUserMarker.remove();
      window.rmUserMarker=new maplibregl.Marker({color:"#e83dbd"}).setLngLat(point).setPopup(new maplibregl.Popup().setText("Your current location")).addTo(map);
      map.flyTo({center:point,zoom:13,duration:900});
      message.textContent="Your location is shown on this device. It is not saved by Railway Mitra.";
    },function(error){
      message.textContent=error.code===1?"Location permission was denied. You can enable it in browser settings.":"Could not get your location. Please try again.";
    },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
  });
})();