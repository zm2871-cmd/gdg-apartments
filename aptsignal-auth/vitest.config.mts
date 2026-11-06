import {defineConfig} from 'vitest/config';import {fileURLToPath} from 'node:url';
export default defineConfig({resolve:{alias:{'server-only':fileURLToPath(new URL('./tests/empty.ts',import.meta.url))}},test:{include:['tests/unit/**/*.test.ts','tests/components/**/*.test.tsx'],environment:'node',setupFiles:['./tests/setup.ts']}});
