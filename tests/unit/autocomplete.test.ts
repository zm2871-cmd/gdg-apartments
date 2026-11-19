import {it,expect,vi,beforeEach} from 'vitest';
const {searchAddress}=vi.hoisted(()=>({searchAddress:vi.fn()}));
vi.mock('../../data-pipeline/lib/geosearch.js',()=>({searchAddress}));
import {GET} from '../../src/app/api/address/autocomplete/route';
import {identitySchema} from '../../src/lib/domain';
const get=(q:string)=>GET(new Request(`http://localhost/api/address/autocomplete?${new URLSearchParams({q})}`));
beforeEach(()=>{searchAddress.mockReset();searchAddress.mockResolvedValue([{label:'100 EXAMPLE AVENUE, Brooklyn, NY, USA',bbl:'3012340056',bin:'3000001',borough:'Brooklyn',lat:40.68,lon:-73.95}]);});
it('rejects queries under 3 characters without calling GeoSearch',async()=>{const r=await get('ab');expect(r.status).toBe(400);expect(searchAddress).not.toHaveBeenCalled();});
it('returns GeoSearch matches as identities keyed by BBL',async()=>{
  const r=await get('  100 example ave ');expect(r.status).toBe(200);expect(searchAddress).toHaveBeenCalledWith('100 example ave');
  const {candidates}=await r.json();expect(candidates).toHaveLength(1);
  expect(identitySchema.parse(candidates[0])).toMatchObject({id:'3012340056',bbl:'3012340056',address:'100 EXAMPLE AVENUE, Brooklyn, NY, USA',borough:'Brooklyn',lat:40.68,lng:-73.95,confidence:'building'});
});
it('turns a GeoSearch failure into a 502',async()=>{searchAddress.mockRejectedValueOnce(new Error('GeoSearch "x": HTTP 500'));expect((await get('100 example')).status).toBe(502);});
