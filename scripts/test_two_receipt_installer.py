import copy
import hashlib
import json
import os
from pathlib import Path
import unittest
from test_full_installer_inputs import FullInputTests
import two_receipt_installer as api

@unittest.skipUnless(os.name == 'nt', 'Windows sharing required')
class TwoReceiptTests(unittest.TestCase):
    def setUp(self):
        FullInputTests.setUp(self)
        self.stage=self.root/'stage';app=self.stage/'app';app.mkdir(parents=True)
        (app/'config').mkdir();(app/'package.json').write_text('{"version":"1.4.5"}')
        policy=next(x for x in self.manifest['inputs'] if x['role']=='policy')
        (app/'config/plugin-release-policy.json').write_bytes((self.sources/policy['path']).read_bytes())
        self.receipt=self.stage/'nsis-public-stage.json'
        self.receipt.write_text(json.dumps({'schemaVersion':1,'files':{p.relative_to(app).as_posix():api.digest(p) for p in app.rglob('*') if p.is_file()}}))
        self.mpath=self.root/'full.json';self.mpath.write_text(json.dumps(self.manifest))
        self.fake=self.root/'fake.py';self.fake.write_text('pass\n')
        self.profile={'schemaVersion':1,'version':'1.4.5','sourceCommit':'a'*40,'appSourceCommit':'a'*40,'appReceiptSha256':api.digest(self.receipt),'fullReceiptSha256':api.digest(self.mpath),'fakeSha256':api.digest(self.fake)}
        self.ppath=self.root/'profile.json';self.save()
    def tearDown(self):FullInputTests.tearDown(self)
    def save(self):self.ppath.write_text(json.dumps(self.profile))
    def run_fixture(self):return api.run_fake(self.stage,self.mpath,self.roots,self.ppath,self.fake)
    def test_success_and_immutable_snapshot(self):
        result=self.run_fixture();self.assertFalse(result['installerReady'])
        self.assertIn('app/package.json',result['targets']);self.assertIn('launcher.exe',result['targets'])
        with self.assertRaises(TypeError):result['targets']['evil']='x'
    def test_version_commit_and_pins_fail_closed(self):
        original=copy.deepcopy(self.profile)
        for key,value in [('version','1.4.6'),('appSourceCommit','b'*40),('sourceCommit','b'*40),('appReceiptSha256','0'*64),('fullReceiptSha256','0'*64),('fakeSha256','0'*64)]:
            self.profile=copy.deepcopy(original);self.profile[key]=value;self.save()
            with self.subTest(key=key),self.assertRaises(ValueError):self.run_fixture()
    def test_drift_missing_and_unexpected_app_fail(self):
        path=self.stage/'app/package.json';before=path.read_bytes();path.write_bytes(b'drift')
        with self.assertRaises(ValueError):self.run_fixture()
        path.write_bytes(before);extra=self.stage/'app/late';extra.write_bytes(b'x')
        with self.assertRaises(ValueError):self.run_fixture()
        extra.unlink();path.unlink()
        with self.assertRaises(ValueError):self.run_fixture()
    def test_ambiguous_target_and_policy_mismatch(self):
        launcher=copy.deepcopy(next(x for x in self.manifest['inputs'] if x['role']=='launcher'))
        launcher['name']='second-launcher';launcher['path']='second';(self.sources/'second').write_bytes((self.sources/'launcher.synthetic').read_bytes())
        self.manifest['inputs'].append(launcher);self.mpath.write_text(json.dumps(self.manifest));self.profile['fullReceiptSha256']=api.digest(self.mpath);self.save()
        with self.assertRaises(ValueError):self.run_fixture()
        self.manifest['inputs'].pop();p=next(x for x in self.manifest['inputs'] if x['role']=='policy');(self.sources/p['path']).write_bytes(b'different');p['bytes']=9;p['sha256']=hashlib.sha256(b'different').hexdigest()
        self.mpath.write_text(json.dumps(self.manifest));self.profile['fullReceiptSha256']=api.digest(self.mpath);self.save()
        with self.assertRaises(ValueError):self.run_fixture()
    def test_process_lifetime_locks_all_inputs_and_receipts(self):
        paths=[self.receipt,self.mpath,self.ppath,self.fake,self.stage/'app/package.json',self.sources/'launcher.synthetic']
        self.fake.write_text('from pathlib import Path\npaths='+repr([str(p) for p in paths])+'''\nfor name in paths:
 p=Path(name)
 for action in ('write','delete','rename'):
  try:
   if action=='write':p.write_bytes(b'BAD')
   elif action=='delete':p.unlink()
   else:p.rename(p.with_name('BAD'))
  except OSError:continue
  raise RuntimeError('Unlocked '+name)
''')
        self.profile['fakeSha256']=api.digest(self.fake);self.save();before={p:p.read_bytes() for p in paths}
        self.run_fixture();self.assertEqual(before,{p:p.read_bytes() for p in paths})
        for p in paths:p.write_bytes(p.read_bytes())
    def test_child_failure_releases_locks_preserves_bytes(self):
        self.fake.write_text('raise SystemExit(7)');self.profile['fakeSha256']=api.digest(self.fake);self.save()
        paths=[self.receipt,self.mpath,self.ppath,self.stage/'app/package.json'];before={p:p.read_bytes() for p in paths}
        with self.assertRaises(ValueError):self.run_fixture()
        self.assertEqual(before,{p:p.read_bytes() for p in paths})
        for p in paths:p.write_bytes(p.read_bytes())

    def test_target_trie_prefix_collisions_both_orders_casefold(self):
        for first, second in [('node/A','node/a/child'),('node/A/child','node/a')]:
            targets={};api.add_target(targets,first,'one')
            with self.assertRaises(ValueError):api.add_target(targets,second,'two')
        other=self.root/'other';(other/'NODE-runtime.synthetic').mkdir(parents=True)
        child=other/'NODE-runtime.synthetic/child';child.write_bytes(b'x');self.roots['other']=other
        self.manifest['inputs'].append({'name':'node-child','role':'node-runtime','root':'other','path':'NODE-runtime.synthetic/child','bytes':1,'sha256':api.digest(child)})
        self.mpath.write_text(json.dumps(self.manifest));self.profile['fullReceiptSha256']=api.digest(self.mpath);self.save()
        from unittest.mock import patch
        with patch.object(api,'run_contained') as run, self.assertRaises(ValueError):self.run_fixture()
        run.assert_not_called()

    def test_junction_exchange_before_app_open_rejected_and_cleanup(self):
        import shutil,subprocess
        from unittest.mock import patch
        outside=self.root/'outside';saved=self.root/'saved';shutil.copytree(self.stage/'app',outside)
        before={p.relative_to(outside).as_posix():p.read_bytes() for p in outside.rglob('*') if p.is_file()}
        original=api.open_app_handle;trigger=[False];real_run=subprocess.run
        def raced(kernel,path):
            if not trigger[0]:
                trigger[0]=True;(self.stage/'app').rename(saved)
                result=real_run(['cmd.exe','/d','/c','mklink','/J',str(self.stage/'app'),str(outside)],capture_output=True)
                self.assertEqual(result.returncode,0)
            return original(kernel,path)
        try:
            with patch.object(api,'open_app_handle',raced),patch.object(api,'run_contained') as run,self.assertRaises(ValueError):self.run_fixture()
            run.assert_not_called()
            self.assertTrue(trigger[0]);self.assertEqual(before,{p.relative_to(outside).as_posix():p.read_bytes() for p in outside.rglob('*') if p.is_file()})
            # Failed path closed redirected file handles too.
            for p in outside.rglob('*'):
                if p.is_file():p.write_bytes(p.read_bytes())
        finally:
            if trigger[0]:os.rmdir(self.stage/'app');saved.rename(self.stage/'app')
        self.assertFalse((self.stage/'app').is_junction());self.run_fixture()

    def test_final_revalidation_detects_late_inventory_before_child(self):
        from unittest.mock import patch
        original=api.validate_app_handles;calls=[0];late=self.stage/'app/late'
        def changed(*args):
            calls[0]+=1
            if calls[0]==2:late.write_bytes(b'late')
            return original(*args)
        with patch.object(api,'validate_app_handles',changed),patch.object(api,'run_contained') as run,self.assertRaises(ValueError):self.run_fixture()
        self.assertEqual(calls[0],2);run.assert_not_called();late.unlink()
        self.run_fixture()

    def test_timeout_kills_descendant_and_releases_all_input_locks(self):
        import time
        pidfile=self.root/'descendant.pid'
        self.fake.write_text("import subprocess,sys,time,pathlib\np=subprocess.Popen([sys.executable,'-B','-c','import time;time.sleep(60)'])\npathlib.Path("+repr(str(pidfile))+").write_text(str(p.pid))\ntime.sleep(60)\n")
        self.profile['fakeSha256']=api.digest(self.fake);self.save()
        before={p:p.read_bytes() for p in [self.fake,self.receipt,self.mpath,self.ppath,self.stage/'app/package.json']}
        started=time.monotonic()
        with self.assertRaises(TimeoutError):self.run_fixture()
        self.assertLess(time.monotonic()-started,7)
        self.assertTrue(pidfile.exists());self.assert_process_dead(int(pidfile.read_text()))
        self.assertEqual(before,{p:p.read_bytes() for p in before})
        for p in before:p.write_bytes(p.read_bytes())

    def assert_process_dead(self,pid):
        import ctypes
        from ctypes import wintypes
        k=ctypes.WinDLL('kernel32',use_last_error=True)
        k.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];k.OpenProcess.restype=wintypes.HANDLE
        k.WaitForSingleObject.argtypes=[wintypes.HANDLE,wintypes.DWORD];k.WaitForSingleObject.restype=wintypes.DWORD
        k.CloseHandle.argtypes=[wintypes.HANDLE]
        handle=k.OpenProcess(0x100000,False,pid)
        if handle:
            try:self.assertEqual(k.WaitForSingleObject(handle,1000),0)
            finally:k.CloseHandle(handle)

    def test_root_normal_exit_kills_spawned_descendant(self):
        pidfile=self.root/'normal-child.pid'
        self.fake.write_text("import subprocess,sys,pathlib\np=subprocess.Popen([sys.executable,'-B','-c','import time;time.sleep(60)'])\npathlib.Path("+repr(str(pidfile))+").write_text(str(p.pid))\n")
        self.profile['fakeSha256']=api.digest(self.fake);self.save()
        self.run_fixture();self.assert_process_dead(int(pidfile.read_text()))

    def test_root_exitcode_error_kills_spawned_descendant(self):
        pidfile=self.root/'error-child.pid'
        self.fake.write_text("import subprocess,sys,pathlib\np=subprocess.Popen([sys.executable,'-B','-c','import time;time.sleep(60)'])\npathlib.Path("+repr(str(pidfile))+").write_text(str(p.pid))\nraise SystemExit(7)\n")
        self.profile['fakeSha256']=api.digest(self.fake);self.save()
        with self.assertRaises(ValueError):self.run_fixture()
        self.assert_process_dead(int(pidfile.read_text()))
        for p in [self.fake,self.receipt,self.mpath,self.ppath,self.stage/'app/package.json']:p.write_bytes(p.read_bytes())

    def exercise_job_api_failure(self, failing):
        import ctypes
        from unittest.mock import patch
        import synthetic_child_job as job
        pidfile=self.root/'injected-child.pid';started=self.root/'started'
        self.fake.write_text("import subprocess,sys,pathlib\npathlib.Path("+repr(str(started))+").write_text('started')\np=subprocess.Popen([sys.executable,'-B','-c','import time;time.sleep(60)'])\npathlib.Path("+repr(str(pidfile))+").write_text(str(p.pid))\n")
        self.profile['fakeSha256']=api.digest(self.fake);self.save()
        before={p:p.read_bytes() for p in [self.fake,self.receipt,self.mpath,self.ppath,*self.sources.iterdir(),*[p for p in (self.stage/'app').rglob('*') if p.is_file()]]}
        real=job.kernel_api();created=[];closed=[];calls=[];assigned=[False];rootpid=[None]
        class Injected:
            def __getattr__(inner,name):
                original=getattr(real,name)
                def call(*args):
                    calls.append(name)
                    if name==failing:
                        ctypes.set_last_error(5)
                        return 0xffffffff if name=='ResumeThread' else 0
                    if name=='ResumeThread':self.assertTrue(assigned[0], 'Unbound child resumed')
                    result=original(*args)
                    if name=='CreateJobObjectW' and result:created.append(result)
                    if name=='CreateProcessW' and result:
                        info=ctypes.cast(args[-1],ctypes.POINTER(job.PROCESS)).contents
                        created.extend([info.process,info.thread]);rootpid[0]=info.pid
                        self.assertEqual(args[5]&0x4,0x4);self.assertFalse(args[4])
                    if name=='AssignProcessToJobObject' and result:assigned[0]=True
                    if name=='CloseHandle':
                        self.assertTrue(result,'CloseHandle failed');closed.append(args[0])
                    return result
                return call
        with patch.object(job,'kernel_api',return_value=Injected()),self.assertRaises(OSError):self.run_fixture()
        self.assertEqual(sorted(created),sorted(closed));self.assertEqual(len(closed),len(set(closed)))
        if rootpid[0]:self.assert_process_dead(rootpid[0])
        if failing in ['CreateJobObjectW','AssignProcessToJobObject','ResumeThread']:
            self.assertFalse(started.exists());self.assertFalse(pidfile.exists())
        else:
            self.assertTrue(started.exists());self.assertTrue(pidfile.exists())
            self.assert_process_dead(int(pidfile.read_text()))
        if failing in ['CreateJobObjectW','AssignProcessToJobObject']:self.assertNotIn('ResumeThread',calls)
        self.assertEqual(before,{p:p.read_bytes() for p in before})
        for p in before:p.write_bytes(p.read_bytes())

    def test_create_job_failure_no_child_and_cleanup(self):self.exercise_job_api_failure('CreateJobObjectW')
    def test_assign_failure_no_resume_and_cleanup(self):self.exercise_job_api_failure('AssignProcessToJobObject')
    def test_resume_failure_no_execution_and_cleanup(self):self.exercise_job_api_failure('ResumeThread')
    def test_terminate_job_failure_kill_on_close_and_cleanup(self):self.exercise_job_api_failure('TerminateJobObject')
    def test_query_job_failure_kill_on_close_and_cleanup(self):self.exercise_job_api_failure('QueryInformationJobObject')

if __name__=='__main__':unittest.main()
