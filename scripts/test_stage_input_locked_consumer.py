"""One Windows-only synthetic reading consumer versus concurrent mutation fixture."""
import hashlib
import json
import os
from pathlib import Path
import unittest
import test_two_receipt_installer as fixtures

@unittest.skipUnless(os.name == 'nt', 'Windows handle sharing required')
class LockedConsumerTest(unittest.TestCase):
    def test_consumer_reads_pinned_bytes_parallel_mutation_denied_then_unlocks(self):
        fixture=fixtures.TwoReceiptTests();fixture.setUp()
        try:
            appfile=fixture.stage/'app/package.json';fullfile=fixture.sources/'launcher.synthetic'
            targets=[appfile,fullfile];expected={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in targets}
            report=fixture.root/'read-mutate-report.json'
            fixture.fake.write_text('''import hashlib,json,pathlib,subprocess,sys
expected='''+repr(expected)+'''
report=pathlib.Path('''+repr(str(report))+''')
writer="""import pathlib,json,sys
results={}
for name in json.loads(sys.argv[1]):
 p=pathlib.Path(name);actions={}
 for action in ('write','delete','rename'):
  try:
   if action=='write':p.write_bytes(b'UNSAFE')
   elif action=='delete':p.unlink()
   else:p.rename(p.with_name(p.name+'.UNSAFE'))
   actions[action]='UNSAFE'
  except OSError:actions[action]='denied'
 results[name]=actions
pathlib.Path(sys.argv[2]).write_text(json.dumps(results))
"""
mutation_report=report.with_name('mutation.json')
child=subprocess.Popen([sys.executable,'-B','-c',writer,json.dumps(list(expected)),str(mutation_report)])
reads={name:hashlib.sha256(pathlib.Path(name).read_bytes()).hexdigest() for name in expected}
code=child.wait(timeout=2)
reads_after={name:hashlib.sha256(pathlib.Path(name).read_bytes()).hexdigest() for name in expected}
report.write_text(json.dumps({'reads':reads,'reads_after':reads_after,'mutations':json.loads(mutation_report.read_text()),'exit':code}))
''')
            fixture.profile['fakeSha256']=fixtures.api.digest(fixture.fake);fixture.save()
            all_inputs=[fixture.fake,fixture.receipt,fixture.mpath,fixture.ppath,*fixture.sources.iterdir(),*[p for p in (fixture.stage/'app').rglob('*') if p.is_file()]]
            before={p:p.read_bytes() for p in all_inputs}
            result=fixture.run_fixture();observed=json.loads(report.read_text())
            self.assertFalse(result['installerReady']);self.assertEqual(observed['exit'],0)
            self.assertEqual(observed['reads'],expected);self.assertEqual(observed['reads_after'],expected)
            self.assertEqual(observed['mutations'],{str(p):{'write':'denied','delete':'denied','rename':'denied'} for p in targets})
            self.assertEqual(before,{p:p.read_bytes() for p in all_inputs})
            # Write opens after the consumer/job has exited prove lock release, without changing bytes.
            for p in all_inputs:p.write_bytes(before[p])
            self.assertEqual(before,{p:p.read_bytes() for p in all_inputs})
        finally:fixture.tearDown()

if __name__=='__main__':unittest.main()
