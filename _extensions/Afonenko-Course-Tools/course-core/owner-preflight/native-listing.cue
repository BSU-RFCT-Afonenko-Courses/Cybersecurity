package nativelisting

// Closed, typed producer data. No artifact permission is expressed here.
#Sha256: string & =~"^[a-f0-9]{64}$"
#Sha1:   string & =~"^[a-f0-9]{40}$"
#Path:   string & =~"^[A-Za-z0-9À-ɏЀ-ԯ_.\\-/]+$" & !~"(^/|//|(^|/)\\.\\.?(/|$))"
#Plain:  string & =~"^[A-Za-z0-9À-ɏЀ-ԯ0-9 ,.\\-]+$" & !~"(^ | $)"
#Writer: {
	source:              #Path
	sourceHash:          #Sha256
	documentInspectHash: #Sha256
	inspectedOutputFile: string & =~"\\.html$" & !~"[?#%&:'\"<>\\\\[:space:]]"
	artifact:            #Path & =~"\\.html$"
	outputUri:           "/" + artifact
}
#Title: {kind: "source-header"} | {kind: "metadata", value: #Plain}
#Row: {
	Source=source:                           #Path & =~"/index\\.qmd$"
	SourceHash=sourceHash:                   #Sha256
	sourceSha1:                              #Sha1
	sourceBytes:                             int & >=1 & <=9007199254740991
	mtimeMs:                                 int & >=0 & <=9007199254740991
	reader:                                  "markdown"
	DocumentInspectHash=documentInspectHash: #Sha256
	sourceHref:                              "/" + source
	categories: [#Plain, ...#Plain]
	semester?: int & >=1 & <=16
	title:     #Title
	writer: #Writer & {source: Source, sourceHash: SourceHash, documentInspectHash: DocumentInspectHash}
}
#Declaration: {
	index: int & >=0 & <=2
	id:    string & =~"^[a-z][a-z0-9-]*$"
	fields: ["title", "categories"] | ["title", "semester", "categories"]
	displayNames: {title: #Plain, categories: #Plain, semester?: #Plain}
	selector: {depth: 1 | 2}
	include?: {difficulty?: string & =~"^[a-z][a-z-]*$", semester?: int & >=1 & <=16}
	sort:      "title"
	pageSize:  10 | 30
	filterUi:  false
	sortUi:    false
	noMatches: #Plain
	rows: [#Row, ...#Row]
	if len(fields) == 2 {displayNames: {semester?: _|_}}
	if len(fields) == 3 {displayNames: {semester: #Plain}, rows: [...{semester: int & >=1 & <=16}]}
	if len(rows) > pageSize {_invalidPagination: _|_}
}
#Plan: {
	protocol:                                1
	root:                                    string & =~"^/" & !~"/$"
	profile:                                 "student" | "full"
	Source=source:                           #Path & =~"\\.qmd$"
	key:                                     profile + ":" + source
	SourceHash=sourceHash:                   #Sha256
	sourceSha1:                              #Sha1
	sourceBytes:                             int & >=1 & <=9007199254740991
	mtimeMs:                                 int & >=0 & <=9007199254740991
	DocumentInspectHash=documentInspectHash: #Sha256
	reader:                                  "markdown"
	inputConstructor:                        "identity" | "book-part-title-transfer"
	providerHash:                            #Sha256
	providerVersion:                         "1.10.18" | "1.11.5"
	sourceWriter: #Writer & {source: Source, sourceHash: SourceHash, documentInspectHash: DocumentInspectHash}
	selectedWriters: [#Writer, ...#Writer]
	declarations: [#Declaration, ...#Declaration]
	libraryDirectory: #Path
	appendOrder: ["quarto-navigation-envelope", "quarto-listing-pipeline", "quarto-meta-markdown"]
	planHash: #Sha256
	if len(declarations) > 3 {_invalidDeclarations: _|_}
	for i, d in declarations {if d.index != i {_invalidOrder: _|_}}
}
#Transport: {plans: {[string]: #Plan}}
input: #Transport
