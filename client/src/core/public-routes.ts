// Public (non-research) catalog: real Beijing routes derived from OpenStreetMap plus the
// two synthetic, explicitly non-navigable examples used for the UI walkthrough.
import type {Route} from './track';
import osm from './osm-routes.json';
import demo from './demo-routes.json';
export default [...(osm as unknown as Route[]), ...(demo as unknown as Route[])];
