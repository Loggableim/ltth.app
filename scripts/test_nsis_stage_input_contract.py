import copy
import hashlib
import os
from pathlib import Path
import tempfile
import unittest
import nsis_stage_input_contract as api

class StageContractTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='ltth-nsis-contract-only-');self.root=Path(self.temp.name)
        entries=[]
        for name,role,target in [('tools/makensis.exe','compiler',None),('build/installer.nsi','nsis-script',None),('runtime/server.js','runtime','app/server.js'),('runtime/launcher.exe','launcher','launcher.exe')]:
            path=self.root/name;path.parent.mkdir(parents=True,exist_ok=True);data=('synthetic-only:'+name).encode();path.write_bytes(data)
            entries.append({'path':name,'role':role,'sha256':hashlib.sha256(data).hexdigest(),'cwdBinding':'.','outputBinding':target})
        self.contract={'schemaVersion':1,'sourceCommit':'a'*40,'version':'1.4.5','profile':{'name':'nsis-stage-synthetic-v1','version':'1.4.5','sourceCommit':'a'*40,'windowsTarget':'x64'},'compile':{'phase':'unsigned-build','cwd':'.','entry':'tools/makensis.exe'},'signing':{'phase':'deferred-human','enabled':False},'output':{'path':'out/LTTH-Setup-1.4.5.exe','cwd':'.','overwrite':False},'inputs':entries}
    def tearDown(self):self.temp.cleanup()
    def validate(self,c=None,external=()):return api.validate(self.root,c or self.contract,external)
    def test_normal_immutable_no_execution_or_output(self):
        before={p:p.read_bytes() for p in self.root.rglob('*') if p.is_file()};result=self.validate()
        self.assertFalse(result['installerReady']);self.assertFalse((self.root/'out').exists())
        with self.assertRaises(TypeError):result['version']='x'
        self.assertEqual(before,{p:p.read_bytes() for p in before})
    def test_external_input_and_extra_executable_deny(self):
        with self.assertRaises(ValueError):self.validate(external=('C:/outside/compiler.exe',))
        extra=self.root/'undeclared.exe';extra.write_bytes(b'synthetic')
        with self.assertRaises(ValueError):self.validate()
        self.assertEqual(extra.read_bytes(),b'synthetic')
    def test_profile_version_commit_phase_cwd_and_output_deny(self):
        for section,key,value in [('profile','version','1.4.6'),('profile','sourceCommit','b'*40),('compile','entry','C:/outside.exe'),('compile','cwd','..'),('compile','phase','signed-build'),('signing','enabled',True),('signing','enabled',0),('output','overwrite',True),('output','path','out/old.exe'),('output','cwd','../outside')]:
            candidate=copy.deepcopy(self.contract);candidate[section][key]=value
            with self.subTest(section=section,key=key),self.assertRaises(ValueError):self.validate(candidate)
    def test_traversal_controls_case_and_ancestor_collision_deny(self):
        for name in ['../escape','C:/escape','runtime/../server.js','runtime/x\n!include BAD','runtime/CON','runtime/*.js']:
            candidate=copy.deepcopy(self.contract);candidate['inputs'][0]['path']=name
            with self.assertRaises((ValueError,OSError)):self.validate(candidate)
        for left,right in [('app/Server.js','APP/server.js'),('app/a','APP/a/child'),('app/a/child','APP/a')]:
            candidate=copy.deepcopy(self.contract);candidate['inputs'][2]['outputBinding']=left
            extra=copy.deepcopy(candidate['inputs'][2]);extra['path']='runtime/second.js';extra['outputBinding']=right
            (self.root/extra['path']).write_bytes((self.root/'runtime/server.js').read_bytes());candidate['inputs'].append(extra)
            with self.assertRaises(ValueError):self.validate(candidate)
            (self.root/extra['path']).unlink()
    def test_hash_missing_and_semantic_role_mismatch_deny(self):
        candidate=copy.deepcopy(self.contract);candidate['inputs'][2]['path']='runtime/SERVER.js'
        with self.assertRaises(ValueError):self.validate(candidate)
        candidate=copy.deepcopy(self.contract);candidate['inputs'][0]['sha256']='0'*64
        with self.assertRaises(ValueError):self.validate(candidate)
        candidate=copy.deepcopy(self.contract);candidate['inputs'][-1]['outputBinding']='app/launcher.exe'
        with self.assertRaises(ValueError):self.validate(candidate)
        path=self.root/'build/installer.nsi';before=path.read_bytes();path.unlink()
        with self.assertRaises(OSError):self.validate()
        path.write_bytes(before)
    @unittest.skipUnless(os.name=='nt','Windows junction fixture')
    def test_junction_root_deny_source_preserved(self):
        import subprocess
        outside=self.root.parent/(self.root.name+'-outside');self.root.rename(outside)
        before={p.relative_to(outside):p.read_bytes() for p in outside.rglob('*') if p.is_file()}
        try:
            result=subprocess.run(['cmd.exe','/d','/c','mklink','/J',str(self.root),str(outside)],capture_output=True)
            self.assertEqual(result.returncode,0)
            with self.assertRaises(ValueError):self.validate()
            self.assertEqual(before,{p.relative_to(outside):p.read_bytes() for p in outside.rglob('*') if p.is_file()})
        finally:
            if self.root.is_junction():os.rmdir(self.root)
            outside.rename(self.root)
    def test_hardlink_rejects_byteidentical_alias(self):
        alias=self.root/'runtime/alias';os.link(self.root/'runtime/server.js',alias)
        try:
            with self.assertRaises(ValueError):self.validate()
        finally:alias.unlink()
        self.validate()

    def test_windows_device_aliases_and_ads_unc_deny(self):
        for name in ['COM\u00b9.txt','LPT\u00b2.txt','CON .txt','CONIN$','CONOUT$','CON.txt','NUL.tar','x:stream','C:/outside','\\\\server\\share','\\\\?\\C:\\outside']:
            with self.subTest(name=name),self.assertRaises(ValueError):api.relative('app/'+name)
        self.assertEqual(api.relative('app/caf\u00e9.json'),'app/caf\u00e9.json')

    def test_unicode_version_and_declared_existing_output_rejected(self):
        candidate=copy.deepcopy(self.contract);candidate['version']='1.4\u0664.5';candidate['profile']['version']=candidate['version'];candidate['output']['path']='out/LTTH-Setup-'+candidate['version']+'.exe'
        with self.assertRaises(ValueError):self.validate(candidate)
        target=self.root/self.contract['output']['path'];target.parent.mkdir();target.write_bytes(b'preexisting')
        candidate=copy.deepcopy(self.contract);candidate['inputs'].append({'path':self.contract['output']['path'],'role':'runtime','sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'cwdBinding':'.','outputBinding':'app/previous-output'})
        with self.assertRaises(ValueError):self.validate(candidate)
        self.assertEqual(target.read_bytes(),b'preexisting')

    def test_duplicate_manifest_member_and_unsupported_roles_rejected(self):
        for mode in ['duplicate','role','hash','cwd']:
            candidate=copy.deepcopy(self.contract)
            if mode=='duplicate':candidate['inputs'].append(copy.deepcopy(candidate['inputs'][0]))
            if mode=='role':candidate['inputs'][0]['role']='signer'
            if mode=='hash':candidate['inputs'][0]['sha256']='A'*64
            if mode=='cwd':candidate['inputs'][0]['cwdBinding']='C:/outside'
            with self.subTest(mode=mode),self.assertRaises(ValueError):self.validate(candidate)

    def test_strict_loader_roundtrip_valid_contract(self):
        import json
        for raw in [json.dumps(self.contract),json.dumps(self.contract).encode('utf-8')]:
            self.assertEqual(api.load_contract(raw),self.contract)
            self.assertFalse(self.validate(api.load_contract(raw))['installerReady'])

    def test_strict_loader_rejects_duplicate_keys_at_all_depths(self):
        for raw in ['{"version":"1.4.5","version":"1.4.6"}',
                    '{"profile":{"version":"1.4.5","version":"1.4.6"}}',
                    '{"inputs":[{"path":"a","path":"b"}]}',
                    '{"version":"a","ver\\u0073ion":"b"}']:
            with self.subTest(raw=raw),self.assertRaises(ValueError):api.load_contract(raw)

    def test_strict_loader_rejects_nfc_equivalent_keys_without_rewriting(self):
        for raw in ['{"caf\u00e9":1,"cafe\u0301":2}',
                    '{"nested":{"caf\u00e9":1,"cafe\u0301":2}}',
                    '{"inputs":[{"caf\u00e9":1,"cafe\u0301":2}]}']:
            with self.assertRaises(ValueError):api.load_contract(raw)
        self.assertEqual(api.load_contract('{"cafe\u0301":"cafe\u0301"}'),{'cafe\u0301':'cafe\u0301'})

    def test_strict_loader_malformed_nonfinite_encoding_and_size_deny(self):
        for raw in ['[]','null','{"x":NaN}','{"x":Infinity}','{"x":-Infinity}','{"x":1} trailing',b'\xff',b'\xef\xbb\xbf{}',' '* (1024*1024+1)]:
            with self.subTest(raw=repr(raw)[:40]),self.assertRaises(ValueError):api.load_contract(raw)

if __name__=='__main__':unittest.main()
