package course
import "list"
#SHA256: string & =~"^[a-f0-9]{64}$"
#Selection: {projectRelativePath:string & !="",submissionRelativePath:string & !="",sha256:#SHA256}
#CheckProject: {
 #ProjectFact
 qualifiedId:string & !=""
 check:#ResolvedProjectCheck
 sources:[...#Selection],trustedTests:[...#Selection],verificationTests:[...#Selection]
 references:[...{name:string,root:string,optional:bool,sources:[...#Selection],available:bool}]
 contractFixtures:[...#Selection]
 contractCasesHash?:{projectRelativePath:string,sha256:#SHA256}
 readiness:{ready:bool,missing:[...string]}
 if readiness.ready {readiness:missing:[],sources:list.MinItems(1),trustedTests:list.MinItems(1)}
 if !readiness.ready {readiness:missing:list.MinItems(1)}
}
#ChecksManifest: {
 schemaVersion:1,courseId:string & =~"^[a-z][a-z0-9-]*$",bookRoot:string & !=""
 sourceSnapshotHash:#SHA256,inventoryHash:#SHA256
 projects:[...#CheckProject]
 _identities:[for p in projects {p.qualifiedId}] & list.UniqueItems
}
