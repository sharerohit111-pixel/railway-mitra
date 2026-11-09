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
  map.on("load",function(){message.textContent="Map ready. Zoom or move the map to explore India.";});
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