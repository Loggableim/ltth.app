"""Only synthetic public ZIP producer fixtures, never real release contents."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
import build_release_bundle as bundle

class PublicZipLauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='ltth-public-zip-launcher-fixture-');self.root=Path(self.temp.name)
        (self.root/'scripts').mkdir();shutil.copyfile(Path(bundle.__file__),self.root/'scripts/build_release_bundle.py')
        (self.root/'app/config').mkdir(parents=True)
        for name,obj in [('version.json',{'version':'9.9.9','downloadVersion':'9.9.9'}),('package.json',{'version':'9.9.9'}),('app/package.json',{'version':'9.9.9'}),('app/package-lock.json',{'version':'9.9.9','packages':{'':{'version':'9.9.9'}}}),('app/config/plugin-release-policy.json',{'schemaVersion':1,'closedBeta':['music-bot'],'aliases':{},'publicRuntimeExcluded':[],'publicAssetPathOwners':{}})]:
            (self.root/name).write_text(json.dumps(obj))
        (self.root/'app/server.js').write_bytes(b'synthetic-app')
        self.launcher=self.root/'launcher.exe';self.launcher.write_bytes(b'SYNTHETIC-UNSIGNED-SOURCE-LAUNCHER')
        (self.root/'downloads').mkdir();(self.root/'downloads/launcher.exe').write_bytes(b'SYNTHETIC-DIFFERENT-SIGNED-STANDALONE')
        self.before={p:p.read_bytes() for p in [self.launcher,self.root/'downloads/launcher.exe']}
    def tearDown(self):self.temp.cleanup()
    def check(self,path):
        with zipfile.ZipFile(path) as archive:
            self.assertNotIn('ltth_9.9.9/launcher.exe',archive.namelist())
            self.assertNotIn('ltth_9.9.9/downloads/launcher.exe',archive.namelist())
            self.assertEqual(archive.read('ltth_9.9.9/app/server.js'),b'synthetic-app')
            self.assertEqual(json.loads(archive.read('ltth_9.9.9/app/config/distribution-mode.json')),{'channel':'public'})
        self.assertEqual(self.before,{p:p.read_bytes() for p in self.before})
    def test_direct_public_bundle_excludes_unrelated_launchers(self):
        target=self.root/'synthetic-direct.zip';bundle.build_bundle_zip(self.root,'9.9.9',target,enforce_committed_size_limit=False);self.check(target)
    def test_release_assets_api_and_cli_exclusion_with_exact_sidecar(self):
        target,sidecar=bundle.build_release_assets(self.root,'9.9.9',self.root/'api','a'*40);self.check(target)
        self.assertEqual(json.loads(sidecar.read_text())['sha256'],hashlib.sha256(target.read_bytes()).hexdigest())
        self.assertEqual(json.loads(sidecar.read_text())['bytes'],target.stat().st_size)
        result=subprocess.run([sys.executable,'-B',str(self.root/'scripts/build_release_bundle.py'),'--release-assets-dir',str(self.root/'cli'),'--commit-sha','a'*40],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr);self.check(self.root/'cli/ltth_latest.zip')
    def test_default_new_patch_public_zip_excludes_launcher(self):
        result=subprocess.run([sys.executable,'-B',str(self.root/'scripts/build_release_bundle.py')],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr);self.check(self.root/'new_patch/ltth_9.9.9/ltth_9.9.9.zip')

if __name__=='__main__':unittest.main()
