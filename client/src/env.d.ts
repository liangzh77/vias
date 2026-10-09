/// <reference types="vite/client" />
declare const __VIAS_RESEARCH__: boolean;
declare module 'virtual:vias-catalog' { const routes: import('./core/track').Route[]; export default routes; }
declare const wx: { env:{USER_DATA_PATH:string}; shareFileMessage(options:{filePath:string;fileName:string;fail?:()=>void}):void };
