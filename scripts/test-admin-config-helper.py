"""Exercise the local setup helper in a private PTY; no live settings changed."""
import hashlib
import json
import os
import pty
import select
import stat
import subprocess
import tempfile
import time
from pathlib import Path

helper=Path(__file__).resolve().with_name('generate-admin-config.mjs')
fixture='Fixture-Admin-Password!'

def run(folder,password=fixture,confirmation=fixture):
    master,slave=pty.openpty()
    process=subprocess.Popen(['node',str(helper)],cwd=folder,stdin=slave,stdout=slave,stderr=slave,close_fds=True)
    os.close(slave)
    captured=b''
    def until(marker):
        nonlocal captured
        end=time.monotonic()+10
        while marker not in captured:
            assert time.monotonic()<end,'Helper prompt timed out'
            ready,_,_=select.select([master],[],[],0.1)
            if ready:
                try: data=os.read(master,4096)
                except OSError: data=b''
                assert data,'Helper ended before its prompt'
                captured+=data
    try:
        until(b'Admin password: ');os.write(master,password.encode()+b'\r')
        until(b'Confirm password: ');os.write(master,confirmation.encode()+b'\r')
        process.wait(timeout=10)
        while select.select([master],[],[],0.1)[0]:
            try: data=os.read(master,4096)
            except OSError: break
            if not data: break
            captured+=data
        text=captured.decode()
        assert fixture not in text,'Password must never echo in terminal output'
        return process.returncode,text
    finally:
        if process.poll() is None: process.kill();process.wait()
        os.close(master)

with tempfile.TemporaryDirectory(prefix='snb-admin-setup-') as folder:
    code,output=run(folder);assert code==0,output
    path=Path(folder)/'.env.admin.local'
    values=dict(line.split('=',1) for line in path.read_text().splitlines())
    assert set(values)=={'ADMIN_PASSWORD_SALT','ADMIN_PASSWORD_HASH','ADMIN_MFA_SECRET'}
    assert all(len(value)==64 for value in values.values())
    assert values['ADMIN_PASSWORD_HASH']==hashlib.sha256((values['ADMIN_PASSWORD_SALT']+fixture).encode()).hexdigest()
    assert len(set(values.values()))==3
    assert stat.S_IMODE(path.stat().st_mode)==0o600
    assert all(value not in output for value in values.values())
    original=path.read_bytes()
    code,output=run(folder);assert code==1 and 'No settings were overwritten' in output
    assert path.read_bytes()==original
with tempfile.TemporaryDirectory(prefix='snb-admin-setup-mismatch-') as folder:
    code,output=run(folder,confirmation='Another-fixture-password!');assert code==1 and 'do not match' in output
    assert not (Path(folder)/'.env.admin.local').exists()
with tempfile.TemporaryDirectory(prefix='snb-admin-setup-no-tty-') as folder:
    result=subprocess.run(['node',str(helper)],cwd=folder,input=fixture,text=True,capture_output=True)
    assert result.returncode==1 and 'interactive terminal' in result.stderr
    assert fixture not in result.stdout+result.stderr
    assert not (Path(folder)/'.env.admin.local').exists()
print('PASS local setup: hidden input, matching salted hash, independent random signing secret, private ignored file, no values printed, no overwrite, mismatch/non-TTY rejection')
