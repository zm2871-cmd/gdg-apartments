import {LeaseDetail} from '@/components/LeaseChecker';export default async function Page({params}:{params:Promise<{id:string}>}){return <LeaseDetail id={(await params).id}/>;}
