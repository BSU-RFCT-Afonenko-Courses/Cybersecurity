package ownerresources

import "list"

// Private native transport. Subject predicates live here, never in callers.
#Use: {source: string, profile: "student" | "full", phase: "capture" | "render", projection: "raw" | "projected", kind: "Link" | "Image", target: string, order: int & >0, path: string & !=""}
#File: {path: string & !="", sha256: string & =~"^[0-9a-f]{64}$", origin: "source" | "generated" | "service", role: "root" | "include" | "resource" | "other"}
#Runtime: {source: string, sourceSha256: string & =~"^[0-9a-f]{64}$", producer: string, dependency: string, version: string, asset: string, kind: "script" | "stylesheet", descriptorPath: string, descriptorSha256: string & =~"^[0-9a-f]{64}$", registrationPath: string, registrationSha256: string & =~"^[0-9a-f]{64}$", markerProvider: string, markerAsset: string}
#Transport: {input: {profile: "student" | "full", baseline: [...#Use], actual: [...#Use], files: [...#File], selections: [...string], filters: *[] | [...string], runtime: *[] | [...#Runtime]}}
input: #Transport.input
_policies: [for f in input.files {
	path:   f.path
	sha256: f.sha256
	baselinePublic: len([for u in input.baseline if u.path == f.path && u.profile == "student" && u.projection == "projected" {u}]) > 0
	baselineSeen: len([for u in input.baseline if u.path == f.path && u.projection == "raw" {u}]) > 0
	baselineClosedOnly: baselineSeen && !baselinePublic
	actualPublic: len([for u in input.actual if u.path == f.path && u.profile == "student" && u.projection == "projected" {u}]) > 0
	let actualSeen = len([for u in input.actual if u.path == f.path && u.profile == input.profile && u.projection == "raw" {u}]) > 0
	let profileUse = len([for u in list.Concat([input.baseline, input.actual]) if u.path == f.path && u.profile == input.profile && u.projection == "projected" {u}]) > 0
	reasons: [
		if f.origin == "service" {"service"},
		if f.role == "root" || f.role == "include" {"canonical-source"},
		if input.profile == "student" && baselineClosedOnly {"closed-baseline"},
		if input.profile == "full" && baselineSeen && !profileUse {"unprojected-baseline"},
		if actualSeen && !profileUse {"unprojected-actual"},
	]
	allowed: len(reasons) == 0
}]
_paths: list.SortStrings([for f in input.files {f.path}])
_runtimeEligibility: [for d in input.runtime {
	source:           d.source, sourceSha256:                 d.sourceSha256, producer: d.producer
	dependency:       d.dependency, version:                  d.version, asset:         d.asset, kind: d.kind
	descriptorPath:   d.descriptorPath, descriptorSha256:     d.descriptorSha256
	registrationPath: d.registrationPath, registrationSha256: d.registrationSha256
	reasons: [
		if d.producer != "course-presentation" {"unsupported-producer"},
		if !list.Contains(input.filters, d.producer) {"inactive-provider"},
		if d.dependency != d.producer {"dependency-producer-mismatch"},
		if d.markerProvider != d.producer || d.markerAsset != d.asset {"marker-mismatch"},
		if len([for f in input.files if f.path == d.source && f.sha256 == d.sourceSha256 && f.origin == "service" {f}]) != 1 {"unverified-source"},
		if len([for f in input.files if f.path == d.descriptorPath && f.sha256 == d.descriptorSha256 && f.origin == "service" {f}]) != 1 {"unverified-descriptor"},
		if len([for f in input.files if f.path == d.registrationPath && f.sha256 == d.registrationSha256 && f.origin == "service" {f}]) != 1 {"unverified-registration"},
	]
	eligible: len(reasons) == 0
}]
report: {
	runtimeEligibility: _runtimeEligibility
	files:              _policies
	diagnostics: [
		for f in input.files if f.origin == "service"
		if len([for use in list.Concat([input.baseline, input.actual]) if use.path == f.path && use.profile == input.profile && use.projection == "projected" {use}]) > 0 {
			code: "RESOURCE.SERVICE_PUBLIC_REFERENCE", path: f.path, reasons: ["service"]
		},
		for use in input.actual
		if len([for f in input.files if f.path == use.path {f}]) == 0 {
			code: "RESOURCE.ACTUAL_FILE_UNPROVEN", path: use.path, reasons: ["unproven-bytes"]
		},
		for p in _policies if input.profile == "student" && p.baselineClosedOnly && p.actualPublic
		for f in input.files if f.path == p.path && f.role != "root" && f.role != "include" {
			code: "RESOURCE.CLOSED_BASELINE_PUBLIC_REFERENCE", path: p.path, reasons: ["closed-baseline"]
		},
		for selected in input.selections
		let matching = [for p in _policies if p.path == selected {p}]
		if len(matching) == 0 {code: "RESOURCE.SELECTION_UNKNOWN", path: selected, reasons: ["unknown"]},
		for selected in input.selections for p in _policies if p.path == selected && !p.allowed {
			code: "RESOURCE.SELECTION_FORBIDDEN", path: selected, reasons: p.reasons
		},
		for i, name in _paths if i > 0 if _paths[i-1] == name {
			code: "RESOURCE.DUPLICATE_FILE_IDENTITY", path: name, reasons: ["duplicate"]
		},
	]
}
