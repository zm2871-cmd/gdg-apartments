import 'server-only';
import {redirect} from 'next/navigation';import {createClient} from '../supabase/server';import {isRecentRecovery} from './recovery';import {signInDestination} from './navigation';
export async function verifiedSession(writable=false){const supabase=await createClient(writable);if(!supabase)return null;try{const {data:claimsData,error:claimsError}=await supabase.auth.getClaims();if(claimsError||!claimsData?.claims?.sub)return null;const {data:{user},error}=await supabase.auth.getUser();if(error||!user||user.id!==claimsData.claims.sub||!user.email_confirmed_at)return null;return {supabase,user,claims:claimsData.claims};}catch{return null;}}
export async function requireUser(){const session=await verifiedSession();if(!session)redirect(signInDestination());return session;}
export async function recoverySession(writable=false){const session=await verifiedSession(writable);return session&&isRecentRecovery(session.claims)?session:null;}
