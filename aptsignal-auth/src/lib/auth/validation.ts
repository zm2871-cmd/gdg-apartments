import {z} from 'zod';
const configuredLength=Number(process.env.NEXT_PUBLIC_AUTH_MIN_PASSWORD_LENGTH||8);
export const passwordPolicy={minLength:Number.isInteger(configuredLength)&&configuredLength>=8&&configuredLength<=64?configuredLength:8,complexity:true};
export const emailSchema=z.string().trim().email('Enter a valid email address.').max(254,'Email is too long.');
export const passwordSchema=z.string().min(passwordPolicy.minLength,`Use at least ${passwordPolicy.minLength} characters.`).max(128,'Use no more than 128 characters.').refine(value=>!passwordPolicy.complexity||(/[A-Z]/.test(value)&&/[0-9]/.test(value)&&/[^\p{L}\p{N}\s]/u.test(value)),{message:'Include an uppercase letter, a number, and a special character.'});
export const signInSchema=z.object({email:emailSchema,password:z.string().min(1,'Enter your password.').max(128,'Password is too long.'),next:z.string().max(200).optional()});
export const signUpSchema=z.object({fullName:z.string().trim().min(2,'Enter your full name.').max(100,'Use no more than 100 characters.'),email:emailSchema,password:passwordSchema,confirmPassword:z.string(),acceptTerms:z.boolean().refine(v=>v,{message:'Please acknowledge the draft Terms and Privacy notice.'})}).refine(v=>v.password===v.confirmPassword,{message:'Passwords must match.',path:['confirmPassword']});
export const resetSchema=z.object({email:emailSchema});
export const updatePasswordSchema=z.object({password:passwordSchema,confirmPassword:z.string()}).refine(v=>v.password===v.confirmPassword,{message:'Passwords must match.',path:['confirmPassword']});
export type SignInValues=z.infer<typeof signInSchema>;
export type SignUpValues=z.infer<typeof signUpSchema>;
export type ResetValues=z.infer<typeof resetSchema>;
export type UpdatePasswordValues=z.infer<typeof updatePasswordSchema>;
export function passwordStrength(value:string){return {score:[value.length>=passwordPolicy.minLength,/[A-Z]/.test(value),/\d/.test(value),/[^\p{L}\p{N}\s]/u.test(value)].filter(Boolean).length,valid:passwordSchema.safeParse(value).success};}
