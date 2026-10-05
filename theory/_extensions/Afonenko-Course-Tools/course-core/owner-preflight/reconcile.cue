package ownerpreflight

import (
	"list"
	"strings"
)

// BEGIN GENERATED VOCABULARY
#ExercisePurpose: "demonstration" | "discussion" | "independent-study" | "control"
#Difficulty: "introductory" | "intermediate" | "advanced"
#WorkMode: "individual" | "pair" | "group"
#ExercisePurposeValues: ["demonstration","discussion","independent-study","control"]
#DifficultyValues: ["introductory","intermediate","advanced"]
#WorkModeValues: ["individual","pair","group"]
#CanonicalAttributes: ["target","project","course-role","difficulty","time","work-mode","requirement","for"]
// END GENERATED VOCABULARY

// Private attempt transport, not the public Course/Fragment educational schema.
#Attribute: {key: string, value: string}
#Parent: {id: string, classes: [...string], attributes: [...#Attribute]}
#Occurrence: {
	contentJson: string, id: string, classes: [...string], attributes: [...#Attribute], kind: string, ancestors: [...#Parent], order: int & >0, ancestorOrders: *[] | [...int], firstKind: *"" | string
	if kind == "Header" {topLevel: bool, level: int & >=1 & <=6, title: string, titleJson: string}
}
#RawDocument: {navigation?: _, resources?: _, nativeShape: string, readerShape: string, source: string & !="", owner: string & !="", occurrences: [...#Occurrence], assessment: string, assessmentFacts: {enabled: bool, chapterId: string, title: string, headers: [...{id: string, title: string}]}, readerReplay?: {status: "ok", input: string, inputPath: string & !="", inputHash: string & =~"^[a-f0-9]{64}$", ordinaryReader: string, reader: ordinaryReader + "-auto_identifiers", options: _, nativeShape: string, ordinaryShape: string}}
#Document: {#RawDocument, identity?: #RawDocument}
#Transport: {input: {mode: "inventory" | "reconcile" | "references", referenceProfile: *"student" | "full", before: [...#Document], after: [...#Document]}}
input: #Transport.input
#Select: {
	document: #Document
	facts: [for x in document.occurrences
		if x.kind == "Div"
		if strings.HasPrefix(x.id, "exr-") || strings.HasPrefix(x.id, "sol-") || list.Contains(x.classes, "solution") || list.Contains(x.classes, "assessment-items") || len([for a in x.attributes if a.key == "course-role" {a}]) > 0 {
			identity: {
				id: x.id, kind: x.kind, classes: x.classes, attributes: x.attributes, ancestors: x.ancestors
				if len([for a in x.attributes if a.key == "target" {a}]) > 0 {headKind: x.firstKind}
				if list.Contains(x.classes, "assessment-items") {members: x.contentJson}
			}
			source: {rootQmd: document.source, owner: document.owner}
			occurrence: x.order
		}]
}

// Existing assessment.collect identity rule, applied to raw native facts.
#AssessmentIdentity: {
	document: #Document
	let f = document.assessmentFacts
	value: {
		if !f.enabled {enabled: false, id: "", title: "", route: "disabled"}
		if f.enabled {
			enabled: true
			if f.chapterId != "" {id: f.chapterId, title: f.title, route: "chapter"}
			if f.chapterId == "" && len(f.headers) > 0 {id: f.headers[0].id, title: f.headers[0].title, route: "header"}
			if f.chapterId == "" && len(f.headers) == 0 {id: "", title: "", route: "absent"}
		}
	}
}
_beforeGroups: [for d in input.before {#Select & {document: d}}]
_afterGroups: [for d in input.after {#Select & {document: d}}]
_before: [for g in _beforeGroups for f in g.facts {f}]
_after: [for g in _afterGroups for f in g.facts {f}]
#Headers: {
	document: #Document
	values: [for x in document.occurrences if x.kind == "Header" {
		id: x.id
		shape: {topLevel: x.topLevel, level: x.level, title: x.title, titleJson: x.titleJson, classes: x.classes, attributes: x.attributes, ancestors: x.ancestors}
	}]
}
#HeaderProof: {
	document: #Document
	let native = document
	source: {rootQmd: native.source, owner: native.owner}
	normal: (#Headers & {document: native}).values
	identity: (#Headers & {document: native.identity}).values
	readerShape:   native.readerShape
	identityShape: native.identity.readerShape
	identitySource: {rootQmd: native.identity.source, owner: native.identity.owner}
	if native.identity.readerReplay == _|_ {replayMatched: true}
	if native.identity.readerReplay != _|_ {
		replayMatched: native.identity.readerReplay.nativeShape == native.nativeShape && native.identity.readerReplay.ordinaryShape == native.nativeShape
	}
}
_beforeHeaderPairs: [for d in input.before {#HeaderProof & {document: d}}]
_afterHeaderPairs: [for d in input.after if d.identity != _|_ {#HeaderProof & {document: d}}]
_headerPairs: list.Concat([_beforeHeaderPairs, _afterHeaderPairs])
_authoredHeaders: [for pair in _beforeHeaderPairs for i, h in pair.identity if h.id != "" {
	topLevel: h.shape.topLevel
	id:       h.id, source:                pair.source, ordinal:          i + 1
	level:    h.shape.level, title:        h.shape.title, titleJson:      h.shape.titleJson
	classes:  h.shape.classes, attributes: h.shape.attributes, ancestors: h.shape.ancestors
}]
// The nearest surrounding Header is a native occurrence, never a guessed slug.
// Candidate ancestry is a prefix of the Exercise ancestry; an exercise title
// is excluded structurally. Header explicitness comes from the paired reader.
#Exercises: {
	document: #Document
	authoredIds: [...string]
	facts: [for x in document.occurrences if x.kind == "Div" && strings.HasPrefix(x.id, "exr-") {
		id: x.id
		source: {rootQmd: document.source, owner: document.owner}
		purposes: [for a in x.attributes if a.key == "course-role" {a.value}]
		difficulties: [for a in x.attributes if a.key == "difficulty" {a.value}]
		invalidFields: [
			if x.id !~ "^exr-[a-z0-9][a-z0-9-]*$" {"id"},
			for a in x.attributes if a.key == "target" && a.value == "" {"target"},
			for a in x.attributes if a.key == "time" && (a.value !~ "^[1-9][0-9]{0,5}$" && a.value != "1000000") {"time"},
			for a in x.attributes if a.key == "work-mode" && !list.Contains(#WorkModeValues, a.value) {"work-mode"},
			for a in x.attributes if !list.Contains(#CanonicalAttributes, a.key) || list.Contains(["for", "requirement"], a.key) {a.key},
			if len([for p in x.ancestors if strings.HasPrefix(p.id, "exr-") {p}]) > 0 {"nested"},
			if len([for a in x.attributes if a.key == "target" {a}]) > 0 && x.firstKind != "Header" {"head"},
		]
		candidates: [for h in document.occurrences if h.kind == "Header" && h.order < x.order
			if len(h.ancestors) <= len(x.ancestors)
			if list.Contains([x.ancestors[:len(h.ancestors)]], h.ancestors)
			if len(h.ancestorOrders) <= len(x.ancestorOrders)
			if list.Contains([x.ancestorOrders[:len(h.ancestorOrders)]], h.ancestorOrders)
			if len([for p in h.ancestors if strings.HasPrefix(p.id, "exr-") {p}]) == 0 {h}]
		sourceTopic: {
			rootQmd: document.source, owner: document.owner
			if len(candidates) == 0 {id: "", authored: false}
			if len(candidates) > 0 {
				id:       candidates[len(candidates)-1].id
				authored: list.Contains(authoredIds, id)
			}
		}
	}]
}
_beforeExercises: [for d in input.before for e in (#Exercises & {document: d, authoredIds: [for h in _authoredHeaders if h.source.rootQmd == d.source && h.source.owner == d.owner {h.id}]}).facts {e}]
_afterExercises: [for d in input.after for e in (#Exercises & {document: d, authoredIds: [for h in _authoredHeaders if h.source.rootQmd == d.source && h.source.owner == d.owner {h.id}]}).facts {e}]
_solutions: [for d in input.before for x in d.occurrences if x.kind == "Div" && strings.HasPrefix(x.id, "sol-") {
	id: x.id, source: {owner: d.owner, rootQmd: d.source}
	matches: [for q in d.occurrences if q.kind == "Div" && ((strings.HasPrefix(q.id, "exr-") && strings.TrimPrefix(q.id, "exr-") == strings.TrimPrefix(x.id, "sol-")) || (strings.HasPrefix(q.id, "exm-") && strings.TrimPrefix(q.id, "exm-") == strings.TrimPrefix(x.id, "sol-"))) {q.id}]
	owners: [for p in x.ancestors if strings.HasPrefix(p.id, "exr-") || strings.HasPrefix(p.id, "exm-") {p.id}]
	links: [for a in x.attributes if a.key == "for" {a.value}]
}]
report: {
	exercises: [for e in _beforeExercises {id: e.id, source: e.source, sourceTopic: {id: e.sourceTopic.id, owner: e.sourceTopic.owner, rootQmd: e.sourceTopic.rootQmd}}]
	headers: _authoredHeaders
	diagnostics: [
		if input.mode == "inventory" || input.mode == "references"
		for d in input.before if d.resources != _|_ if d.resources.references != _|_ if d.resources.profile == input.referenceProfile
		for r in d.resources.references
		if len([for x in _before if x.identity.id == r.id {x}]) > 0
		if len([for other in input.before if other.resources != _|_ && other.resources.canonicalIds != _|_ && other.resources.profile == d.resources.profile for id in other.resources.canonicalIds if id == r.id {id}]) == 0 {
			code: "CORE.PROFILE_REFERENCE_INTEGRITY", severity: "error", phase: "inventory", source: {rootQmd: d.source, owner: d.owner}, id: r.id, field: "reference", related: []
		},
		if input.mode == "inventory"
		for s in _solutions if len(s.matches) != 1 || (len(s.owners) > 0 && !list.Contains([s.matches], s.owners)) || (len(s.links) > 0 && !list.Contains([s.matches], s.links)) {
			code: "CORE.SOLUTION_PAIRING_INVALID", severity: "error", phase: "inventory", source: s.source, id: s.id, field: "solution", related: []
		},
		if input.mode == "inventory"
		for e in _beforeExercises if len(e.purposes) != 1 || len([for p in e.purposes if list.Contains(#ExercisePurposeValues, p) {p}]) != 1 {
			code: "CORE.EXERCISE_PURPOSE_REQUIRED", severity: "error", phase: "inventory", source: e.source, id: e.id, field: "course-role", related: []
		},
		if input.mode == "inventory"
		for e in _beforeExercises if len(e.difficulties) != 1 || len([for d in e.difficulties if list.Contains(#DifficultyValues, d) {d}]) != 1 {
			code: "CORE.EXERCISE_DIFFICULTY_REQUIRED", severity: "error", phase: "inventory", source: e.source, id: e.id, field: "difficulty", related: []
		},
		if input.mode == "inventory"
		for e in _beforeExercises if !e.sourceTopic.authored || e.sourceTopic.id !~ "^sec-[a-z0-9][a-z0-9-]*$" {
			code: "CORE.EXERCISE_SOURCE_TOPIC_REQUIRED", severity: "error", phase: "inventory", source: e.source, id: e.id, field: "sourceTopic", related: []
		},
		if input.mode == "inventory"
		for e in _beforeExercises for invalidField in e.invalidFields {
			code: "CORE.EXERCISE_INVALID", severity: "error", phase: "inventory", source: e.source, id: e.id, field: invalidField, related: []
		},
		if input.mode == "reconcile"
		for b in _beforeExercises for a in _afterExercises if a.id == b.id && list.Contains([b.source], a.source)
		if !list.Contains([b.sourceTopic], a.sourceTopic) {
			code: "CORE.EXERCISE_SOURCE_TOPIC_CHANGED", severity: "error", phase: "reconciliation", source: a.source, id: a.id, field: "sourceTopic", related: [b.source]
		},
		if input.mode != "references"
		for pair in _headerPairs
		if !list.Contains([pair.source], pair.identitySource) || len(pair.normal) != len(pair.identity) ||
			pair.readerShape != pair.identityShape || !pair.replayMatched {
			code: "SOURCE.HEADER_IDENTITY_UNSUPPORTED", severity: "error", phase: "inventory", source: pair.source, id: "", field: "header.identity", related: []
		},
		if input.mode != "references"
		for pair in _headerPairs if len(pair.normal) == len(pair.identity)
		for i, h in pair.identity
		if !list.Contains([pair.normal[i].shape], h.shape) || h.id != "" && h.id != pair.normal[i].id {
			code: "SOURCE.HEADER_IDENTITY_UNSUPPORTED", severity: "error", phase: "inventory", source: pair.source, id: h.id, field: "header.identity", related: []
		},
		if input.mode == "inventory"
		for i, h in _authoredHeaders for j, other in _authoredHeaders if j > i && h.id == other.id {
			code: "CORE.DUPLICATE_HEADER_ID", severity: "error", phase: "inventory", source: other.source, id: other.id, field: "id", related: [h.source]
		},
		if input.mode == "reconcile"
		for b in input.before for a in input.after if b.source == a.source
		if !list.Contains([(#Headers & {document: b}).values], (#Headers & {document: a}).values) {
			code: "CORE.HEADER_SKELETON_CHANGED", severity: "error", phase: "reconciliation", source: {rootQmd: a.source, owner: a.owner}, id: "", field: "headers", related: [{rootQmd: b.source, owner: b.owner}]
		},
		for i, b in _before for j, c in _before
		if j > i && b.identity.id != "" && b.identity.id == c.identity.id {
			code: "CORE.DUPLICATE_DECLARATION", severity: "error", phase: "inventory", source: c.source, id: c.identity.id, field: "id", related: [b.source]
		},
		if input.mode == "reconcile"
		for a in _after
		let matchingBefore = [for b in _before if a.source.rootQmd == b.source.rootQmd && a.source.owner == b.source.owner && list.Contains([b.identity], a.identity) {b}]
		let matchingAfter = [for b in _after if a.source.rootQmd == b.source.rootQmd && a.source.owner == b.source.owner && list.Contains([b.identity], a.identity) {b}]
		if len(matchingAfter) > len(matchingBefore) {
			code: "CORE.DECLARATION_ADDED_OR_CHANGED", severity: "error", phase: "reconciliation", source: a.source, id: a.identity.id, field: "declaration", related: [for b in _before if b.identity.id == a.identity.id {b.source}]
		},
		if input.mode == "reconcile"
		for b in _before
		let matchingBefore = [for a in _before if a.source.rootQmd == b.source.rootQmd && a.source.owner == b.source.owner && list.Contains([a.identity], b.identity) {a}]
		let matchingAfter = [for a in _after if a.source.rootQmd == b.source.rootQmd && a.source.owner == b.source.owner && list.Contains([a.identity], b.identity) {a}]
		if len(matchingBefore) > len(matchingAfter) {
			code: "CORE.DECLARATION_REMOVED_OR_CHANGED", severity: "error", phase: "reconciliation", source: b.source, id: b.identity.id, field: "declaration", related: []
		},
		if input.mode == "reconcile"
		for b in input.before for a in input.after if b.source == a.source
		let beforeIdentity = (#AssessmentIdentity & {document: b}).value
		let afterIdentity = (#AssessmentIdentity & {document: a}).value
		if beforeIdentity.enabled != afterIdentity.enabled || beforeIdentity.id != afterIdentity.id || beforeIdentity.title != afterIdentity.title || beforeIdentity.route != afterIdentity.route {
			code: "CORE.ASSESSMENT_IDENTITY_CHANGED", severity: "error", phase: "reconciliation", source: {rootQmd: a.source, owner: a.owner}, id: "", field: "assessment.identity", related: [{rootQmd: b.source, owner: b.owner}]
		},
		if input.mode == "reconcile"
		for b in input.before for a in input.after if b.source == a.source && b.assessment != a.assessment {
			code: "CORE.ASSESSMENT_METADATA_CHANGED", severity: "error", phase: "reconciliation", source: {rootQmd: a.source, owner: a.owner}, id: "", field: "assessment", related: [{rootQmd: b.source, owner: b.owner}]
		},
	]
}
