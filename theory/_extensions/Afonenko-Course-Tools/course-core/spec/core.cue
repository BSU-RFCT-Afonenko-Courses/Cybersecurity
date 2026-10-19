package course

import "list"

// BEGIN GENERATED VOCABULARY
// Производный словарь; изменяйте contract-vocabulary.json.
#ExercisePurpose: "demonstration" | "discussion" | "independent-study" | "control"
#PedagogicalKind: "exercise" | "solution" | "hint" | "demonstration" | "discussion" | "objectives" | "prerequisites" | "reading" | "takeaway" | "limitation" | "misconception" | "criteria" | "deliverables" | "independent-study" | "control"
#Difficulty: "introductory" | "intermediate" | "advanced"
#WorkMode: "individual" | "pair" | "group"
#Requirement: "required" | "optional"
#AssessmentKind: "lab" | "seminar" | "practical" | "test"
#MemberKind: "BulletList" | "OrderedList"
#View: "student" | "full"
#Stage: "demonstration" | "classroom" | "homework"
#StatementVisibility: "open" | "restricted"
#ActivityKinds: ["exercise","demonstration","discussion","independent-study","control"]
// END GENERATED VOCABULARY

#Assignment: {stage?: #Stage, requirement: "required" | "optional", workMode: #WorkMode}
#Slot: {
  id: string
  selection: "fixed" | "random"
  candidates: [...string & =~"^exr-[a-z0-9][a-z0-9-]*$"] & list.UniqueItems
  assignment: #Assignment
  if selection == "fixed" {id: candidates[0], candidates: list.MinItems(1) & list.MaxItems(1)}
  if selection == "random" {id: =~"^alt-[a-z0-9][a-z0-9-]*$", candidates: list.MinItems(2)}
}
#Declaration: {id: string & =~"^exr-[a-z0-9][a-z0-9-]*$", source: string & !="", difficulty: #Difficulty, time?: int & >0, statementVisibility: #StatementVisibility, purpose?: #ExercisePurpose, hasSolution: bool, hasPublicSolution: bool}
#Composition: {
  id: string & =~"^[a-z][a-z0-9-]*$", source: string, kind: #AssessmentKind, title: string & !=""
  slots: [...#Slot] & list.MinItems(1)
  _slotIds: [for slot in slots {slot.id}] & list.UniqueItems
  _candidates: list.Concat([for slot in slots {slot.candidates}]) & list.UniqueItems
  relatedExercise?: string
  theoryTime?: number & >0
  memberContainers: int & >=1, memberKinds: [...#MemberKind], memberSizes: [...1]
  _containers: len(memberKinds) & memberContainers
  _sizes: len(memberSizes) & len(slots)
}

#Head: {kind: "Header", level: int & >=1 & <=6, title: string & !=""}
#Body: {"pandoc-api-version": [...int], meta: {...}, blocks: [...]}
#Exercise: {
	id:              string & =~"^exr-[a-z0-9][a-z0-9-]*$"
	target?:         string & !=""
	authoredTarget?: string & !=""
	if authoredTarget != _|_ {target: authoredTarget}
	purpose?:   #ExercisePurpose
	difficulty: #Difficulty
	time?:      int & >0
	statementVisibility: #StatementVisibility
	hasSolution: bool, hasPublicSolution: bool
	sourceTopic?: {id: string & !="", owner?: string & !="", rootQmd: string & !=""}
	project: string
	head: {kind: string, level: int & >=0 & <=6, title: string}
	if target != _|_ {head: #Head}
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
	slots: [...#Slot] & list.MinItems(1)
  _slotIds: [for slot in slots {slot.id}] & list.UniqueItems
  _candidates: list.Concat([for slot in slots {slot.candidates}]) & list.UniqueItems
	theoryTime?: number & >0
  relatedExercise?: string
	memberContainers: int & >=1
	memberKinds: [...#MemberKind] & list.MinItems(1)
	_members: len(memberKinds) & memberContainers
	_sizes: len(memberSizes) & len(slots)
	memberSizes: [...1]
	source: string
	extensions: {[string]: _}
}
#Source: {inline: string & !=""} | {file: string & =~"^/[^.]"}
#PedagogicalMetadata: {
	difficulty?:  #Difficulty
	time?:        int & >0
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
#SourceProfile: {mode:"implementation"|"student-tests",root:string & !="",include:[...string] & list.MinItems(1)}
#VerificationExpectation: {"student-compilation"?:"success"|"failure",job?:"complete"|"failure","required-tests"?:"all-pass",classification?:string,"failed-tests"?:{"at-least"?:int & >=0,exactly?:int & >=0},"executed-tests"?:{"at-least"?:int & >=0,exactly?:int & >=0},"test-ids"?:[...string],score?:{"less-than"?:number & >=0,"at-least"?:number & >=0,exactly?:number & >=0}}
#Scoring: {mode:"weighted"} | {mode:"all-pass"} | {mode:"contract-groups",groups:[...{id:string & !="",weight:number & >0,tests:[...string] & list.MinItems(1)}] & list.MinItems(1)} | {mode:"threshold",basis:"score"|"passed-tests",value:number & >=0}
#ResolvedProjectCheck: CHECK={
 profile:string & !="",runtime:string & !="",sourceProfile:#SourceProfile,"source-profile":string & !="",tests:[...string]
 java?:{release:int & >0,encoding?:string & !="","compiler-options"?:[...string]}
 limits?:{"outer-seconds"?:number & >0,"compile-seconds"?:number & >0,"run-seconds"?:number & >0,networking?:false,"max-output-bytes"?:int & >0}
 scoring:#Scoring
 references?:[...{name:string & !="",root:string & !="",optional:bool}]
 "verification-tests"?:[...string],"contract-cases"?:string & !=""
 "verification-expectations"?:{reference?:#VerificationExpectation,starter?:#VerificationExpectation}
 discovery?:{"min-executed"?:int & >0,"allow-skipped"?:bool}
 variants?:{correct:[...string] & list.MinItems(1),mutants:[...string] & list.MinItems(1)}
 "additional-java-sources"?:#AdditionalJavaSources
 if CHECK["additional-java-sources"] != _|_ {runtime:"java25-junit-v1",sourceProfile:mode:"implementation"}
 "api-precheck"?:#ApiPrecheck
 "verification-api-precheck"?:#ApiPrecheck
 if CHECK["api-precheck"] != _|_ {runtime:"java25-junit-v1",sourceProfile:mode:"implementation"}
 if CHECK["verification-api-precheck"] != _|_ {runtime:"java25-junit-v1",sourceProfile:mode:"implementation"}
}
#AdditionalJavaSources: {archive:string & =~"^[A-Za-z0-9][A-Za-z0-9_-]{0,100}\\.zip$","max-files":int & >=1 & <=128,"max-file-bytes":int & >=1 & <=1048576,"max-total-bytes":int & >=1 & <=4194304,"max-archive-bytes":int & >=1 & <=2097152}
#ApiPrecheck: {files:[...string & !=""] & list.MinItems(1),entry:string & =~"^[A-Za-z_$][A-Za-z0-9_$]*(\\.[A-Za-z_$][A-Za-z0-9_$]*)*$"}
#ProjectFact: {exerciseId:string, source:string, projectRoot:string & !="", bankMember:bool, purpose?:#ExercisePurpose, statementVisibility:#StatementVisibility, artifactPolicy:{student?:"starter"|"full",full:"full",conditions:bool},check?:#ResolvedProjectCheck}
#TopicFact: {source:string,semester?:string,categories:[...string]}
#Course: {
  projects?: [...#ProjectFact]
  topics?: [...#TopicFact]
	course: {id?: string & =~"^[a-z][a-z0-9-]*$", view?: #View}
	registeredTargets: [...string] & list.UniqueItems
	exercises: [...#Exercise]
	assessments: [...#Assessment]
	pedagogy?: #Pedagogy
	declarations?: [...#Declaration]
	assessmentCompositions?: [...#Composition]
	_facts: [...]
	_works: [...]
	if declarations != _|_ {_facts: declarations}
	if declarations == _|_ {_facts: [for e in exercises {{id:e.id, source:e.source, difficulty:e.difficulty,if e.time != _|_ {time:e.time},statementVisibility:e.statementVisibility,purpose?:e.purpose,hasSolution:e.hasSolution,hasPublicSolution:e.hasPublicSolution}}]}
	if assessmentCompositions != _|_ {_works: assessmentCompositions}
	if assessmentCompositions == _|_ {_works: assessments}
	_rawIds: [for e in _facts {e.id}] & list.UniqueItems
	CORE001_uniqueExerciseIds: [for e in exercises {e.id}] & list.UniqueItems
	CORE002_uniqueAssessmentIds: [for a in assessments {a.id}] & list.UniqueItems
	CORE003_registeredTargets: {
		for e in exercises if e.target != _|_ {(e.id): list.Contains(registeredTargets, e.target) & true}
	}
	_relatedExercises: {for a in _works if a.relatedExercise != _|_ {(a.id): list.Contains([for e in _facts {e.id}],a.relatedExercise) & true}}
	CORE004_existingMembers: {
		for a in _works {
			for slot in a.slots { for id in slot.candidates {
				"\(a.id)/\(id)": list.Contains([for e in _facts {e.id}], id) & true
			}}
		}
	}
	_assignmentPolicy: {
    for a in _works {
      for slot in a.slots { for id in slot.candidates {
        for e in _facts if e.id == id {
          if a.kind == "test" || a.kind == "practical" {"\(a.id)/\(id)/closed": e.statementVisibility & "restricted"}
          if slot.assignment.stage != _|_ { if slot.assignment.stage == "demonstration" {
            "\(a.id)/\(id)/visibility": e.statementVisibility & "open"
            "\(a.id)/\(id)/purpose": e.purpose & "demonstration"
            "\(a.id)/\(id)/solution": e.hasPublicSolution & true
          }}
        }
      }}
    }
  }
	for e in exercises if e.gradingNotes != _|_ {course: view: "full"}
	CORE008_canonicalSource: {for e in exercises if e.sourceTopic != _|_ {(e.id): {source: e.sourceTopic.rootQmd & e.source}}}
}
