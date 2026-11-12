import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
export const configured=()=>Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export function admin(){if(!configured()||!process.env.SUPABASE_SERVICE_ROLE_KEY)return null;return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
// The data pipeline's Supabase project (bbl-keyed buildings, google_places). Separate from the app's own schema.
export function pipeline(){const url=process.env.PIPELINE_SUPABASE_URL,key=process.env.PIPELINE_SUPABASE_SECRET_KEY;if(!url||!key)return null;return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});}
export async function session(){if(!configured())return null;const jar=await cookies();return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>jar.getAll(),setAll:values=>{try{values.forEach(({name,value,options})=>jar.set(name,value,options));}catch{/* Server component cookie writes are performed by auth handlers. */}}}});}
export async function requireUser(){const db=await session();if(!db)throw new Error('AUTH_UNAVAILABLE');const {data:{user},error}=await db.auth.getUser();if(error||!user)throw new Error('UNAUTHORIZED');return {db,user};}
