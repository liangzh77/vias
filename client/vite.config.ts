import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';
import { fileURLToPath } from 'node:url';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const publicBuild = process.env.VIAS_PUBLIC === '1';
if (publicBuild && process.env.VIAS_RESEARCH === '1') throw new Error('Public build cannot enable research');
const research = process.env.VIAS_RESEARCH === '1';
const catalog = fileURLToPath(new URL(research ? './src/core/routes.json' : './src/core/public-routes.ts', import.meta.url));
if (!existsSync(catalog)) throw new Error('Local research catalog missing; omit VIAS_RESEARCH to use public demo data.');
export default defineConfig({
  base: publicBuild ? '/vias/' : '/',
  plugins: [(uni as unknown as {default:typeof uni}).default(), {
    name: 'vias-public-inventory',
    writeBundle(options, bundle) {
      if (research || process.env.UNI_PLATFORM !== 'h5') return;
      const inventory: Record<string,string> = {};
      for (const [name,item] of Object.entries(bundle)) {
        const data=item.type==='chunk'?item.code:item.source;
        inventory[name]=createHash('sha256').update(data).digest('hex');
      }
      const parent=path.dirname(options.dir!);
      mkdirSync(parent,{recursive:true});
      writeFileSync(path.join(parent,'.vias-h5-inventory.json'),JSON.stringify(inventory,null,2));
    }
  }],
  resolve: { alias: { 'virtual:vias-catalog': catalog } },
  define: { __VIAS_RESEARCH__: JSON.stringify(research) },
  server:{host:'127.0.0.1',port:8776,strictPort:true}, build:{sourcemap:false}
});
