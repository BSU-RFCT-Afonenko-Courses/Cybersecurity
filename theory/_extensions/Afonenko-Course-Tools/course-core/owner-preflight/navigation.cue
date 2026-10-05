package navigationowner

import (
	"list"
	"strings"
)

#Row: {kind: string, id: string, classes: [...string], attributes: [...{key: string, value: string}]}
#Transport: {input: {assessment: bool, pedagogy: bool, rows: [...#Row]}}
input: #Transport.input
report: {diagnostics: [
	if input.assessment || input.pedagogy {code: "NAVIGATION.PEDAGOGICAL_METADATA"},
	for x in input.rows
	if strings.HasPrefix(x.id, "exr-") || strings.HasPrefix(x.id, "sol-") || len([for c in x.classes if list.Contains(["solution", "grading-notes", "assessment-items", "cell", "cell-output", "cell-output-display", "cell-code"], c) {c}]) > 0 || len([for a in x.attributes if list.Contains(["course-role", "target", "project", "for", "difficulty", "time", "work-mode", "requirement"], a.key) {a}]) > 0 {
		code: "NAVIGATION.PEDAGOGICAL_OR_COMPUTED_BLOCK", id: x.id, kind: x.kind
	},
]}
