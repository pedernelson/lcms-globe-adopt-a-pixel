
/****************************************************
 LCMS + GLOBE Observer + Chronolog
 Public NASA/USFS Workshop Earth Engine App
****************************************************/

// ================= MAP & UI SETUP =================
Map.setOptions('SATELLITE');
Map.setCenter(-98.5, 39.8, 5);

var controlPanel = ui.Panel({style: {width: '340px', padding: '10px'}});
ui.root.insert(0, controlPanel);

// Mobile toggle
var panelVisible = true;
var toggleButton = ui.Button({label: '☰ Controls', onClick: function(){
  panelVisible = !panelVisible; controlPanel.style().set('shown', panelVisible);
}});
controlPanel.add(toggleButton);

ui.root.onResize(function(size){ if (size.width < 600){ controlPanel.style().set('shown', false); panelVisible = false; }});

// ================= LOCALIZATION =================
var lang = 'en';
var strings = {
  en: {
    title: 'LCMS + GLOBE + Chronolog — Adopt‑a‑Pixel',
    buffer: 'Buffer size (meters)',
    photosToggle: 'Show only observations with photos',
    disclaimer: 'Images provide ground context and are not used for validation.',
    station: 'Chronolog Station',
    openChrono: 'Open Chronolog Time‑lapse',
    aoiLimit: 'Limit GLOBE points to station AOI',
    reset: 'Reset View',
    tour: 'Adopt‑a‑Pixel Guided Tour'
  }
};

controlPanel.add(ui.Label(strings[lang].title, {fontSize:'18px', fontWeight:'bold'}));

// ================= LCMS LAYERS =================
var lcmsLC = ee.Image('USFS/LCMS/v2023-8/Land_Cover');
var lcmsCY = ee.Image('USFS/LCMS/v2023-8/Change_Year');
var lcmsDT = ee.Image('USFS/LCMS/v2023-8/Disturbance_Type');

Map.addLayer(lcmsLC, {min:1,max:8,palette:['005a32','238b45','a1d99b','ffffcc','969696','08519c','d9d9d9','54278f']}, 'LCMS Land Cover');
Map.addLayer(lcmsCY, {min:1985,max:2023,palette:['ffffcc','feb24c','fd8d3c','e31a1c']}, 'LCMS Change Year', false);
Map.addLayer(lcmsDT, {min:1,max:6,palette:['e41a1c','377eb8','4daf4a','984ea3','ff7f00','999999']}, 'LCMS Disturbance Type', false);

// ================= GLOBE DATA (placeholder) =================
// TODO: Replace with your EE asset containing GLOBE Observer Land Cover points
var globeAll = ee.FeatureCollection('users/YOUR_USERNAME/globe_observer_landcover_points');

function hasImageUrl(f){
  var keys = ee.List(f.propertyNames());
  var urls = keys.filter(ee.Filter.or(
    ee.Filter.stringEndsWith('item','URL'),
    ee.Filter.stringEndsWith('item','Urls')
  ));
  return urls.size().gt(0);
}
var globePhotos = globeAll.filter(hasImageUrl);

function addImageCount(f){
  var keys = ee.List(f.propertyNames());
  var urlKeys = keys.filter(ee.Filter.or(
    ee.Filter.stringEndsWith('item','URL'),
    ee.Filter.stringEndsWith('item','Urls')
  ));
  var count = urlKeys.map(function(k){ return ee.String(f.get(k)).split(',').length(); }).reduce(ee.Reducer.sum());
  return f.set('image_count', count);
}

globePhotos = globePhotos.map(addImageCount);

var globeLayer = ui.Map.Layer(globePhotos.style({
  color:'yellow', pointSize:6,
  textProperty:'image_count', textColor:'black', textOutlineColor:'white', textOutlineWidth:2, textSize:12
}), {}, 'GLOBE Observer (Photos Available)', true);
Map.layers().add(globeLayer);

// ================= BUFFERS =================
var bufferLabel = ui.Label(strings[lang].buffer + ': 30');
var bufferSlider = ui.Slider({min:10, max:150, step:10, value:30});
controlPanel.add(bufferLabel);
controlPanel.add(bufferSlider);

var bufferLayer;
function updateBuffers(dist){
  if (bufferLayer) Map.layers().remove(bufferLayer);
  var buf = globePhotos.map(function(f){ return f.buffer(dist); });
  bufferLayer = ui.Map.Layer(buf, {color:'yellow', fillColor:'00000000', width:2}, 'GLOBE Buffers', false);
  Map.layers().add(bufferLayer);
}
updateBuffers(30);

bufferSlider.onChange(function(v){ bufferLabel.setValue(strings[lang].buffer+': '+v); updateBuffers(v); updateChronoAOI(v); });

// ================= PIXEL INSPECTOR =================
var inspector = ui.Panel({style:{position:'top-right', padding:'8px', width:'300px'}});
inspector.add(ui.Label('Pixel Inspector', {fontWeight:'bold'}));
Map.add(inspector);

Map.onClick(function(coords){
  inspector.clear(); inspector.add(ui.Label('Pixel Inspector', {fontWeight:'bold'}));
  inspector.add(ui.Label('Lon: '+coords.lon.toFixed(4)+', Lat: '+coords.lat.toFixed(4)));
  var pt = ee.Geometry.Point(coords.lon, coords.lat);
  var values = ee.Image.cat([
    lcmsLC.rename('Land Cover'),
    lcmsCY.rename('Change Year'),
    lcmsDT.rename('Disturbance')
  ]).sample(pt, 30).first();
  values.evaluate(function(v){
    if(v){
      inspector.add(ui.Label('LCMS Land Cover: '+v['Land Cover']));
      inspector.add(ui.Label('Change Year: '+v['Change Year']));
      inspector.add(ui.Label('Disturbance: '+v['Disturbance']));
    } else { inspector.add(ui.Label('No data at this location.')); }
  });
});

// ================= IMAGE PANEL (Thumbnails with direction icons) =================
var comparePanel = ui.Panel({layout: ui.Panel.Layout.Flow('horizontal'), style:{position:'bottom-center', padding:'10px', width:'760px', backgroundColor:'white', shown:false}});
var lcmsPanel = ui.Panel({width:'40%'});
var photoPanel = ui.Panel({width:'60%'});
comparePanel.add(lcmsPanel); comparePanel.add(photoPanel); Map.add(comparePanel);

function extractImageUrls(props){
  var urls = [];
  Object.keys(props).forEach(function(k){
    if (k.match(/url$/i) || k.match(/urls$/i)){
      String(props[k]).split(',').forEach(function(u){ if (u.trim().startsWith('http')) urls.push(u.trim()); });
    }
  });
  return urls;
}
function sortByDirection(urls){
  var order = ['north','east','south','west'];
  return urls.sort(function(a,b){
    var ai = order.findIndex(function(d){ return a.toLowerCase().includes(d); });
    var bi = order.findIndex(function(d){ return b.toLowerCase().includes(d); });
    return (ai===-1?99:ai) - (bi===-1?99:bi);
  });
}
function directionIcon(url){
  var u = url.toLowerCase();
  if (u.includes('north')) return '⬆ N';
  if (u.includes('east')) return '➡ E';
  if (u.includes('south')) return '⬇ S';
  if (u.includes('west')) return '⬅ W';
  return '📷';
}

// Enhance Map click to show nearby GLOBE images + LCMS readout
Map.onClick(function(coords){
  var pt = ee.Geometry.Point(coords.lon, coords.lat);
  var nearby = globePhotos.filterBounds(pt).limit(1);
  nearby.evaluate(function(fc){
    if (!fc || !fc.features || fc.features.length===0){ return; }
    var f = fc.features[0]; var props = f.properties;

    Map.centerObject(ee.Geometry.Point(f.geometry.coordinates), 18);
    comparePanel.style().set('shown', true); lcmsPanel.clear(); photoPanel.clear();

    lcmsPanel.add(ui.Label('LCMS Pixel', {fontWeight:'bold'}));
    lcmsPanel.add(ui.Label('Lon: '+coords.lon.toFixed(4))); lcmsPanel.add(ui.Label('Lat: '+coords.lat.toFixed(4)));

    photoPanel.add(ui.Label('GLOBE Observer Photos', {fontWeight:'bold'}));
    var urls = sortByDirection(extractImageUrls(props));
    urls.forEach(function(url){
      var row = ui.Panel({layout: ui.Panel.Layout.Flow('horizontal'), style:{margin:'4px 0'}});
      row.add(ui.Label(directionIcon(url), {width:'40px'}));
      row.add(ui.Thumbnail({image: ee.Image().paint(ee.Geometry.Point(0,0),1), params:{}, style:{backgroundImage:'url('+url+')', backgroundSize:'cover', height:'90px', width:'120px', margin:'2px', border:'1px solid black'}}));
      photoPanel.add(row);
    });
    photoPanel.add(ui.Label(strings[lang].disclaimer, {fontSize:'10px', color:'gray'}));
  });
});

// ================= ACCESSIBLE LEGEND =================
var legend = ui.Panel({style:{position:'bottom-left', padding:'10px', backgroundColor:'white'}});
legend.add(ui.Label('LCMS Land Cover', {fontWeight:'bold', fontSize:'14px'}));
[
  ['Forest','#005a32'],['Shrubland','#238b45'],['Grassland','#a1d99b'],['Agriculture','#ffffcc'],
  ['Developed','#969696'],['Water','#08519c'],['Barren','#d9d9d9'],['Wetland','#54278f']
].forEach(function(i){ legend.add(ui.Panel([ui.Label('■',{color:i[1],fontSize:'16px'}), ui.Label(i[0])], ui.Panel.Layout.Flow('horizontal'))); });
Map.add(legend);

// ================= GUIDED TOUR =================
var tourSteps = [
  'Step 1: Zoom to an area and adopt a single LCMS pixel.',
  'Step 2: Toggle LCMS Change Year and Disturbance Type layers.',
  'Step 3: Turn on GLOBE points and adjust buffer size.',
  'Step 4: Click a pixel to view LCMS values.',
  'Step 5: Click a GLOBE point to view images.',
  'Step 6: (Optional) Select a Chronolog station to explore time‑lapse context.'
];
var tourIndex = 0;
var tourLabel = ui.Label(tourSteps[tourIndex], {wrap:true});
var nextButton = ui.Button('Next', function(){ tourIndex = (tourIndex+1)%tourSteps.length; tourLabel.setValue(tourSteps[tourIndex]); });
var tourPanel = ui.Panel({widgets:[ui.Label(strings[lang].tour,{fontWeight:'bold'}), tourLabel, nextButton], style:{position:'top-left', padding:'10px', width:'300px'}});
Map.add(tourPanel);

// ================= KEYBOARD SHORTCUTS =================
function resetView(){ Map.setCenter(-98.5, 39.8, 5); bufferSlider.setValue(30); comparePanel.style().set('shown', false); }
controlPanel.add(ui.Button({label: strings[lang].reset, onClick: resetView}));
ui.root.onKeyDown(function(e){ if(e.key==='b') bufferSlider.setValue(30); if(e.key==='r') resetView(); if(e.key==='p') globeLayer.setShown(!globeLayer.getShown()); });

// ================= EXPORT CO‑OCCURRENCE CSV =================
var summaryPanel = ui.Panel({style:{position:'bottom-right', padding:'8px', width:'300px'}});
summaryPanel.add(ui.Label('LCMS–GLOBE Co‑Occurrence Summary',{fontWeight:'bold'}));
summaryPanel.add(ui.Button({label:'Export Co‑Occurrence Summary (CSV)', onClick: function(){
  var buffers = globePhotos.map(function(f){ return f.buffer(bufferSlider.getValue()); });
  var samples = lcmsLC.sampleRegions({collection: buffers, scale: 30, geometries:false});
  Export.table.toDrive({collection: samples, description:'LCMS_GLOBE_CoOccurrence_Summary', fileFormat:'CSV'});
}}));
Map.add(summaryPanel);

// ================= CHRONOLOG STATION SELECTOR (Inline Example) =================
var chronologStations = [
  {"station_id": "RWC102", "location_name": "Chronolog Example \u2014 RWC102", "latitude": 37.485, "longitude": -122.236, "view_direction": "north", "qr_code_url": "https://www.chronolog.io/site/RWC102"}
];
var chronoFC = ee.FeatureCollection(chronologStations.map(function(s){ return ee.Feature(ee.Geometry.Point([s.longitude, s.latitude]), s); }));

var stationLabel = ui.Label(strings[lang].station, {fontWeight:'bold', margin:'8px 0 4px 0'});
var stationSelect = ui.Select({items: [], placeholder: '— Select station —', style: {stretch: 'horizontal'}});
var stationOpenBtn = ui.Button({label: strings[lang].openChrono, disabled:true, onClick:function(){ var props = stationSelect.getValue(); if(props && props.qr_code_url){ ui.url.open(props.qr_code_url); } }});
var stationNow = ui.Label('Station: (none selected)', {margin:'4px 0 8px 0'});
controlPanel.add(ui.Label('Chronolog (optional)'));
controlPanel.add(stationLabel); controlPanel.add(stationSelect); controlPanel.add(stationOpenBtn); controlPanel.add(stationNow);

var stationMarkerLayer, stationAoiLayer; var stationAoiMeters = 500;

function updateChronoAOI(radius){
  var props = stationSelect.getValue(); if(!props) return;
  var pt = ee.Geometry.Point([props.longitude, props.latitude]); var aoi = pt.buffer(radius);
  if(stationAoiLayer) Map.layers().remove(stationAoiLayer);
  stationAoiLayer = ui.Map.Layer(ee.FeatureCollection([ee.Feature(aoi)]).style({color:'orange', fillColor:'00000000', width:2}), {}, 'Chronolog AOI ('+radius+' m)', true);
  Map.layers().add(stationAoiLayer);
}

// Populate dropdown
chronoFC.reduceColumns(ee.Reducer.toList(2), ['location_name','station_id']).get('list').evaluate(function(list){
  var items = [];
  list.forEach(function(pair){ var name = pair[0]; var id = pair[1];
    chronoFC.filter(ee.Filter.eq('station_id', id)).first().evaluate(function(f){ if(f){ items.push({label:name, value:f.properties}); stationSelect.items().reset(items); } });
  });
});

stationSelect.onChange(function(props){
  stationOpenBtn.setDisabled(false);
  stationNow.setValue('Station: '+props.location_name+' ('+(props.view_direction||'view')+')');
  if (props.latitude && props.longitude){
    var pt = ee.Geometry.Point([props.longitude, props.latitude]); var aoi = pt.buffer(stationAoiMeters);
    Map.centerObject(aoi, 16);
    if (stationMarkerLayer) Map.layers().remove(stationMarkerLayer);
    if (stationAoiLayer) Map.layers().remove(stationAoiLayer);
    stationMarkerLayer = ui.Map.Layer(ee.FeatureCollection([ee.Feature(pt)]).style({color:'black', pointSize:10, width:2}), {}, 'Chronolog Station', true);
    Map.layers().add(stationMarkerLayer);
    updateChronoAOI(stationAoiMeters);
  }
});
