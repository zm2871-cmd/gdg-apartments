import {buildingId} from '@/lib/domain';import {getReport} from '@/lib/reports';import {guard,json,failure} from '@/lib/security';
// getReport ingests stale sources first; a cold 311 fetch can take ~9 s per building.
export const maxDuration=60;
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{guard(req);const id=buildingId.parse((await params).id);const r=await getReport(id);if(!r)throw new Error('NOT_FOUND');return json(r);}catch(e){return failure(e);}}
