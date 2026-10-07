package course

import "list"

// BEGIN GENERATED VOCABULARY
// Производный словарь; изменяйте contract-vocabulary.json.
#ExercisePurpose: "demonstration" | "discussion" | "independent-study" | "control"
#PedagogicalKind: "exercise" | "solution" | "hint" | "demonstration" | "prediction" | "discussion" | "self-check" | "objectives" | "prerequisites" | "reading" | "takeaway" | "limitation" | "misconception" | "criteria" | "deliverables" | "independent-study" | "control"
#Difficulty: "introductory" | "intermediate" | "advanced"
#WorkMode: "individual" | "pair" | "group"
#Requirement: "required" | "recommended" | "optional"
#AssessmentKind: "lab" | "test" | "exam" | "handout"
#MemberKind: "BulletList" | "OrderedList"
#View: "student" | "full"
#ActivityKinds: ["exercise","demonstration","prediction","discussion","self-check","independent-study","control"]
#MaxMinutes: 1000000
// END GENERATED VOCABULARY

#Head: {kind: "Header", level: int & >=1 & <=6, title: string & !=""}
#Body: {"pandoc-api-version": [...int], meta: {...}, blocks: [...]}
#Exercise: {
	id:              string & =~"^exr-[a-z0-9][a-z0-9-]*$"
	target?:         string & !=""
	authoredTarget?: string & !=""
	if authoredTarget != _|_ {target: authoredTarget}
	purpose?:   #ExercisePurpose
	difficulty?: #Difficulty
	time?:      int & >0 & <=#MaxMinutes
	workMode?:  #WorkMode
	sourceTopic?: {id: string & !="", owner?: string & !="", rootQmd: string & !=""}
	project: string
	head: {kind: string, level: int & >=0 & <=6, title: string}
	if authoredTarget != _|_ {head: #Head}
	body: #Body
	gradingNotes?: [...#Body]
	nested: 0
	unknownAttributes: []
	source: string
	extensions: {[string]: _}
}
#Assessment: {
	id:    string & =~"^[a-z][a-z0-9-]*$"
	kind:  #AssessmentKind
	title: string & !=""
	body:  #Body
	items: [...string] & list.MinItems(1) & list.UniqueItems
	requirements?: {[string]: "required" | "optional"}
	memberContainers: 1
	memberKinds: [#MemberKind]
	memberSizes: [...1]
	source: string
	extensions: {[string]: _}
}
#Source: {inline: string & !=""} | {file: string & =~"^/[^.]"}
#PedagogicalMetadata: {
	difficulty?:  #Difficulty
	time?:        int & >0 & <=#MaxMinutes
	workMode?:    #WorkMode
	requirement?: #Requirement
}
#PedagogicalElement: {
	kind: #PedagogicalKind
	id?:  string & !=""
	if kind == "exercise" {id: string & =~"^exr-[a-z0-9][a-z0-9-]*$"}
	exercise?: string & =~"^ex[rm]-[a-z0-9][a-z0-9-]*$"
	title?:    string
	metadata?: #PedagogicalMetadata
	if kind != "reading" {metadata?: {requirement?: _|_}}
	if !list.Contains(#ActivityKinds, kind) {
		metadata?: {difficulty?: _|_, time?: _|_, workMode?: _|_}
	}
	order:  int & >0
	body:   #Body
	source: string
}
#Pedagogy: {
	elements: [...#PedagogicalElement]
	documents?: [...{source: string, defaults: #PedagogicalMetadata & {requirement?: _|_}}]
	CORE006_uniquePedagogicalIds: [for e in elements if e.id != _|_ {"\(e.source)#\(e.id)"}] & list.UniqueItems
	CORE007_existingPedagogicalExercise: {
		for e in elements if e.exercise != _|_ {
			"\(e.source)/\(e.order)": list.Contains([
				for target in elements
				if target.source == e.source && target.id != _|_
				if list.Contains(#ActivityKinds, target.kind) {target.id}
			], e.exercise) & true
		}
	}
}
#Course: {
	course: {id?: string & =~"^[a-z][a-z0-9-]*$", view?: #View}
	registeredTargets: [...string] & list.UniqueItems
	exercises: [...#Exercise]
	assessments: [...#Assessment]
	pedagogy?: #Pedagogy
	CORE001_uniqueExerciseIds: [for e in exercises {e.id}] & list.UniqueItems
	CORE002_uniqueAssessmentIds: [for a in assessments {a.id}] & list.UniqueItems
	CORE003_registeredTargets: {
		for e in exercises if e.target != _|_ {(e.id): list.Contains(registeredTargets, e.target) & true}
	}
	CORE004_existingMembers: {
		for a in assessments {
			for id in a.items {
				"\(a.id)/\(id)": list.Contains([for e in exercises {e.id}], id) & true
			}
		}
	}
	for e in exercises if e.gradingNotes != _|_ {course: view: "full"}
	CORE008_canonicalSource: {for e in exercises if e.sourceTopic != _|_ {(e.id): {source: e.sourceTopic.rootQmd & e.source}}}
}
