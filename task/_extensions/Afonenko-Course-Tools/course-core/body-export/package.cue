package coursebody

import "list"

// Common package ownership/membership promoted from Core #8; truthful installed schema.
packageData: {
	schema:  "course-body-package-v1"
	owner:   string & =~"^[a-z][a-z0-9-]*$"
	release: string & !=""
	apiVersion: [...int & >=0] & list.MinItems(1)
	questions: [...{
		key:    "\(owner)/\(id)", owner:   string, id: string & =~"^exr-[a-z0-9][a-z0-9-]*$"
		source: string & !="", visibility: "public", condition: [...], publicAnswer: [...]
		answerType: "manual" | "single-choice" | "numeric" | "multipart" | "matching"
		closedKey:  _, solution: [...], gradingNotes: [...]
	}] & list.MinItems(1)
	works: [...{
		key:  "\(owner)/\(id)", owner:        string, id: string & =~"^[a-z][a-z0-9-]*$", source: string & !=""
		kind: "lab" | "test" | "exam" | "handout", title: string & !="", items: [...string] & list.MinItems(1) & list.UniqueItems
        requirements?: {[string]: "required" | "optional"}
	}] & list.MinItems(1)
	resources: [...]
	_keys: [for q in questions {q.key}] & list.UniqueItems
	_workKeys: [for w in works {w.key}] & list.UniqueItems
	for q in questions {_owners: (q.id): true & (q.owner == owner)}
	for w in works {
		_owners: (w.id): true & (w.owner == owner)
		for k in w.items {_references: (w.key): (k): true & list.Contains(_keys, k)}
	}
	for q in questions {_used: (q.id): true & list.Contains(list.Concat([for w in works {w.items}]), q.key)}
}
