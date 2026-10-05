package probe
import "list"
#Manual: {type: "manual", submission: "text"}
#Numeric: {type: "numeric", key: {value: number, tolerance: {absolute: number & >=0}}}
#Part: { (#Manual | #Numeric)
 name: string & =~"^[a-z][a-z0-9-]*$", label: string & !=""}
#Multipart: {
 type: "multipart"
 parts: [...#Part] & list.MinItems(1)
 _names: [for p in parts {p.name}]
 _unique: true & list.UniqueItems(_names)
}
#Matching: {
 type: "matching"
 prompts: [...string & !=""] & list.MinItems(1)
 options: [...string & !=""] & list.MinItems(1)
 key: pairs: {[string]: string}
 _pUnique: true & list.UniqueItems(prompts)
 _oUnique: true & list.UniqueItems(options)
 _keys: [for k, _ in key.pairs {k}]
 _count: true & (len(_keys)==len(prompts))
 for p in prompts {key: pairs: "\(p)": string}
 for k, v in key.pairs {_checks: "\(k)": {p: true & list.Contains(prompts,k), o: true & list.Contains(options,v)}}
}
#Choice: {type: "single-choice", count: int & >=2, markedCount: 1, correct: int & >=0 & <count}
answer: #Manual | #Numeric | #Multipart | #Matching | #Choice
