'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const file='lib/asarvo/core059-variant.ts';const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;mod._compile(js,file);
const fn=mod.exports.checkExplicitCapacityConflict;
const cases=[
 ['same TB','Samsung 990 PRO 2TB','Samsung 990 PRO 2 TB',false,'single_match'],
 ['wrong TB','Samsung 990 PRO 2TB','Samsung 990 PRO 1TB',true,'explicit_conflict'],
 ['GB alias','Samsung 990 PRO 2TB','Samsung 990 PRO 2000 GB',false,'single_match'],
 ['wrong GB','Samsung 990 PRO 1TB','Samsung 990 PRO 500 GB',true,'explicit_conflict'],
 ['missing request','Samsung SSD','Samsung 990 PRO 2TB',false,'no_capacity'],
 ['missing offer','Samsung 990 PRO 2TB','Samsung 990 PRO',false,'no_capacity'],
 ['ambiguous bundle','SSD 1 TB','SSD 1TB + 2TB',false,'ambiguous'],
 ['decimal comma','SSD 1,5 TB','SSD 1500 GB',false,'single_match'],
 ['partial token','SSD 1TB','SSD 11TB',true,'explicit_conflict'],
 ['bad digits','SSD 1TB','SSD 0TB',false,'no_capacity'],
 ['double request','SSD 1TB 2TB','SSD 1TB',false,'ambiguous'],
 ['no false positive RAM','Laptop 16 GB RAM 1TB SSD','Laptop 16GB RAM 1TB SSD',false,'ambiguous'],
];
for(const [name,q,o,conflict,reason] of cases){const r=fn(q,o);assert.equal(r.conflict,conflict,name);assert.equal(r.reason,reason,name);console.log('PASS '+name)}
console.log('CORE059_LANE1_TESTS='+cases.length);
