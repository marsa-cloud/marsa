// Marker base for a use-case's filter DTO. Empty on purpose — each use-case
// defines its own filter fields. A class (not an interface) so class-transformer
// can nest it via @Type() and so it avoids the empty-interface lint rule.
// Named `BaseFilterQuery`, not `FilterQuery`, so it never collides with the ORM's
// own `FilterQuery<T>` in repositories that import both.
export abstract class BaseFilterQuery {}
