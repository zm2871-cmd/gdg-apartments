import {z} from 'zod';import {searchAddress,toIdentity} from '@/lib/pipeline';import {guard,json,failure} from '@/lib/security';
// GeoSearch only; no database writes on a keystroke route (routes/SPEC.md decision 6).
export async function GET(req:Request){try{guard(req);const q=z.string().trim().min(3).max(120).parse(new URL(req.url).searchParams.get('q'));return json({candidates:(await searchAddress(q)).map(toIdentity)});}catch(e){return failure(e);}}
