"""Windows-only suspended launch into kill-on-close job; synthetic children only."""
import ctypes
from ctypes import wintypes as W
import os
import subprocess
import time

TIMEOUT_MS = 3000
class STARTUP(ctypes.Structure):
    _fields_ = [('cb',W.DWORD),('reserved',W.LPWSTR),('desktop',W.LPWSTR),('title',W.LPWSTR),('x',W.DWORD),('y',W.DWORD),('xs',W.DWORD),('ys',W.DWORD),('xc',W.DWORD),('yc',W.DWORD),('fill',W.DWORD),('flags',W.DWORD),('show',W.WORD),('count',W.WORD),('bytes',ctypes.POINTER(ctypes.c_byte)),('stdin',W.HANDLE),('stdout',W.HANDLE),('stderr',W.HANDLE)]
class PROCESS(ctypes.Structure):
    _fields_ = [('process',W.HANDLE),('thread',W.HANDLE),('pid',W.DWORD),('tid',W.DWORD)]
class BASIC(ctypes.Structure):
    _fields_ = [('perProcess',ctypes.c_int64),('perJob',ctypes.c_int64),('flags',W.DWORD),('minWorking',ctypes.c_size_t),('maxWorking',ctypes.c_size_t),('activeLimit',W.DWORD),('affinity',ctypes.c_size_t),('priority',W.DWORD),('scheduling',W.DWORD)]
class IO(ctypes.Structure):
    _fields_ = [(x,ctypes.c_uint64) for x in ['readOps','writeOps','otherOps','readBytes','writeBytes','otherBytes']]
class LIMIT(ctypes.Structure):
    _fields_ = [('basic',BASIC),('io',IO),('processMemory',ctypes.c_size_t),('jobMemory',ctypes.c_size_t),('peakProcess',ctypes.c_size_t),('peakJob',ctypes.c_size_t)]

class ACCOUNT(ctypes.Structure):
    _fields_ = [(x,ctypes.c_int64) for x in ['user','kernel','periodUser','periodKernel']] + [(x,W.DWORD) for x in ['faults','total','active','terminated']]

def kernel_api():
    if os.name != 'nt': raise ValueError('Windows job containment required')
    k=ctypes.WinDLL('kernel32',use_last_error=True)
    specs={'QueryInformationJobObject':([W.HANDLE,ctypes.c_int,ctypes.c_void_p,W.DWORD,ctypes.c_void_p],W.BOOL),'CreateJobObjectW':([ctypes.c_void_p,W.LPCWSTR],W.HANDLE),'SetInformationJobObject':([W.HANDLE,ctypes.c_int,ctypes.c_void_p,W.DWORD],W.BOOL),'AssignProcessToJobObject':([W.HANDLE,W.HANDLE],W.BOOL),'ResumeThread':([W.HANDLE],W.DWORD),'WaitForSingleObject':([W.HANDLE,W.DWORD],W.DWORD),'GetExitCodeProcess':([W.HANDLE,ctypes.POINTER(W.DWORD)],W.BOOL),'TerminateJobObject':([W.HANDLE,W.UINT],W.BOOL),'TerminateProcess':([W.HANDLE,W.UINT],W.BOOL),'CloseHandle':([W.HANDLE],W.BOOL),'CreateProcessW':([W.LPCWSTR,W.LPWSTR,ctypes.c_void_p,ctypes.c_void_p,W.BOOL,W.DWORD,ctypes.c_void_p,W.LPCWSTR,ctypes.POINTER(STARTUP),ctypes.POINTER(PROCESS)],W.BOOL)}
    for name,(args,result) in specs.items():
        f=getattr(k,name);f.argtypes=args;f.restype=result
    return k


def run_contained(command):
    k = kernel_api()
    def check(value):
        if not value: raise OSError(ctypes.get_last_error(),'Contained child operation failed')
    job=k.CreateJobObjectW(None,None);check(job)
    process=PROCESS();assigned=False
    try:
        limits=LIMIT();limits.basic.flags=0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        check(k.SetInformationJobObject(job,9,ctypes.byref(limits),ctypes.sizeof(limits)))
        startup=STARTUP();startup.cb=ctypes.sizeof(startup)
        line=ctypes.create_unicode_buffer(subprocess.list2cmdline(command))
        check(k.CreateProcessW(command[0],line,None,None,False,0x4,None,None,ctypes.byref(startup),ctypes.byref(process)))
        # Child cannot execute code or spawn descendants before assignment.
        check(k.AssignProcessToJobObject(job,process.process));assigned=True
        if k.ResumeThread(process.thread)==0xffffffff: raise OSError(ctypes.get_last_error(),'Cannot resume contained child')
        wait=k.WaitForSingleObject(process.process,TIMEOUT_MS)
        if wait==258: raise TimeoutError('Synthetic child exceeded fixed 3 second timeout')
        if wait!=0: raise OSError(ctypes.get_last_error(),'Cannot wait contained child')
        code=W.DWORD();check(k.GetExitCodeProcess(process.process,ctypes.byref(code)))
        if code.value: raise ValueError('Contained fake child failed: '+str(code.value))
    finally:
        try:
            # Explicit termination plus kill-on-close covers descendants even on normal root exit.
            if assigned:
                check(k.TerminateJobObject(job,1))
                deadline=time.monotonic()+3
                while True:
                    account=ACCOUNT()
                    check(k.QueryInformationJobObject(job,1,ctypes.byref(account),ctypes.sizeof(account),None))
                    if account.active==0:break
                    if time.monotonic()>deadline:raise RuntimeError('Contained job cleanup did not finish')
                    time.sleep(0.01)
            elif process.process: k.TerminateProcess(process.process,1)
        finally:
            k.CloseHandle(job)
            if process.process:
                k.WaitForSingleObject(process.process,3000)
                k.CloseHandle(process.process)
            if process.thread:k.CloseHandle(process.thread)
