import pathlib,json,re,hashlib
R=pathlib.Path('/home/tolya/Cybersecurity');O=pathlib.Path(__file__).parent
records={}
for view in ['student','full']:
 path=R/('_site-'+view)/'task/seminar/01-introduction.html';h=path.read_text();main=h[h.index('<main'):h.index('</main>')]
 link=re.search(r'<a\b[^>]*href=["\']../data-integrity/backup.html#exr-data-integrity-backup["\'][^>]*>([\s\S]*?)</a>',main)
 assert link and '<span>11.1</span>' in link[1],view+' actual native href/caption missing inside main'
 assert not any(token in h for token in ['quarto-unresolved-ref','course-assignment:','course-assignment-pending:','course-pending-']),view+' native unresolved/pending wire survived'
 records[view]={'href':'../data-integrity/backup.html#exr-data-integrity-backup','nativeCaption':'11.1','insideMain':True,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
 frozen=json.loads((O/'authored-inputs-before-final-render.json').read_text());assert all(hashlib.sha256((R/n).read_bytes()).hexdigest()==v for n,v in frozen.items())
(O/'actual-native-link-verified.json').write_text(json.dumps({'passed':True,'views':records,'authoredInputCount':len(frozen),'authoredInputsUnchanged':True},indent=2)+'\n')
print('PASS actual student/full native repaired backup href/caption inside main and no pending wire')
