// H5-only, imported lazily by TrackMap. Official Leaflet integration (ISC)
// and MapLibre GL JS (BSD-3-Clause); no tile proxy, prefetch or offline pack.
import L from 'leaflet';
import '@maplibre/maplibre-gl-leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';
import rendererLicenses from '../../../docs/MAP-LICENSES.txt?raw';
export {rendererLicenses};
export function vectorBasemap(){
 return L.maplibreGL({style:'https://tiles.openfreemap.org/styles/liberty',
  attributionControl:false,interactive:false,renderWorldCopies:false});
}
