# 02-split_table Example

## What This Tests

This example tests Johnny5's table parsing capabilities, particularly:

- **Page breaks in tables**: A long table (50+ rows) that splits across multiple pages
- **Table structure**: Consistent formatting and proper cell boundaries
- **Different table sizes**: Both long and short tables for comparison
- **Table parsing challenges**: How Johnny5 handles tables that span page boundaries

## How to Regenerate

To regenerate the PDF from the source QMD file:

```bash
jny5 qmd 02-split_table.qmd
jny5 pdf 02-split_table.qmd
```

This will create `02-split_table.pdf` using Quarto to render the QMD source.

## File Contents

- `02-split_table.qmd` - Source Quarto Markdown file with long and short tables
- `02-split_table.pdf` - Generated PDF for testing
- `README.md` - This file
