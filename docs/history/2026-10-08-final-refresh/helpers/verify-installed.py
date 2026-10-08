import pathlib,subprocess,json,hashlib
R=pathlib.Path('/home/tolya/Cybersecurity');B=pathlib.Path('/home/tolya/course-tools');O=pathlib.Path(__file__).parent
versions={'quarto-course':('v4.0.1','a9a439bd6e6498806d4d4943efd71232e70170be'),'quarto-reference-catalog':('v3.0.0','559583805a514ae8a244b6ea4cb5124867064024'),'quarto-project-publish':('v5.0.0','215309b5c41669e56a857a1bc3e4f7f2ce782c5f'),'quarto-project-download':('v2.0.0','ee5ae76255d265ad7c7f43a765bc061ffc8eec75')};records={}
for scope in ['.','theory','task','seminars']:
 repos=['quarto-course','quarto-reference-catalog']+(['quarto-project-publish'] if scope=='.' else [])+(['quarto-project-download'] if scope=='task' else []);expected={}
 for repo in repos:
  tag,source=versions[repo];listing=subprocess.check_output(['git','ls-tree','-r','-z',source,'--','_extensions'],cwd=B/repo)
  for record in listing.split(b'\0'):
   if not record:continue
   attrs,path=record.split(b'\t');mode,kind,blob=attrs.split();assert mode in [b'100644',b'100755'] and kind==b'blob';name=path.decode().removeprefix('_extensions/');data=subprocess.check_output(['git','cat-file','blob',blob.decode()],cwd=B/repo);expected[name]=hashlib.sha256(data).hexdigest()
 base=R/scope/'_extensions/Afonenko-Course-Tools';assert base.is_dir() and not any(p.is_symlink() for p in base.rglob('*'));actual={p.relative_to(base).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in base.rglob('*') if p.is_file()};assert actual==expected,'Installed full file set/bytes differ '+scope;assert sorted(p.name for p in base.parent.iterdir())==['Afonenko-Course-Tools'];records[scope]={'files':actual,'fileCount':len(actual),'releases':{repo:{'tag':versions[repo][0],'sha':versions[repo][1]} for repo in repos}}
assert sum(r['fileCount'] for r in records.values())==618;(O/'installed-exact-byte-proof.json').write_text(json.dumps(records,indent=2)+'\n');print('PASS native installed payload618files',[(k,v['fileCount']) for k,v in records.items()])
