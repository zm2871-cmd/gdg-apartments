import {it,expect} from 'vitest';import {buildingId,compareSchema} from '../../src/lib/domain';
it('accepts BBLs and demo IDs',()=>{for(const id of ['3012340056','1000010001','demo-1','demo-3'])expect(buildingId.safeParse(id).success).toBe(true);});
it('rejects old nyc- IDs, borough 0, wrong lengths and other demos',()=>{for(const id of ['nyc-0123456789abcdef01234567','0000000000','30123400561','301234005','demo-4',' 3012340056'])expect(buildingId.safeParse(id).success).toBe(false);});
it('compareSchema uses the same rule',()=>{expect(compareSchema.safeParse({ids:['3012340056','1000010001']}).success).toBe(true);expect(compareSchema.safeParse({ids:['3012340056','nyc-x']}).success).toBe(false);});
