// Marker base for a use-case's filter DTO. Empty on purpose — each use-case
// defines its own filter fields. A class (not an interface) so class-transformer
// can nest it via @Type() and so it avoids the empty-interface lint rule.
export abstract class FilterQuery {}
