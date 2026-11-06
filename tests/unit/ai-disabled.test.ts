import {afterEach,it,expect,vi} from 'vitest';
import {advice} from '../../src/lib/ai';
import {demoReport} from '../../src/lib/demo';
import {defaultWeights} from '../../src/lib/domain';
vi.mock('../../src/lib/reports',()=>({getReport:async(id:string)=>demoReport(id)}));
import {POST} from '../../src/app/api/advisor/route';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('cannot call AI even with credentials and enabled environment flags',async()=>{
 vi.stubEnv('OPENAI_API_KEY','synthetic-test-key');vi.stubEnv('OPENAI_MODEL','test-model');vi.stubEnv('AI_ENABLED','true');vi.stubEnv('LEASE_AI_ENABLED','true');
 const network=vi.fn(()=>{throw new Error('Network calls prohibited');});vi.stubGlobal('fetch',network);
 const result=await advice([demoReport('demo-1')!,demoReport('demo-2')!],defaultWeights);
 expect(result.mode).toBe('deterministic');expect(network).not.toHaveBeenCalled();
 const response=await POST(new Request('http://localhost/api/advisor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:['demo-1','demo-2'],weights:defaultWeights,consent:true,useAI:true})}));
 expect(response.status).toBe(200);expect((await response.json()).mode).toBe('deterministic');expect(network).not.toHaveBeenCalled();
});
