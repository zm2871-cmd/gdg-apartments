import {z} from 'zod';
const claimsSchema=z.object({sub:z.string().min(1),exp:z.number(),amr:z.array(z.object({method:z.string(),timestamp:z.number()})).optional()});
// Input MUST come from Supabase getClaims(), never decoded client JWTs or user metadata.
// Recovery uses Supabase's PKCE exchange, whose signed AMR method is "recovery".
export function isRecentRecovery(claims:unknown,nowSeconds=Date.now()/1000){const parsed=claimsSchema.safeParse(claims);return parsed.success&&parsed.data.exp>nowSeconds&&Boolean(parsed.data.amr?.some(a=>a.method==='recovery'&&a.timestamp<=nowSeconds+30&&nowSeconds-a.timestamp<=3600));}
