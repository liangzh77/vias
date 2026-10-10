// Explicit environment overrides prevent inherited private research mode.
// The catalogue is installed into client/src/static/osm first: the repository only carries a
// small publishable sample, while the full local catalogue lives in the git-ignored
// data/catalog.
import {spawnSync} from 'node:child_process';
const env={...process.env,VIAS_RESEARCH:'0',VIAS_PUBLIC:'1'};
const prepareArgs=['../scripts/prepare-catalog.mjs',...process.argv.slice(2).filter(a=>a==='--full'||a==='--sample')];
for(const [command,args] of [['node',prepareArgs],['npm',['exec','--','uni','build']],['node',['../scripts/check-public-build.mjs','h5','--public']]]){
 const result=spawnSync(command,args,{env,stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
