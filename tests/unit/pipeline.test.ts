import {it,expect} from 'vitest';
import {toReport,toIdentity,type BuildingIssues,type BuildingRow} from '../../src/lib/pipeline';
import {identitySchema} from '../../src/lib/domain';
import {score} from '../../src/lib/scoring';

// PostGIS EWKB hex for an SRID 4326 point, as Supabase returns it.
function ewkb(lat:number,lon:number){const b=Buffer.alloc(25);b[0]=1;b.writeUInt32LE(0x20000001,1);b.writeUInt32LE(4326,5);b.writeDoubleLE(lon,9);b.writeDoubleLE(lat,17);return b.toString('hex');}
const building:BuildingRow={bbl:'3012340056',bin:'3000001',address:'100 EXAMPLE AVENUE, Brooklyn, NY, USA',borough:'Brooklyn',geom:ewkb(40.68,-73.95),units_res:24};
const base={bbl:'3012340056',status:'open' as const,observedAt:'2026-10-01T10:00:00',description:'Issue'};
const violation={...base,source:'hpd_violation' as const,sourceId:'v1',category:'repairs' as const,severity:3 as const,raw:{bin:3000001}};
const complaint={...base,source:'hpd_complaint' as const,sourceId:'c1',category:'heat' as const,severity:2 as const,status:'closed' as const,raw:{bin:3000002}};
const rodent={...base,source:'rodent' as const,sourceId:'r1',category:'pests' as const,severity:1 as const,lat:40.681,lon:-73.951,raw:{bin:3000001}};
const bedbug={...base,source:'bedbug' as const,sourceId:'b1',category:'bedbugs' as const,severity:2 as const,raw:{}};
const undated={...violation,sourceId:'v2',observedAt:null};
const noise={...base,source:'311' as const,sourceId:'n1',category:'noise' as const,severity:1 as const,raw:{complaint_type:'Noise - Residential'},distanceM:40,sourceIds:['n1','n2','n3'],count:3};
const issues:BuildingIssues={
  issues:[violation,complaint,rodent,bedbug,undated],
  building:{bin:'3000001',matched:true,issues:[violation,rodent,undated],headline:'building',note:null},
  noise:[noise],
  sources:[
    {source:'hpd_violation',status:'ok',lastSuccessAt:'2026-11-14T12:00:00Z'},
    {source:'hpd_complaint',status:'stale',lastSuccessAt:'2026-11-01T12:00:00Z'},
    {source:'rodent',status:'failed',error:'HTTP 500'},
    {source:'bedbug',status:'missing'},
    {source:'311',status:'ok',lastSuccessAt:'2026-11-14T12:00:00Z'},
  ],
};
const now=new Date('2026-11-15T12:00:00Z');
const report=toReport(building,issues,now);
const byId=Object.fromEntries(report.records.map(e=>[e.id,e]));

it('builds a valid identity from the building row',()=>{
  const identity=identitySchema.parse(report.identity);
  expect(identity).toMatchObject({id:'3012340056',bbl:'3012340056',bin:'3000001',borough:'Brooklyn',confidence:'building',lotUnits:24});
  expect(identity.lat).toBeCloseTo(40.68);expect(identity.lng).toBeCloseTo(-73.95);
  expect(toReport(building,{...issues,building:{...issues.building!,matched:false}},now).identity.confidence).toBe('tax_lot');
});
it('maps a search match to an identity',()=>{
  expect(identitySchema.parse(toIdentity({label:'1 MAIN ST, Bronx',bbl:'2000010001',bin:null,borough:null,lat:40.8,lon:-73.9}))).toMatchObject({id:'2000010001',address:'1 MAIN ST, Bronx',borough:'Unknown',confidence:'tax_lot'});
});
it('maps category, kind, scope and severity',()=>{
  expect(Object.keys(byId).sort()).toEqual(['311:n1','bedbug:b1','hpd_complaint:c1','hpd_violation:v1','rodent:r1']); // undated v2 dropped
  expect(byId['hpd_violation:v1']).toMatchObject({category:'maintenance',kind:'violation',scope:'building',severity:6,source:'HPD violations',url:'https://data.cityofnewyork.us/d/wvxf-dwi5',externalId:'v1',positive:true});
  expect(byId['hpd_complaint:c1']).toMatchObject({category:'heat',kind:'complaint',scope:'tax_lot',severity:3,status:'closed'});
  expect(byId['rodent:r1']).toMatchObject({category:'pests',kind:'inspection',scope:'building',severity:1,lat:40.681,lng:-73.951});
  expect(byId['bedbug:b1']).toMatchObject({category:'bedbugs',kind:'filing',scope:'tax_lot',severity:3});
  expect(byId['311:n1']).toMatchObject({category:'noise',kind:'complaint',scope:'nearby',description:'Issue (3 reports)'});
});
it('maps coverage status, time and counts',()=>{
  expect(report.coverage.map(c=>[c.source,c.status,c.count])).toEqual([['HPD violations','ok',1],['HPD complaints','stale',1],['DOHMH rodent inspections','error',1],['HPD bedbug filings','unmatched',1],['NYC 311 requests','ok',1]]);
  expect(report.coverage[2]).toMatchObject({checkedAt:now.toISOString(),message:'HTTP 500'});
  expect(report.coverage[1].checkedAt).toBe('2026-11-01T12:00:00Z');
});
it('scores the records',()=>{
  expect(()=>score(report.records,false,undefined,now)).not.toThrow();
  expect(report.scores.find(s=>s.category==='maintenance')!.count).toBe(1);
  expect(report.demo).toBe(false);
});
