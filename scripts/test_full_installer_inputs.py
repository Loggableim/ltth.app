import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import full_installer_inputs as api

@unittest.skipUnless(os.name == 'nt', 'Windows lock fixtures')
class FullInputTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='ltth-full-inputs-synthetic-')
        self.root=Path(self.temp.name);self.sources=self.root/'sources';self.sources.mkdir()
        inputs=[]
        for role in sorted(api.REQUIRED):
            path=self.sources/(role+'.synthetic');data=('synthetic:'+role).encode();path.write_bytes(data)
            inputs.append({'name':role,'role':role,'root':'fixture','path':path.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
        self.manifest={'name':'FULL_INSTALLER_INPUTS','schemaVersion':1,'sourceCommit':'a'*40,
            'toolchain':{'nsisVersion':'synthetic-not-executed','pythonVersion':'synthetic-label','nodeVersion':'synthetic-label','windowsTarget':'synthetic-windows'},
            'closure':'declared-not-compiler-resolved','inputs':inputs}
        self.roots={'fixture':self.sources}
    def tearDown(self):self.temp.cleanup()
    def test_reviewable_synthetic_json_matches_generated_inputs(self):
        example = Path(__file__).resolve().parents[1] / 'docs/coordination/full-installer-inputs.synthetic.json'
        self.assertEqual(json.loads(example.read_text()), self.manifest)
        with api.locked_manifest(json.loads(example.read_text()), self.roots) as result:
            self.assertFalse(result['installerReady'])
    def test_explicit_inventory_locked_while_concurrent_child_attempts_write_delete(self):
        target=self.sources/self.manifest['inputs'][0]['path'];before=target.read_bytes()
        child=self.root/'fake.py';report=self.root/'result.json'
        child.write_text("""import pathlib,json,sys
p=pathlib.Path(sys.argv[1]);r={}
for action in ['write','delete','rename']:
 try:
  if action=='write':p.write_bytes(b'drift')
  elif action=='delete':p.unlink()
  else:p.rename(p.with_name('changed'))
  r[action]='UNSAFE'
 except OSError:r[action]='blocked'
r['read']=bool(p.read_bytes());pathlib.Path(sys.argv[2]).write_text(json.dumps(r))
""")
        with api.locked_manifest(self.manifest,self.roots) as result:
            self.assertFalse(result['installerReady']);self.assertEqual(result['inputCount'],len(api.REQUIRED))
            subprocess.run([sys.executable,'-B',str(child),str(target),str(report)],check=True)
            self.assertEqual(json.loads(report.read_text()),{'write':'blocked','delete':'blocked','rename':'blocked','read':True})
        self.assertEqual(target.read_bytes(),before);target.write_bytes(b'after release')
    def test_hash_missing_and_size_fail_before_callback(self):
        for mode in ['hash','missing','size']:
            with self.subTest(mode=mode):
                candidate=copy.deepcopy(self.manifest)
                if mode=='hash':candidate['inputs'][0]['sha256']='0'*64
                if mode=='missing':candidate['inputs'][0]['path']='missing'
                if mode=='size':candidate['inputs'][0]['bytes']+=1
                reached=False
                with self.assertRaises((ValueError,OSError)):
                    with api.locked_manifest(candidate,self.roots):reached=True
                self.assertFalse(reached)
                # Earlier acquired handles are closed after every failure.
                target=self.sources/self.manifest['inputs'][0]['path'];original=target.read_bytes();target.write_bytes(original)
    def test_paths_wildcards_controls_unknown_root_and_missing_roles_rejected(self):
        for value in ['../escape','C:/escape','nested/../escape','*.json','x?file','x\n!include bad','x\r!define BAD','x\\file']:
            candidate=copy.deepcopy(self.manifest);candidate['inputs'][0]['path']=value
            with self.assertRaises((ValueError,OSError)):api.validate_manifest(candidate,self.roots)
        candidate=copy.deepcopy(self.manifest);candidate['inputs'][0]['root']='undeclared'
        with self.assertRaises(ValueError):api.validate_manifest(candidate,self.roots)
        candidate=copy.deepcopy(self.manifest);candidate['inputs'].pop()
        with self.assertRaises(ValueError):api.validate_manifest(candidate,self.roots)
    def test_reparse_root_cannot_redirect_byte_identical_inputs(self):
        outside=self.root/'external';self.sources.rename(outside)
        result=subprocess.run(['cmd.exe','/d','/c','mklink','/J',str(self.sources),str(outside)],capture_output=True)
        self.assertEqual(result.returncode,0)
        before={p.name:p.read_bytes() for p in outside.iterdir()}
        try:
            with self.assertRaises(ValueError):api.validate_manifest(self.manifest,self.roots)
            self.assertEqual(before,{p.name:p.read_bytes() for p in outside.iterdir()})
        finally:os.rmdir(self.sources);outside.rename(self.sources)
    def test_body_exception_releases_all_handles(self):
        with self.assertRaises(RuntimeError):
            with api.locked_manifest(self.manifest,self.roots):raise RuntimeError('synthetic failure')
        for p in self.sources.iterdir():p.write_bytes(p.read_bytes())
    def test_duplicate_paths_and_false_resolved_claim_rejected(self):
        candidate=copy.deepcopy(self.manifest);candidate['inputs'][1]['path']=candidate['inputs'][0]['path']
        with self.assertRaises(ValueError):api.validate_manifest(candidate,self.roots)
        candidate=copy.deepcopy(self.manifest);candidate['closure']='compiler-resolved'
        with self.assertRaises(ValueError):api.validate_manifest(candidate,self.roots)

if __name__=='__main__':unittest.main()
