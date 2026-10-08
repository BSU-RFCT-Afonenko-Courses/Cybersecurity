import pathlib,subprocess,json,os,time,datetime,hashlib
O=pathlib.Path(__file__).parent;R=pathlib.Path('/home/tolya/Cybersecurity');B=pathlib.Path('/home/tolya/course-tools');env=dict(os.environ);env['PATH']=str(B/'local-tools/cue')+':'+str(B/'local-tools/task')+':'+env['PATH'];env['CUE']=str(B/'local-tools/cue/cue')
for key,folder in [('XDG_CACHE_HOME','cache'),('XDG_DATA_HOME','data'),('IPYTHONDIR','ipython'),('JUPYTER_RUNTIME_DIR','jupyter-runtime')]:p=O/folder;p.mkdir(exist_ok=True);env[key]=str(p)
assert subprocess.check_output(['quarto','--version'],text=True,env=env).strip()=='1.11.5';assert 'v0.17.1' in subprocess.check_output([env['CUE'],'version'],text=True,env=env)
steps=[('native-run',['quarto','pandoc','--lua-filter','CI/native-run.lua','--to','plain']),('cue-validation',['quarto','run','CI/cue-validation.ts']),('student-first',['bash','CI/render.sh','student']),('full',['bash','CI/render.sh','full']),('student-after-full',['bash','CI/render.sh','student']),('site',['python3','CI/site.py','_site-student','_site-full'])];records=[]
for label,argv in steps:
 print('START',label,flush=True);log=O/(label+'.log');start=time.monotonic()
 with log.open('w') as out:p=subprocess.run(argv,cwd=R,env=env,stdin=subprocess.DEVNULL,stdout=out,stderr=subprocess.STDOUT)
 record={'label':label,'argv':argv,'exitCode':p.returncode,'durationSeconds':round(time.monotonic()-start,3),'log':str(log)};records.append(record);(O/'commands.json').write_text(json.dumps(records,indent=2)+'\n');print('EXIT',label,p.returncode,record['durationSeconds'],str(log),flush=True)
 if p.returncode:raise SystemExit(p.returncode)
print('ALL ACTUAL NATIVE COURSE CHECKS PASSED',flush=True)
