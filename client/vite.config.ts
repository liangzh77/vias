import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
const research = process.env.VIAS_RESEARCH === '1';
const catalog = fileURLToPath(new URL(research ? './src/core/routes.json' : './src/core/demo-routes.json', import.meta.url));
if (!existsSync(catalog)) throw new Error('Local research catalog missing; omit VIAS_RESEARCH to use public demo data.');
export default defineConfig({
  plugins: [(uni as unknown as {default:typeof uni}).default()],
  resolve: { alias: { 'virtual:vias-catalog': catalog } },
  define: { __VIAS_RESEARCH__: JSON.stringify(research) },
  server:{host:'127.0.0.1',port:8776,strictPort:true}, build:{sourcemap:false}
});
