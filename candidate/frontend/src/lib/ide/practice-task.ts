import type { FileContents } from "./types";

/**
 * The practice run's task: a small Python project with one real bug and a
 * test that catches it — the same shape as a real assessment, so the
 * candidate gets to try the things they will actually use: reading a brief,
 * finding the fault, running the tests from the terminal or the Tests
 * panel, and seeing them go green.
 *
 * The practice workspace has no session behind it, so none of what the real
 * workspace records is recorded here (see IdeShell: telemetry, checkpoints
 * and camera stills are all conditional on a session id).
 */

export const PRACTICE_NAME = "Practice run";

export const PRACTICE_BRIEF = `# Practice run

**Nothing here is recorded, timed, scored or shared.** There is no session behind this workspace — use it to get used to how things work before a real assessment.

## The task

\`pricing/discount.py\` applies a percentage discount to an order total. A customer was promised **10% off** a 200.00 order and was charged a wildly wrong amount.

1. Run the tests and read the failure.
2. Find the bug in \`pricing/discount.py\` and fix it.
3. Run the tests again until they pass.

## Running the tests

In the terminal, type \`python -m unittest discover -s tests -v\`

Or open the **Tests** panel and press Run.

## Worth trying while you're here

- The **AI assistant** panel is switched off here: it only answers inside a real session, where what you ask it is part of the evidence.
- **git** — \`git status\`, \`git diff\`, \`git commit\` all work.
- The **Changes** panel, which shows what you've edited since you started.

In a real session your camera stays on, the workspace is fullscreen, and a timer runs. Here, leave whenever you like.
`;

export const PRACTICE_FILES: FileContents = {
  "/README.md": `# Pricing

Applies discounts to order totals.

## Tests

\`\`\`bash
python -m unittest discover -s tests -v
\`\`\`
`,
  "/pricing/__init__.py": "",
  "/pricing/discount.py": `def apply(total, percent):
    """Return \`total\` with \`percent\` percent taken off.

    apply(200, 10) should be 180: ten percent of 200 is 20.
    """
    return total - total * percent


def apply_all(total, percents):
    """Apply several discounts one after another."""
    for percent in percents:
        total = apply(total, percent)
    return total
`,
  "/tests/__init__.py": "",
  "/tests/test_discount.py": `import unittest

from pricing.discount import apply, apply_all


class DiscountTest(unittest.TestCase):
    def test_ten_percent_off(self):
        self.assertEqual(apply(200, 10), 180)

    def test_no_discount_changes_nothing(self):
        self.assertEqual(apply(200, 0), 200)

    def test_discounts_stack(self):
        # 10% off 200 is 180; 50% off that is 90.
        self.assertEqual(apply_all(200, [10, 50]), 90)


if __name__ == "__main__":
    unittest.main()
`,
};
