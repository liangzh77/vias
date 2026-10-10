// Local (non-research, non-catalogue) routes: the two synthetic examples used for the UI
// walkthrough. They are explicitly marked as not navigable.
//
// The OpenStreetMap catalogue is *not* imported here on purpose: its index is fetched as
// JSON at runtime and its geometry shard by shard (see core/osm-catalog.ts), so no route
// data ends up in the JavaScript bundle.
import type {Route} from './track';
import demo from './demo-routes.json';
export default demo as unknown as Route[];
