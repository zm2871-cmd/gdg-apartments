import {z} from 'zod';
export const datasets={registrations:'tesw-yqqr',violations:'wvxf-dwi5',bedbugs:'wz6d-d3jb',rodents:'p937-wjvj',requests:'erm2-nwe9',pluto:'64uk-42ks'} as const;
export type Source=keyof typeof datasets;
export const sourceNames:Record<Source,string>={registrations:'HPD registrations',violations:'HPD violations',bedbugs:'HPD bedbug filings',rodents:'DOHMH rodent inspections',requests:'NYC 311 requests',pluto:'DCP PLUTO'};
export const sourceUrl=(s:Source)=>`https://data.cityofnewyork.us/d/${datasets[s]}`;
const hosts=new Set(['data.cityofnewyork.us','geosearch.planninglabs.nyc']);
export async function officialFetch(url:string){const parsed=new URL(url);if(parsed.protocol!=='https:'||!hosts.has(parsed.hostname))throw new Error('Unapproved source');for(let i=0;i<3;i++){try{const r=await fetch(url,{headers:process.env.NYC_SOCRATA_APP_TOKEN&&parsed.hostname==='data.cityofnewyork.us'?{'X-App-Token':process.env.NYC_SOCRATA_APP_TOKEN}:{},signal:AbortSignal.timeout(9000),next:{revalidate:900}});if(r.ok)return await r.json();if(r.status!==429&&r.status<500)throw new Error('Source unavailable');}catch{if(i===2)throw new Error('Source unavailable');}await new Promise(r=>setTimeout(r,250*2**i));}throw new Error('Source unavailable');}
export async function soda(source:Source,where:string,limit=200,offset=0,order=':id'){if(!(source in datasets))throw new Error('Unapproved dataset');const u=new URL(`https://data.cityofnewyork.us/resource/${datasets[source]}.json`);u.search=new URLSearchParams({'$where':where,'$limit':String(Math.min(500,limit)),'$offset':String(offset),'$order':order}).toString();return z.array(z.record(z.string(),z.unknown())).parse(await officialFetch(u.toString()));}
export const numeric=(s:string)=>{if(!/^\d{1,10}$/.test(s))throw new Error('Invalid official identifier');return s;};
export const literal=(s:string)=>`'${s.replaceAll("'","''")}'`;
