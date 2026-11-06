import 'server-only';
import {createServerClient} from '@supabase/ssr';import {cookies} from 'next/headers';import {supabaseConfig} from '../auth/config';
export async function createClient(writable=false){const config=supabaseConfig();if(!config)return null;const jar=await cookies();return createServerClient(config.url,config.key,{cookies:{getAll:()=>jar.getAll(),setAll:items=>{if(!writable)return;for(const {name,value,options}of items)jar.set(name,value,options);}}});}
