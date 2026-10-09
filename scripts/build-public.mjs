// Explicit environment overrides prevent inherited private research mode.
import {spawnSync} from 'node:child_process';
const env={...process.env,VIAS_RESEARCH:'0',VIAS_PUBLIC:'1'};
for(const [command,args] of [['npm',['exec','--','uni','build']],['node',['../scripts/check-public-build.mjs','h5','--public']]]){
 const result=spawnSync(command,args,{env,stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
