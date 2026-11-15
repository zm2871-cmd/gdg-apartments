import {compareSchema,type Report} from '@/lib/domain';import {getReport} from '@/lib/reports';import {advice} from '@/lib/ai';import {guard,json,failure} from '@/lib/security';
// getReport ingests stale sources first; a cold 311 fetch can take ~9 s per building.
export const maxDuration=60;
export async function POST(req:Request){try{guard(req);const input=compareSchema.parse(await req.json());/* Legacy consent/AI fields cannot activate model calls. */const reports=await Promise.all(input.ids.map(id=>getReport(id)));if(reports.some(r=>!r))throw new Error('NOT_FOUND');if(new Set(reports.map(r=>r!.demo)).size>1)return json({error:{message:'Choose either live or synthetic reports.'}},400);return json(await advice(reports as Report[],input.weights));}catch(e){return failure(e);}}
