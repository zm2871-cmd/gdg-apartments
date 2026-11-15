import {it,expect,vi,beforeEach} from 'vitest';
const {ingest,getBuildingIssues,pipeline}=vi.hoisted(()=>({ingest:vi.fn(),getBuildingIssues:vi.fn(),pipeline:vi.fn()}));
vi.mock('../../data-pipeline/lib/ingest.js',()=>({ingest}));
vi.mock('../../data-pipeline/lib/issues.js',()=>({getBuildingIssues}));
vi.mock('../../src/lib/db',()=>({pipeline}));
import {getReport,getIdentity} from '../../src/lib/reports';
import {GET} from '../../src/app/api/buildings/[id]/route';
import {ApiClient,ApiHousingDataProvider} from '../../frontend/src/services/api';

const geom=(()=>{const b=Buffer.alloc(25);b[0]=1;b.writeUInt32LE(0x20000001,1);b.writeUInt32LE(4326,5);b.writeDoubleLE(-73.95,9);b.writeDoubleLE(40.68,17);return b.toString('hex');})();
const row={bbl:'3012340056',bin:'3000001',address:'100 EXAMPLE AVENUE, Brooklyn, NY, USA',borough:'Brooklyn',geom,units_res:24};
const issue={source:'hpd_violation',sourceId:'v1',bbl:row.bbl,category:'heat',severity:3,status:'open',observedAt:'2026-10-01T10:00:00',description:'No heat',raw:{bin:3000001}};
// Minimal Supabase client: from('buildings').select().eq('bbl', id).maybeSingle()
let stored:typeof row|null;
const db={from:()=>({select:()=>({eq:(_:string,id:string)=>({maybeSingle:async()=>({data:stored?.bbl===id?stored:null,error:null})})})})};
beforeEach(()=>{vi.resetAllMocks();stored=row;pipeline.mockReturnValue(db);ingest.mockResolvedValue([]);
  getBuildingIssues.mockResolvedValue({issues:[issue],building:{bin:'3000001',matched:true,issues:[issue],headline:'building',note:null},noise:[],
    sources:['hpd_violation','hpd_complaint','rodent','bedbug','311'].map(source=>({source,status:'ok',lastSuccessAt:'2026-11-14T12:00:00Z'}))});});

it('returns null for an unknown BBL without ingesting',async()=>{stored=null;expect(await getReport('3012340056')).toBeNull();expect(await getIdentity('3012340056')).toBeNull();expect(ingest).not.toHaveBeenCalled();});
it('returns null for non-BBL IDs without touching the database',async()=>{expect(await getReport('nyc-0123456789abcdef01234567')).toBeNull();expect(pipeline).not.toHaveBeenCalled();});
it('ingests stale sources, then reads issues for a known BBL',async()=>{
  const report=await getReport(row.bbl);
  expect(ingest).toHaveBeenCalledWith({bbl:row.bbl,bin:row.bin,lat:40.68,lon:-73.95},db,{force:false});
  expect(getBuildingIssues).toHaveBeenCalledWith(row.bbl,db,{bin:row.bin});
  expect(report!.records.map(e=>e.id)).toEqual(['hpd_violation:v1']);
  await getReport(row.bbl,true);expect(ingest).toHaveBeenLastCalledWith(expect.anything(),db,{force:true});
});
it('throws PERSISTENCE_UNAVAILABLE without a pipeline database',async()=>{pipeline.mockReturnValue(null);await expect(getReport(row.bbl)).rejects.toThrow('PERSISTENCE_UNAVAILABLE');});
it('serves a report that the frontend API client accepts, and 404s unknown buildings',async()=>{
  const route=(url:string)=>GET(new Request('http://localhost'+url),{params:Promise.resolve({id:decodeURIComponent(url.split('/').pop()!)})});
  const provider=new ApiHousingDataProvider(new ApiClient('http://localhost/api',(input=>route(String(input).replace('http://localhost','')) ) as typeof fetch));
  const report=await provider.getBuildingReport(row.bbl);
  expect(report).toBeTruthy();
  stored=null;await expect(provider.getBuildingReport(row.bbl)).rejects.toMatchObject({status:404});
});
it('still serves demo reports',async()=>{expect((await getReport('demo-1'))!.demo).toBe(true);expect((await getIdentity('demo-2'))!.demo).toBe(true);});
