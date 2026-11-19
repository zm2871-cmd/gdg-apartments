import {it,expect,vi,beforeEach} from 'vitest';
const {searchAddress,resolveBuilding,pipeline}=vi.hoisted(()=>({searchAddress:vi.fn(),resolveBuilding:vi.fn(),pipeline:vi.fn()}));
vi.mock('../../data-pipeline/lib/geosearch.js',()=>({searchAddress}));
vi.mock('../../data-pipeline/lib/building.js',()=>({resolveBuilding}));
vi.mock('../../src/lib/db',()=>({pipeline}));
import {GET} from '../../src/app/api/address/resolve/route';
import {identitySchema} from '../../src/lib/domain';
const get=(q:string)=>GET(new Request(`http://localhost/api/address/resolve?${new URLSearchParams({q})}`));
const match={label:'100 EXAMPLE AVENUE, Brooklyn, NY, USA',bbl:'3012340056',bin:'3000001',borough:'Brooklyn',lat:40.68,lon:-73.95};
// EWKB hex for POINT(-73.95 40.68), SRID 4326, as the upsert's select returns it.
const geom=(()=>{const b=Buffer.alloc(25);b[0]=1;b.writeUInt32LE(0x20000001,1);b.writeUInt32LE(4326,5);b.writeDoubleLE(-73.95,9);b.writeDoubleLE(40.68,17);return b.toString('hex');})();
const db={};
beforeEach(()=>{vi.resetAllMocks();pipeline.mockReturnValue(db);searchAddress.mockResolvedValue([{...match,label:'100 EXAMPLE AVENUE EAST, Brooklyn, NY, USA',bbl:'3012340057'},match]);resolveBuilding.mockResolvedValue({bbl:match.bbl,bin:match.bin,address:match.label,borough:'Brooklyn',geom,units_res:24});});
it('upserts the exact match and returns its identity',async()=>{
  const r=await get('100 example avenue, brooklyn, ny, usa');expect(r.status).toBe(200);
  expect(resolveBuilding).toHaveBeenCalledWith(match,db);
  expect(identitySchema.parse(await r.json())).toMatchObject({id:'3012340056',address:match.label,lotUnits:24,confidence:'building'});
});
it('404s on a near match without writing',async()=>{
  const r=await get('100 example ave, brooklyn');expect(r.status).toBe(404);
  expect((await r.json()).error.code).toBe('NO_EXACT_MATCH');expect(resolveBuilding).not.toHaveBeenCalled();
});
it('503s when the pipeline database is not configured',async()=>{
  pipeline.mockReturnValue(null);const r=await get(match.label);expect(r.status).toBe(503);expect(searchAddress).not.toHaveBeenCalled();
});
