'use client';
import {createBrowserClient} from '@supabase/ssr';import {supabaseConfig} from '../auth/config';
export function createClient(){const config=supabaseConfig();if(!config)throw new Error('AUTH_CONFIGURATION');return createBrowserClient(config.url,config.key);}
