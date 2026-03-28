# Mapping Test Fixtures

Test fixtures validate that JSONata mapping expressions produce the correct TMS output for real production EDI files.

## Directory Structure

Each mapping has its own directory, with subdirectories for individual fixtures:

```
fixtures/
  expeditors-204-inbound/          ← mapping slug
    shipment-001/                   ← fixture name (from uploaded filename)
      input.edi                     ← raw X12 EDI file
      expected-output.json          ← expected TMS JSON output
      mapping.jsonata               ← JSONata mapping expression snapshot
    shipment-002/
      input.edi
      expected-output.json
      mapping.jsonata
  dhl-214-outbound/
    invoice-batch-march/
      input.edi
      expected-output.json
      mapping.jsonata
```

All three files are required per fixture.

## Two Ways to Add Fixtures

### 1. UI Upload (recommended)
Navigate to **Mappings > [mapping] > Test Fixtures** in the Eddie web UI. Drag and drop `.edi` files — each creates a new fixture subdirectory. Uploading a file with the same name as an existing fixture appends a timestamp to avoid overwriting.

### 2. Codebase Drop
Create a directory in `fixtures/{mapping-slug}/{fixture-name}/` with all three files.

## Naming Conventions

- **Mapping slug**: `{carrier-slug}-{transactionSet}-{direction}` e.g. `expeditors-204-inbound`, `dhl-214-outbound`
- **Fixture name**: derived from uploaded filename (slugified), or any descriptive name e.g. `shipment-001`, `missing-consignee-edge-case`

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
2. **Transform**: ParsedEnvelope → toJedi() → JediDocument (auto-routes by transaction set)
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
