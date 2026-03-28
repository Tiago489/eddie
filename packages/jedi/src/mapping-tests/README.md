# Mapping Test Fixtures

Test fixtures validate that JSONata mapping expressions produce the correct TMS output for real production EDI files.

## Two Ways to Add Fixtures

### 1. UI Upload (recommended)
Navigate to **Mappings > [mapping] > Test Fixtures** in the Eddie web UI. Drag and drop an `.edi` file — the system will:
1. Parse the EDI through x12Parser
2. Evaluate the mapping's JSONata expression
3. Validate output against the TMS schema
4. Save the fixture with auto-generated expected output

### 2. Codebase Drop
Create a directory in `packages/jedi/src/mapping-tests/fixtures/` with these files:

```
fixtures/
  expeditors-204-inbound/
    input.edi              # Raw X12 EDI file
    expected-output.json   # Expected TMS JSON output
    mapping.jsonata        # JSONata mapping expression
```

All three files are required.

## Naming Convention

Fixture directories follow: `{carrier-slug}-{transactionSet}-{direction}`

Examples:
- `expeditors-204-inbound`
- `dhl-214-outbound`
- `forward-air-211-inbound`
- `arcbest-210-outbound`

## Running Tests

```bash
# Run all mapping fixture tests
pnpm test:mappings

# Filter by carrier name
pnpm test:mappings --carrier=Expeditors

# Update expected-output.json snapshots from current mapping output
pnpm test:mappings --update
```

## How It Works

Each test fixture runs through this pipeline:
1. **Parse**: `input.edi` → x12Parser → ParsedEnvelope
2. **Transform**: ParsedEnvelope → toJedi204() → JediDocument
3. **Map**: JediDocument + `mapping.jsonata` → JsonataEvaluator → TMS output
4. **Compare**: TMS output vs `expected-output.json` (deep equality)
5. **Validate**: TMS output vs defaultTmsSchema (required fields check)

A fixture **passes** when both comparison and validation succeed.

## Updating Snapshots

When you intentionally change a mapping expression, the expected output will change. Run:

```bash
pnpm test:mappings --update
```

This re-evaluates every fixture's mapping and overwrites `expected-output.json` with the new output. Review the diff before committing.
