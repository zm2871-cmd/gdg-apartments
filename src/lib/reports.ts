import 'server-only';
import type {Identity,Report} from './domain';
import {demoIdentities,demoReport} from './demo';
import {pipeline} from './db';
import {getBuildingIssues,ingest,toIdentity,toReport,type BuildingRow} from './pipeline';

const demoOff=()=>process.env.DEMO_MODE==='false';

// The pipeline buildings row for a BBL (written by /api/address/resolve), or null for any other ID.
async function readBuilding(id:string){
  if(!/^[1-5]\d{9}$/.test(id))return null;
  const db=pipeline();if(!db)throw new Error('PERSISTENCE_UNAVAILABLE');
  const {data,error}=await db.from('buildings').select('bbl,bin,address,borough,geom,units_res').eq('bbl',id).maybeSingle();
  if(error)throw new Error('PERSISTENCE_UNAVAILABLE');
  return data?{db,row:data as BuildingRow}:null;
}

export async function getIdentity(id:string):Promise<Identity|null>{
  if(id.startsWith('demo-'))return demoOff()?null:demoIdentities.find(b=>b.id===id)??null;
  const found=await readBuilding(id);return found&&toIdentity(found.row);
}

/** Refetches sources older than 24 h (all of them with `refresh`), then reads the stored issues. */
export async function getReport(id:string,refresh=false):Promise<Report|null>{
  if(id.startsWith('demo-'))return demoOff()?null:demoReport(id);
  const found=await readBuilding(id);if(!found)return null;
  const {db,row}=found,{lat,lng}=toIdentity(row);
  await ingest({bbl:row.bbl,bin:row.bin,lat,lon:lng},db,{force:refresh});
  return toReport(row,await getBuildingIssues(row.bbl,db,{bin:row.bin}));
}
export function trends(report:Report,months:number){const now=new Date();return Array.from({length:months},(_,i)=>{const date=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-months+i+1,1));const month=date.toISOString().slice(0,7);return {month,count:report.records.filter(e=>e.date.startsWith(month)).length};});}
