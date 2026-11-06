import 'server-only';
import {type Report, type Category} from './domain';import {compare} from './scoring';
// AI BILLING LOCK: this module performs no network or model calls.
// Adding OPENAI_API_KEY or setting AI_ENABLED cannot enable AI.
// Re-enabling requires a reviewed code change and explicit owner authorization.
export async function advice(reports:Report[],weights:Record<Category,number>){const comparison=compare(reports,weights);const fallback={mode:'deterministic',summary:comparison.recommendedBuildingId?'The synthetic comparison favors the lowest weighted risk percentile among shared categories.':'There is not enough comparable evidence to rank these buildings. Review the records and ask about unresolved conditions.',recommendedBuildingId:comparison.recommendedBuildingId,considerations:reports.map(r=>({buildingId:r.identity.id,statement:`${r.records.length} records returned; ${r.coverage.filter(c=>c.status==='ok').length} sources responded successfully.`,supportingRecordIds:[],caveat:'Counts alone do not account for building size or reporting differences.'})),unansweredQuestions:['Which reported conditions remain unresolved?','What repairs have been completed since the last inspection?'],limitations:['Public records are incomplete and may lag current conditions.','No assessment of a specific apartment or guarantee of safety.']};
 return fallback;
}
