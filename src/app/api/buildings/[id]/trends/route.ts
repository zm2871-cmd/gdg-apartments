import {z} from 'zod';import {buildingId} from '@/lib/domain';import {getReport,trends} from '@/lib/reports';import {guard,json,failure} from '@/lib/security';
// getReport ingests stale sources first; a cold 311 fetch can take ~9 s per building.
export const maxDuration=60;
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{guard(req);const months=z.enum(['3','12','36']).parse(new URL(req.url).searchParams.get('window')??'12');const r=await getReport(buildingId.parse((await params).id));if(!r)throw new Error('NOT_FOUND');return json({points:trends(r,Number(months)),coverage:r.coverage,notice:'Counts by event month, not continuous observation or newly published records.'});}catch(e){return failure(e);}}
