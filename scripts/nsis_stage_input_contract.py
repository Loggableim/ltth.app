"""Offline stage contract design; does not execute/build/sign anything."""
import hashlib
import json
import unicodedata
import ntpath
from pathlib import Path
import re
from types import MappingProxyType
import full_installer_inputs as full

ROLES = {'compiler','nsis-script','sdk-include','sdk-resource','sdk-plugin','runtime','launcher','locale','ui-resource'}
EXECUTABLE = {'compiler','sdk-plugin','launcher'}


def load_contract(data):
    """Strict UTF-8 JSON, including decoded/NFC key uniqueness at every depth."""
    if isinstance(data, bytes):
        try: text = data.decode('utf-8', errors='strict')
        except UnicodeDecodeError as error: raise ValueError('Contract must be strict UTF-8') from error
    elif isinstance(data, str): text = data
    else: raise ValueError('Contract JSON must be bytes or text')
    try:
        if len(text.encode('utf-8', errors='strict')) > 1024*1024: raise ValueError('Contract JSON exceeds 1 MiB')
    except UnicodeEncodeError as error: raise ValueError('Invalid Unicode contract') from error
    def unique(pairs):
        result={};seen=set()
        for key,value in pairs:
            normalized=unicodedata.normalize('NFC', key)
            if normalized in seen: raise ValueError('Duplicate decoded/NFC JSON key')
            seen.add(normalized);result[key]=value
        return result
    def constant(value): raise ValueError('Non-finite JSON constant forbidden')
    try:
        result=json.loads(text,object_pairs_hook=unique,parse_constant=constant)
    except (json.JSONDecodeError, RecursionError) as error: raise ValueError('Malformed contract JSON') from error
    if not isinstance(result,dict): raise ValueError('Contract JSON must be an object')
    return result

def relative(value):
    if not isinstance(value,str) or not value or '\\' in value or value.startswith('/'):
        raise ValueError('Canonical relative binding required')
    parts=value.split('/')
    if any(not p or p in ('.','..') or re.search(r'[<>:"|?*\x00-\x1f]|[. ]$',p) for p in parts):
        raise ValueError('Unsupported relative binding')
    if any(ntpath.isreserved(p) for p in parts):
        raise ValueError('Reserved Windows path')
    return value

def collide(targets,target):
    key=target.casefold()
    if any(key==p or key.startswith(p+'/') or p.startswith(key+'/') for p in targets):
        raise ValueError('File/ancestor/case collision')
    targets.add(key)

def validate(stage,contract,external_inputs=()):
    if external_inputs: raise ValueError('No executable or other undeclared external inputs')
    if set(contract)!={'schemaVersion','sourceCommit','version','profile','compile','signing','output','inputs'} or type(contract['schemaVersion']) is not int or contract['schemaVersion']!=1:
        raise ValueError('Invalid stage contract')
    version=contract['version']
    if not isinstance(version,str) or not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)',version) or not re.fullmatch('[0-9a-f]{40}',contract['sourceCommit']):
        raise ValueError('Version/source pin invalid')
    if contract['profile']!={'name':'nsis-stage-synthetic-v1','version':version,'sourceCommit':contract['sourceCommit'],'windowsTarget':'x64'}:
        raise ValueError('Independent profile binding mismatch')
    if contract['compile']!={'phase':'unsigned-build','cwd':'.','entry':'tools/makensis.exe'}:
        raise ValueError('Fixed compiler/CWD/phase binding required')
    if type(contract['signing'].get('enabled')) is not bool or contract['signing']!={'phase':'deferred-human','enabled':False}:
        raise ValueError('Signing phase must remain separate and deferred')
    if type(contract['output'].get('overwrite')) is not bool or contract['output']!={'path':'out/LTTH-Setup-'+version+'.exe','cwd':'.','overwrite':False}:
        raise ValueError('Fixed versioned output/CWD required')
    root=Path(stage)
    if not root.is_absolute():raise ValueError('Absolute stage required')
    # Inspection only, not a held-handle snapshot; caller must use lock layer later.
    for parent in [root,*root.parents]:
        if parent.is_symlink() or getattr(parent,'is_junction',lambda:False)():raise ValueError('Linked stage/ancestor')
    canonical=root.resolve(strict=True)
    if (root/'out').exists() or (root/'out').is_symlink():
        raise ValueError('Output namespace must be absent before preparation')
    names=set();expected_names=set();targets=set();selected=[];roles=set()
    if not isinstance(contract['inputs'],list):raise ValueError('Explicit input list required')
    for item in contract['inputs']:
        if set(item)!={'path','role','sha256','cwdBinding','outputBinding'} or item['role'] not in ROLES or item['cwdBinding']!='.':
            raise ValueError('Invalid input role/CWD')
        name=relative(item['path']);collide(names,name);expected_names.add(name)
        if not re.fullmatch('[0-9a-f]{64}',item['sha256']):raise ValueError('Invalid hash')
        if item['role']=='compiler' and name!='tools/makensis.exe':raise ValueError('Compiler outside fixed stage binding')
        if item['role'] in {'nsis-script','sdk-include','sdk-resource','sdk-plugin'} and not name.startswith('build/'):
            raise ValueError('Build input outside explicit namespace')
        output=item['outputBinding']
        if item['role'] in {'compiler','nsis-script','sdk-include','sdk-resource','sdk-plugin'}:
            if output is not None:raise ValueError('Compile-only input cannot be payload')
        else:
            relative(output)
            if not (output.startswith(('app/','node/','build-src/')) or output in {'launcher.exe','launcher.ico'}):raise ValueError('Output namespace not allowed')
            if item['role']=='launcher' and output!='launcher.exe':raise ValueError('Launcher target mismatch')
            if item['role']=='locale' and not output.startswith('build-src/locales/'):raise ValueError('Locale target mismatch')
            if item['role']=='runtime' and not output.startswith(('app/','node/')):raise ValueError('Runtime target mismatch')
            if item['role']=='ui-resource' and not (output=='launcher.ico' or output.startswith('build-src/assets/')):raise ValueError('UI target mismatch')
            collide(targets,output)
        path=full.resolve_input(canonical,name)
        if path.stat().st_nlink!=1:raise ValueError('Hardlinked input not allowed')
        if hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Input hash mismatch')
        selected.append((name,item['role'],output,item['sha256']));roles.add(item['role'])
    if not {'compiler','nsis-script'}<=roles:raise ValueError('Required compiler/script binding missing')
    actual=set()
    for path in root.rglob('*'):
        name=path.relative_to(root).as_posix()
        if path.is_symlink() or getattr(path,'is_junction',lambda:False)():raise ValueError('Linked stage member')
        if path.is_file():
            relative(name);full.resolve_input(canonical,name);actual.add(name)
    if actual!=expected_names:raise ValueError('Extra or missing stage inputs/output')
    # Stage is not changed and no commands are invoked.
    return MappingProxyType({'installerReady':False,'syntheticOnly':True,'version':version,'sourceCommit':contract['sourceCommit'],'inputs':tuple(selected),'output':contract['output']['path']})
