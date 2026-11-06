import {z} from 'zod';
import {buildingAdvice} from '@/lib/building-advice';
import {getReport} from '@/lib/reports';
import {guard, json, failure} from '@/lib/security';

export const runtime = 'nodejs';
export const maxDuration = 60;
const inputSchema = z.object({
  buildingId: z.string().trim().min(3).max(150),
  question: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request) {
  try {
    guard(request);
    let body: unknown;
    try { body = await request.json(); }
    catch { return json({error: {message: 'Please send a valid JSON request.'}},400); }
    const {buildingId, question} = inputSchema.parse(body);
    const report = await getReport(buildingId);
    if (!report) return json({error: {message: 'Building report not found.'}},404);
    if (report.demo || report.identity.demo || buildingId.startsWith('demo-')) {
      return json({error: {message: 'AI advice is available only for live building reports.'}},400);
    }
    return json({...await buildingAdvice(report,question), buildingId, checkedAt: report.checkedAt});
  } catch (error) {
    return failure(error);
  }
}
