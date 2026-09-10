# Lint fixtures

One directory per rule id. The engine must produce exactly the expected
findings for that rule; findings from other rules are ignored, so a fixture
that trips a second rule incidentally still tests only its own.

```
<rule-id>/pass-*.json    a document (or {"docs": [...]}) that produces no finding for this rule
<rule-id>/fail-*.json    {"expect": [{rule, blockId?, messageIncludes}], "doc": {...}}
                         or the same with "docs": [...] for cross-document rules
```

`docs` exists because `module-depth-5` and the document-name half of
`unique-names` cannot be evaluated against a single document. A rule that needs
a set gets one.

Every pass fixture is also validated against
`conformance/schema/flowdoc-0.1.schema.json`, so a fixture cannot pass lint by
being malformed in a way the schema would have caught.
