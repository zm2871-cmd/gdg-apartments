import {type Identity,type Evidence,type Category,type Coverage} from '../domain';
import {soda,numeric,literal,sourceNames,sourceUrl,type Source} from './client';
const text=(r:Record<string,unknown>,k:string)=>typeof r[k]==='string'?r[k] as string:'';
function category(s:string):Category{if(/bedbug/i.test(s))return 'bedbugs';if(/pest|rodent|rat\b|roach|mice|mouse/i.test(s))return 'pests';if(/heat|hot water/i.test(s))return 'heat';if(/noise/i.test(s))return 'noise';return 'maintenance';}
const clean=(s:string)=>s.replace(/\b(?:apartment|apt\.?|unit)\s*[#:]?\s*[a-z0-9-]+/gi,'[unit redacted]').slice(0,600);
export function normalize(source:Source,r:Record<string,unknown>,identity:Identity):Evidence|null{
 let id='',date='',description='',kind:Evidence['kind']='complaint',scope:Evidence['scope']='tax_lot',status='Unknown',severity:1|3|6=1,positive=true;
 if(source==='violations'){id=text(r,'violationid');date=text(r,'inspectiondate')||text(r,'approveddate');description=clean(text(r,'novdescription'));kind='violation';scope=identity.hpd?'building':'tax_lot';status=text(r,'violationstatus')||text(r,'currentstatus');severity=r.class==='C'?6:r.class==='B'?3:1;}
 if(source==='bedbugs'){id=[r.building_id,r.filing_period_start_date,r.filling_period_end_date,r.filing_date].join('-');date=text(r,'filing_date');description=`Owner filing: ${Number(r.infested_dwelling_unit_count)||0} units reported infested during ${text(r,'filing_period_start_date').slice(0,10)} to ${text(r,'filling_period_end_date').slice(0,10)}. Historical, not current verification.`;kind='filing';scope=identity.hpd?'building':'tax_lot';status='Filed';positive=Number(r.infested_dwelling_unit_count)>0;}
 if(source==='rodents'){id=[r.job_id,r.inspection_type,r.inspection_date].join('-');date=text(r,'inspection_date');description=text(r,'result');kind='inspection';status='Inspected';positive=/active rat signs/i.test(description);}
 if(source==='requests'||source==='noise'){id=text(r,'unique_key');date=text(r,'created_date');description=`${text(r,'complaint_type')} — ${text(r,'descriptor')}`;status=text(r,'status');scope=source==='noise'||/noise/i.test(description)?'nearby':'tax_lot';}
 if(!id||!date||!Number.isFinite(Date.parse(date)))return null;
 const c=source==='bedbugs'?'bedbugs':source==='rodents'?'pests':category(description);
 return {id:`${source}:${id}`,externalId:id,source:sourceNames[source],category:c,kind,scope,date,status,severity,description,url:sourceUrl(source),positive,analysisKey:source==='requests'||source==='noise'?`${text(r,'complaint_type')}:${text(r,'descriptor')}:${text(r,'incident_address').toUpperCase()||`${Math.round(Number(r.latitude)*1000)},${Math.round(Number(r.longitude)*1000)}`}`:undefined,lat:Number(r.latitude)||undefined,lng:Number(r.longitude)||undefined};
}
// Nearby noise is high-volume in dense areas, so it gets a larger budget than per-building sources.
const paging:Partial<Record<Source,{size:number;pages:number}>>={noise:{size:500,pages:4}};
export interface DataSourceAdapter {sourceId:Source;fetchForBuilding(identity:Identity):Promise<{records:Evidence[];coverage:Coverage}>;normalize(raw:Record<string,unknown>,identity:Identity):Evidence|null;}
export function adapter(source:Source):DataSourceAdapter{return {sourceId:source,normalize:(r,i)=>normalize(source,r,i),async fetchForBuilding(identity){const checkedAt=new Date().toISOString();const coverage:Coverage={source:sourceNames[source],status:'unmatched',checkedAt,count:0};const since=new Date();since.setUTCFullYear(since.getUTCFullYear()-3);const from=literal(since.toISOString().slice(0,19));let where='';let order=':id';
 if(source==='violations'){where=identity.hpd?`buildingid='${numeric(identity.hpd)}'`:identity.bbl?`bbl='${numeric(identity.bbl)}'`:'';if(where)where+=` AND inspectiondate >= ${from}`;order='inspectiondate DESC, violationid DESC';}
 if(source==='bedbugs'){where=identity.hpd?`building_id='${numeric(identity.hpd)}'`:identity.bbl?`bbl='${numeric(identity.bbl)}'`:'';if(where)where+=` AND filing_date >= ${from}`;order='filing_date DESC';}
 if(source==='rodents'&&identity.bbl){where=`bbl='${numeric(identity.bbl)}' AND inspection_date >= ${from}`;order='inspection_date DESC';}
 // Building complaints and nearby noise are separate feeds with separate limits, so a busy block's noise cannot crowd out the building's own complaints.
 if(source==='requests'&&identity.bbl){where=`created_date >= ${from} AND bbl='${numeric(identity.bbl)}' AND complaint_type in ('HEAT/HOT WATER','UNSANITARY CONDITION','Rodent','GENERAL','PLUMBING')`;order='created_date DESC, unique_key DESC';}
 if(source==='noise'){where=`created_date >= ${from} AND complaint_type in ('Noise - Residential','Noise - Commercial','Noise - Street/Sidewalk') AND within_circle(location, ${identity.lat}, ${identity.lng}, 200)`;order='created_date DESC, unique_key DESC';}
 if(!where)return {records:[],coverage:{...coverage,message:'Required official identifier unavailable.'}};
 const {size,pages}=paging[source]??{size:200,pages:3};try {const rows=[];let exhausted=false;for(let page=0;page<pages;page++){const batch=await soda(source,where,size,page*size,order);rows.push(...batch);if(batch.length<size){exhausted=true;break;}}let records=rows.map(r=>normalize(source,r,identity)).filter((r):r is Evidence=>r!==null);
 if(source==='bedbugs'){const periods=new Set<string>();records=records.filter(r=>{const key=r.description.split('during ')[1];if(periods.has(key))return false;periods.add(key);return true;});}
 return {records,coverage:{...coverage,status:exhausted?'ok':'truncated',count:records.length,message:exhausted?undefined:`Limited to ${size*pages} recent matching records; counts are incomplete.`}};
 }catch{return {records:[],coverage:{...coverage,status:'error',message:'Official source unavailable. No substitute data shown.'}};}}};}
export const adapters=(['violations','bedbugs','rodents','requests','noise'] as const).map(adapter);
