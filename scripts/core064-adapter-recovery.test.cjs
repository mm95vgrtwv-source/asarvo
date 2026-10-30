const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(__dirname, '../lib/asarvo/core064-adapter-recovery.ts');
const js = ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const compiled = new Module(filename, module); compiled.filename=filename; compiled.paths=module.paths; compiled._compile(js,filename);
const classify = compiled.exports.classifyAdapterRecovery;
const tests = [
 ['200 with verified products', {status:200,validProductCount:5}, 'healthy', false, true],
 ['200 zero parse', {status:200,validProductCount:0}, 'parse_zero', false, false],
 ['403 blocked', {status:403}, 'blocked', false, false],
 ['451 blocked', {status:451}, 'blocked', false, false],
 ['401 auth', {status:401}, 'auth_required', false, false],
 ['404 endpoint', {status:404}, 'not_found', false, false],
 ['429 no retry after', {status:429}, 'rate_limited', false, false],
 ['429 large retry after', {status:429,retryAfterSeconds:120}, 'rate_limited', false, false],
 ['429 bounded retry', {status:429,retryAfterSeconds:2}, 'rate_limited', true, false],
 ['503 one retry', {status:503}, 'temporary', true, false],
 ['503 no second retry', {status:503,retryOrdinal:1}, 'temporary', false, false],
 ['timeout one retry', {timedOut:true}, 'network_error', true, false],
 ['invalid count', {status:200,validProductCount:-1}, 'client_error', false, false],
 ['unsupported client error', {status:400}, 'client_error', false, false],
];
for(const [label,input,kind,retry,working] of tests){const r=classify(input);assert.equal(r.kind,kind);assert.equal(r.allowRetry,retry);assert.equal(r.countAsWorkingStore,working);console.log('PASS '+label)}
console.log('CORE064_RECOVERY_TESTS='+tests.length);
