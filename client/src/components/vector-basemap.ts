// H5-only, imported lazily by TrackMap. Official Leaflet integration (ISC)
// and MapLibre GL JS (BSD-3-Clause); no tile proxy, prefetch or offline pack.
import L from 'leaflet';
import '@maplibre/maplibre-gl-leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';
import rendererLicenses from '../../../docs/MAP-LICENSES.txt?raw';
export {rendererLicenses};
export function vectorBasemap(){
 const layer=L.maplibreGL({style:'https://tiles.openfreemap.org/styles/liberty',
  attributionControl:false,interactive:false,renderWorldCopies:false});
 // The adapter registers Leaflet events before _initGL. If WebGL construction
 // throws, its stock onRemove dereferences a missing GL map, leaving move/resize
 // listeners behind. Allow public removeLayer to complete that partial teardown.
 const remove=layer.onRemove;
 layer.onRemove=function(map){if(this.getMaplibreMap())return remove.call(this,map);this.getContainer()?.remove();return this;};
 return layer;
}
