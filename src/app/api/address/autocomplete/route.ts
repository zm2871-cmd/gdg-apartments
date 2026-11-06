import {z} from 'zod';import {geocode} from '@/lib/nyc/geocode';import {guard,json,failure} from '@/lib/security';
export async function GET(req:Request){try{guard(req);const q=z.string().trim().min(3).max(120).parse(new URL(req.url).searchParams.get('q'));return json({candidates:await geocode(q)});}catch(e){return failure(e);}}
