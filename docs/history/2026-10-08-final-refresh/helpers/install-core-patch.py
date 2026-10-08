import pathlib,subprocess,json,time,sys
O=pathlib.Path(__file__).parent;R=pathlib.Path('/home/tolya/Cybersecurity')
assert sys.argv[1:]==['--execute-after-guide-publication'], 'Wait for root guide publication signal'
p=R/'CI/install-extensions.sh';s=p.read_text();assert s.count('quarto-course@v4.0.0')==1
p.write_text(s.replace('quarto-course@v4.0.0','quarto-course@v4.0.1'))
start=time.monotonic()
with (O/'native-install.log').open('w') as f:r=subprocess.run(['bash','CI/install-extensions.sh'],cwd=R,stdin=subprocess.DEVNULL,stdout=f,stderr=subprocess.STDOUT)
(O/'install-command.json').write_text(json.dumps({'argv':['bash','CI/install-extensions.sh'],'exitCode':r.returncode,'durationSeconds':round(time.monotonic()-start,3)},indent=2)+'\n')
assert r.returncode==0,'Native installation failed; see native-install.log'
print('Native immutable-tag extension installation completed')
