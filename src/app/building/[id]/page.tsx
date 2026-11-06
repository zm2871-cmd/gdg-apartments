import {notFound} from 'next/navigation';import {getReport} from '@/lib/reports';import ReportView from '@/components/ReportView';
export const dynamic='force-dynamic';export default async function Building({params}:{params:Promise<{id:string}>}){const report=await getReport((await params).id);if(!report)notFound();return <ReportView report={report}/>;}
