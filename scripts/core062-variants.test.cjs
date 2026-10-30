"use strict";
const assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),Module=require('node:module');
const file='lib/asarvo/core059-variant.ts';
const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m=new Module(file,module);m.filename=file;m.paths=module.paths;m._compile(js,file);
const fn=m.exports.checkExplicitCapacityConflict;
const cases=[
 ['reject 1TB requested 2TB','Samsung 990 PRO 2TB','Samsung 990 PRO 1TB',true],
 ['accept 2TB requested 2TB','Samsung 990 PRO 2TB','Samsung 990 PRO 2TB',false],
 ['accept 2000 GB alias','Samsung 990 PRO 2TB','Samsung 990 PRO 2000 GB',false],
 ['no phantom from no size','Samsung SSD','Samsung SSD 1TB',false],
 ['accept absent offer size','Samsung 990 PRO 2TB','Samsung 990 PRO SSD',false],
 ['ambiguous bundle held','Samsung 990 PRO 2TB','Samsung 990 PRO 2TB + 1TB',false],
 ['reject 500GB for 1TB','Samsung SSD 1TB','Samsung SSD 500GB',true],
 ['no RAM false rejection','Laptop 16GB RAM 1TB SSD','Laptop 16GB RAM 1TB SSD',false]
];
for(const [name,q,o,reject] of cases){assert.equal(fn(q,o).conflict,reject,name);console.log('PASS '+name)}
console.log('CORE062_LANE1_TESTS='+cases.length);
