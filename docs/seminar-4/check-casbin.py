import sys,re,itertools,json,importlib.metadata
from pathlib import Path
import casbin
root=Path(__file__).resolve().parents[2]
source=(root/'task/access-control/extensions.qmd').read_text()
model_text=re.search(r'```ini\n(.*?)```',source,re.S).group(1)
policy_text=re.search(r'```csv\n(.*?)```',source,re.S).group(1)
lines=[line.strip() for line in policy_text.splitlines() if line.strip()]
pl=[line for line in lines if line.startswith('p,')];gl=[line for line in lines if line.startswith('g,')]
users=['lena','ira','oleg','max','vera','visitor'];authors=users[:-1]
queries=list(itertools.product(users,['material/1','salary/1'],['read','approve','publish'],authors,['draft','review','approved']))
def expected(q):
 user,obj,act,author,status=q
 if user=='visitor' or not obj.startswith('material/'):return False
 if act=='read':return True
 return user!=author and ((act=='approve' and user in ['lena','ira','oleg'] and status=='review') or (act=='publish' and user=='max' and status=='approved'))
def enforcer(removed=()):
 model=casbin.Model();model.load_model_from_text(model_text);e=casbin.Enforcer(model)
 for line in pl:e.add_policy(*[x.strip() for x in line.split(',')[1:]])
 for i,line in enumerate(gl):
  if i not in removed:e.add_grouping_policy(*[x.strip() for x in line.split(',')[1:]])
 return e
initial=enforcer();mismatches=[q for q in queries if initial.enforce(*q)!=expected(q)]
solutions=[];candidate_count=0
for size in range(len(gl)+1):
 for removed in itertools.combinations(range(len(gl)),size):
  candidate_count+=1;e=enforcer(removed)
  if all(e.enforce(*q)==expected(q) for q in queries):solutions.append([gl[i] for i in removed])
 if solutions:break
assert size==2,(size,solutions)
assert solutions==[['g, role_shift, role_release','g, role_backup, role_release']],solutions
remaining=enforcer(tuple(gl.index(line) for line in solutions[0]));assert all(remaining.enforce(*q)==expected(q) for q in queries)
partial=enforcer((gl.index('g, role_backup, role_release'),));assert partial.enforce('ira','material/8','publish','lena','approved') is True
report={'casbin':importlib.metadata.version('casbin'),'queries':len(queries),'initial_mismatches':len(mismatches),'candidate_configs_through_minimum':candidate_count,'minimum_deletions':size,'all_minimal_repairs':solutions,'partial_repair_counterexample':True,'final_all_queries_pass':True}
print(json.dumps(report,ensure_ascii=False,indent=2))
