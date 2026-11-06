import {demoReport,demoIdentities} from '../src/lib/demo';
for(const i of demoIdentities){const r=demoReport(i.id)!;console.log(`${i.id}: ${i.address}, ${r.records.length} synthetic records`);}console.log('Demo fixtures are deterministic code; no official database rows are inserted.');
