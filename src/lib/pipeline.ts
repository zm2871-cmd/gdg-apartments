import 'server-only';
import {fromEwkbHex} from '../../data-pipeline/lib/issue.js';
import {dataset_ids} from '../../data-pipeline/lib/sources.js';
import type {getBuildingIssues} from '../../data-pipeline/lib/issues.js';
import type {searchAddress} from '../../data-pipeline/lib/geosearch.js';
import type {Coverage,Evidence,Identity,Report} from './domain';
import {score} from './scoring';

// The one place the app touches the pipeline (routes/SPEC.md decisions 4 and 8). Use pipeline() from ./db as the client.
export {searchAddress} from '../../data-pipeline/lib/geosearch.js';
export {resolveBuilding} from '../../data-pipeline/lib/building.js';
export {ingest} from '../../data-pipeline/lib/ingest.js';
export {getBuildingIssues} from '../../data-pipeline/lib/issues.js';

export type BuildingIssues=Awaited<ReturnType<typeof getBuildingIssues>>;
export type SearchMatch=Awaited<ReturnType<typeof searchAddress>>[number];
// The columns of a pipeline `buildings` row that the app reads.
export type BuildingRow={bbl:string;bin:string|null;address:string;borough:string|null;geom:string;units_res:number|null};
type Issue=BuildingIssues['issues'][number];

const sources={
  hpd_violation:{name:'HPD violations',dataset:dataset_ids.hpd_violations,kind:'violation'},
  hpd_complaint:{name:'HPD complaints',dataset:dataset_ids.hpd_complaints,kind:'complaint'},
  rodent:{name:'DOHMH rodent inspections',dataset:dataset_ids.rodent_inspections,kind:'inspection'},
  bedbug:{name:'HPD bedbug filings',dataset:dataset_ids.bedbug_filings,kind:'filing'},
  '311':{name:'NYC 311 requests',dataset:dataset_ids.three_one_one_requests,kind:'complaint'},
} as const satisfies Record<Issue['source'],{name:string;dataset:string;kind:Evidence['kind']}>;
const severity={1:1,2:3,3:6} as const;
const coverageStatus={ok:'ok',stale:'stale',failed:'error',missing:'unmatched'} as const satisfies Record<string,Coverage['status']>;

export function toIdentity(b:BuildingRow|SearchMatch):Identity{
  const point='geom' in b?fromEwkbHex(b.geom):{lat:b.lat,lon:b.lon};
  return {
    id:b.bbl,bbl:b.bbl,bin:b.bin??undefined,address:'address' in b?b.address:b.label,borough:b.borough||'Unknown',
    lat:point.lat,lng:point.lon,confidence:b.bin?'building':'tax_lot',
    ...('units_res' in b&&b.units_res!=null&&{lotUnits:b.units_res}),
  };
}

function toEvidence(i:Issue,scope:Evidence['scope'],count=1):Evidence|null{
  // shortcut: undated rows are dropped (the frontend requires a date and scoring ignores them); show them if they become common.
  if(!i.observedAt)return null;
  const s=sources[i.source];
  return {
    id:`${i.source}:${i.sourceId}`,externalId:i.sourceId,source:s.name,
    category:i.category==='repairs'?'maintenance':i.category,kind:s.kind,scope,date:i.observedAt,status:i.status,
    severity:severity[i.severity],description:count>1?`${i.description} (${count} reports)`:i.description,
    url:`https://data.cityofnewyork.us/d/${s.dataset}`,positive:true, // the pipeline stores positive findings only
    ...(i.lat!=null&&i.lon!=null&&{lat:i.lat,lng:i.lon}),
  };
}

/** Maps a pipeline building and its getBuildingIssues() result to the app's Report (routes/SPEC.md §5). */
export function toReport(b:BuildingRow,r:BuildingIssues,now=new Date()):Report{
  const checkedAt=now.toISOString();
  const key=(i:Issue)=>`${i.source}:${i.sourceId}`;
  const own=new Set(r.building?.issues.map(key));
  const records=[
    ...r.issues.map(i=>toEvidence(i,own.has(key(i))?'building':'tax_lot')),
    ...r.noise.map(n=>toEvidence(n,'nearby',n.count)),
  ].filter((e):e is Evidence=>e!==null);
  const coverage=r.sources.map(({source,status,lastSuccessAt,error,note}):Coverage=>{
    const name=sources[source as Issue['source']].name,message=error??note;
    return {source:name,status:coverageStatus[status],checkedAt:lastSuccessAt??checkedAt,count:records.filter(e=>e.source===name).length,...(message&&{message})};
  });
  const identity:Identity={...toIdentity(b),confidence:r.building?.matched?'building':'tax_lot'};
  return {identity,records,coverage,scores:score(records),checkedAt,demo:false};
}
