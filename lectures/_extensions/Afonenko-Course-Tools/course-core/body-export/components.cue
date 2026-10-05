package coursebody

import (
	"list"
	"strings"
)

#Attribute: {key: string, value: string}
#Parent: {kind: string, id: string, classes: [...string], attributes: [...#Attribute]}
#Node: {#Parent, path: string, ancestors: [...#Parent], firstKind: string, firstLevel: int, json: string, memberKinds: [...string], memberSizes: [...int], items: [...string]}
#Role: {
	node: {#Parent, ...}
	let n = node
	question: strings.HasPrefix(n.id, "exr-") || len([for a in n.attributes if a.key == "target" {a}]) > 0
	solution: strings.HasPrefix(n.id, "sol-") || list.Contains(n.classes, "solution") || list.Contains(n.classes, "demo-sol")
	notes:    list.Contains(n.classes, "grading-notes")
	bank:     list.Contains(n.classes, "answer-spec") || list.Contains(n.classes, "answer")
	correct:  list.Contains(n.classes, "correct")
	members:  list.Contains(n.classes, "assessment-items")
	if question {value: "question"}
	if solution {value: "solution"}
	if notes {value: "notes"}
	if bank {value: "bank"}
	if correct {value: "correct"}
	if members {value: "members"}
	if !question && !solution && !notes && !bank && !correct && !members {value: "condition"}
}
#Transport: {input: {
	owner:  string & =~"^[a-z][a-z0-9-]*$"
	source: string & !=""
	nodes: [...#Node]
	compare: bool
	before: [...]
	signatures: [...]
	assessment: {enabled: bool, kind: string}
	firstHeader: {id: string, title: string, authored: bool, topLevel: bool}
}}
input: #Transport.input
_facts: [for n in input.nodes {
	path: n.path
	role: (#Role & {node: n}).value
	id: n.id
	owners: [for p in n.ancestors if (#Role & {node: p}).value == "question" {p.id}]
	privateParents: [for p in n.ancestors if (#Role & {node: p}).value == "solution" || (#Role & {node: p}).value == "notes" {p.id}]
	banks: [for p in n.ancestors if (#Role & {node: p}).value == "bank" {p}]
	native:      n.json
	parents:     n.ancestors
	memberKinds: n.memberKinds, memberSizes: n.memberSizes, items: n.items
	if role == "question" {owner: n.id}
	if role == "solution" {owner: ([for q in input.nodes if (#Role & {node: q}).value == "question" && strings.TrimPrefix(q.id, "exr-") == strings.TrimPrefix(n.id, "sol-") {q.id}])[0]}
	if role != "question" && role != "solution" && len(owners) == 1 {owner: owners[0]}
	if role != "question" && role != "solution" && len(owners) != 1 {owner: ""}
}]
for i, n in input.nodes {
	let f = _facts[i]
	if f.role == "question" {
		_questionShape: "\(i)": n & {kind: "Div", id: string & =~"^exr-[a-z0-9][a-z0-9-]*$", firstKind: string, firstLevel: int & >=0 & <=6}
		if len([for a in n.attributes if a.key == "target" {a}]) > 0 {_adapterHead: "\(i)": n & {firstKind: "Header", firstLevel: int & >=1 & <=6}}
		_targets: "\(i)": [for a in n.attributes if a.key == "target" {a.value}] & ([] | ["manual"])
		_nested: "\(i)": f.owners & []
		_public: "\(i)": false & (list.Contains(n.classes, "control") || len([for a in n.attributes if a.key == "course-role" && a.value == "control" {a}]) > 0)
	}
	if f.role == "solution" {
		_solutionShape: "\(i)": n & {kind: "Div", id: string & =~"^sol-[a-z0-9][a-z0-9-]*$"}
		_solutionPrivate: "\(i)": f.privateParents & []
		_solutionOwners: "\(i)": [for q in _facts if q.role == "question" && strings.TrimPrefix(q.id, "exr-") == strings.TrimPrefix(n.id, "sol-") {q.id}] & list.MinItems(1) & list.MaxItems(1)
		if len(f.owners) > 0 {_solutionNestedOwner: "\(i)": f.owners & _solutionOwners["\(i)"]}
	}
	if f.role == "notes" {
		_notesShape: "\(i)": n & {kind: "Div"}
		_notesOwners: "\(i)": f.owners & list.MinItems(1) & list.MaxItems(1)
		_notesPrivate: "\(i)": f.privateParents & []
	}
	if f.role == "bank" {
		_bankOwners: "\(i)": f.owners & list.MinItems(1) & list.MaxItems(1)
		_bankPrivate: "\(i)": f.privateParents & []
		_bankNested: "\(i)": f.banks & []
		if list.Contains(n.classes, "answer-spec") {_bankShape: "\(i)": n & {kind: "CodeBlock"}}
		if list.Contains(n.classes, "answer") {_bankShape: "\(i)": n & {kind: "Div"}}
	}
	if f.role == "correct" {
		_correctShape: "\(i)": n & {kind: "Span"}
		_correctOwner: "\(i)": f.owners & list.MinItems(1) & list.MaxItems(1)
		_correctBank: "\(i)": f.banks & [{kind: "Div", classes: [...string], ...}]
		_correctPrivate: "\(i)": f.privateParents & []
	}
	if f.role == "members" {_membersOwner: "\(i)": f.owners & [], _membersPrivate: "\(i)": f.privateParents & []}
	if (f.role == "question" || len(f.owners) > 0) && len(f.privateParents) == 0 && f.role != "solution" && f.role != "notes" {
		let profileNodes = list.Concat([[n], n.ancestors])
		_profileClasses: "\(i)": [] & [for p in profileNodes for c in p.classes if strings.HasPrefix(c, "when-") || strings.HasPrefix(c, "unless-") || list.Contains(["content-visible", "content-hidden", "full", "full-only"], c) {c}]
		_profileAttributes: "\(i)": [] & [for p in profileNodes for a in p.attributes if strings.HasPrefix(a.key, "when-") || strings.HasPrefix(a.key, "unless-") {a}]
	}
}
for q in _facts if q.role == "question" {
	_banks: (q.id): [for n in _facts if n.role == "bank" && list.Contains(n.owners, q.id) {n}] & list.MaxItems(1)
	_solutions: (q.id): [for n in _facts if n.role == "solution" && strings.TrimPrefix(q.id, "exr-") == strings.TrimPrefix(n.id, "sol-") {n}] & list.MaxItems(1)
}
_signatures: [for n in _facts if n.role == "bank" {owner: n.owner, native: n.native, parents: n.parents}]
if input.compare {_sameDeclarations: input.before & _signatures}
_members: [for n in _facts if n.role == "members" {n}]
_work: {
	if input.assessment.enabled || len(_members) > 0 {
		declared:   input.assessment.enabled & true
		authored:   input.firstHeader.authored & true
		topLevel:   input.firstHeader.topLevel & true
		id:         input.firstHeader.id & =~"^sec-[a-z0-9][a-z0-9-]*$"
		kind:       input.assessment.kind & ("lab" | "test" | "exam")
		title:      input.firstHeader.title & !=""
		containers: len(_members) & 1
		memberKinds: list.Concat([for n in _members {n.memberKinds}]) & ["BulletList" | "OrderedList"]
		memberSizes: list.Concat([for n in _members {n.memberSizes}]) & [...1] & list.MinItems(1)
		items: list.Concat([for n in _members {n.items}]) & [...string] & list.MinItems(1) & list.UniqueItems
	}
}
report: {
	nodes: _facts, signatures: _signatures
	if input.assessment.enabled || len(_members) > 0 {work: _work}
	if !input.assessment.enabled && len(_members) == 0 {work: null}
}
