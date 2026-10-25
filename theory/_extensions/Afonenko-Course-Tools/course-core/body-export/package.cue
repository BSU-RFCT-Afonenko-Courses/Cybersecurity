package coursebody

import (
	"list"
	"strings"
)

#Assignment: {
	stage?:      "demonstration" | "classroom" | "homework"
	requirement: "required" | "optional"
	workMode:    "individual" | "pair" | "group"
}
#Slot: {
	id:        string & =~"^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*/(exr|alt)-[a-z0-9][a-z0-9-]*$"
	selection: "fixed" | "random" | "choice"
	candidates: [...string & =~"^[a-z][a-z0-9-]*/exr-[a-z0-9][a-z0-9-]*$"] & list.UniqueItems
	assignment: #Assignment
	if selection == "choice" {assignment:requirement:"required"}
	if selection == "fixed" {candidates: list.MinItems(1) & list.MaxItems(1)}
	if selection == "random" || selection == "choice" {candidates: list.MinItems(2)}
}
#Question: {
	owner:               string
	id:                  string & =~"^exr-[a-z0-9][a-z0-9-]*$"
	key:                 "\(owner)/\(id)"
	source:              string & !=""
	title?:              string & !=""
	difficulty?:         "introductory" | "intermediate" | "advanced"
	time?:               number & >0
	visibility:          "public"
	statementVisibility: "open" | "restricted"
	purpose?:            "demonstration" | "discussion" | "independent-study" | "control"
	hasPublicSolution:   bool
	condition: [...]
	publicAnswer: [...]
	answerType: "manual" | "single-choice" | "numeric" | "multipart" | "matching"
	closedKey:  _
	solution: [...]
	gradingNotes: [...]
}
#Work: {
	owner:  string
	id:     string & =~"^[a-z][a-z0-9-]*$"
	key:    "\(owner)/\(id)"
	source: string & !=""
	kind:   "lab" | "seminar" | "practical" | "test"
	title:  string & !=""
	introduction?: [...]
	slots: [...#Slot] & list.MinItems(1)
	_slotIds: [for slot in slots {slot.id}] & list.UniqueItems
	_candidates: list.Concat([for slot in slots {slot.candidates}]) & list.UniqueItems
	relatedExercise?: string & =~"^exr-[a-z0-9][a-z0-9-]*$"
	theoryTime?:      number & >0
}
packageData: #Package
#Package: {
	schema:  "course-body-package-v2"
	owner:   string & =~"^[a-z][a-z0-9-]*$"
	release: string & !=""
	apiVersion: [...int & >=0] & list.MinItems(1)
	questions: [...#Question] & list.MinItems(1)
	works: [...#Work] & list.MinItems(1)
	resources: [...]
	_keys: [for q in questions {q.key}] & list.UniqueItems
	_workKeys: [for w in works {w.key}] & list.UniqueItems
	for q in questions {_owners: (q.id): true & (q.owner == owner)}
	for w in works {
		_owners: (w.id): true & (w.owner == owner)
		for slot in w.slots {
			if slot.selection == "fixed" {_slotIdentity: (w.key): (slot.id): true & (slot.id == w.key+"/"+strings.TrimPrefix(slot.candidates[0], owner+"/"))}
			if slot.selection == "random" {_slotIdentity: (w.key): (slot.id): true & strings.HasPrefix(slot.id, w.key+"/alt-")}
			for k in slot.candidates {
				_references: (w.key): (k): true & list.Contains(_keys, k)
				for q in questions if q.key == k {
					if w.kind == "test" || w.kind == "practical" {_statementPolicy: (w.key): (k): q.statementVisibility & "restricted"}
					if slot.assignment.stage != _|_ {if slot.assignment.stage == "demonstration" {
						_demonstration: (w.key): (k): {statementVisibility: q.statementVisibility & "open", purpose: q.purpose & "demonstration", hasPublicSolution: q.hasPublicSolution & true}
					}}
				}
			}
		}
	}
	for q in questions {_used: (q.id): true & list.Contains(list.Concat([for w in works {list.Concat([for slot in w.slots {slot.candidates}])}]), q.key)}
}
