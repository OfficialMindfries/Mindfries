/**
 * Checks resume-fields.ts, in Node:
 *
 *   node src/lib/profile/resume-fields.check.ts
 */
import { parseResumeText, skillsFromText } from "./resume-fields.ts";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const RESUME = `Asha Verma
Senior Backend Engineer
Pune, India
asha@example.com | github.com/asha-verma | linkedin.com/in/asha-verma-01

Summary
Backend engineer with eight years building payment systems in Go and Python,
most recently leading a team of five on a ledger service.

Experience
Ledgerly — Staff Engineer (2021 – Present)
Built Go services on Kubernetes and PostgreSQL; moved the batch jobs to Kafka.
Payfast — Backend Engineer (2016 – 2021)
Python, Django, PostgreSQL, Redis, AWS. Wrote the reconciliation pipeline in Python.

Skills
Go, Python, PostgreSQL, Kafka, Docker, Kubernetes, AWS, Git
`;

const got = parseResumeText(RESUME, 2026);
check("the name is the first line", got.name === "Asha Verma", String(got.name));
check("the headline is the line after it", got.role === "Senior Backend Engineer", String(got.role));
check("the location is found by its shape", got.location === "Pune, India", String(got.location));
check("the summary stops at the next section", !!got.bio?.startsWith("Backend engineer") && !got.bio.includes("Ledgerly"), String(got.bio));
check("skills named in the text are found", ["Go", "Python", "PostgreSQL", "Kafka", "Kubernetes", "Docker", "AWS", "Django", "Redis", "Git"].every((s) => got.skills.includes(s)), got.skills.join(", "));
check("the most-mentioned skill comes first", got.skills[0] === "Python" || got.skills[0] === "PostgreSQL", got.skills.slice(0, 3).join(", "));
check("nothing is listed that the resume doesn't say", !got.skills.includes("Java") && !got.skills.includes("React") && !got.skills.includes("Rust"), got.skills.join(", "));
check("profile links are read", got.links.github === "asha-verma" && got.links.linkedin === "asha-verma-01", JSON.stringify(got.links));
check("the span of years is read", got.years?.from === 2016 && got.years?.to === 2021, JSON.stringify(got.years));

check("'Java' is not found inside 'JavaScript'", !skillsFromText("JavaScript and TypeScript").includes("Java"));
check("'Git' is not found inside 'GitHub'", !skillsFromText("Code on GitHub and GitLab").includes("Git"));
check("the word 'go' in a sentence is not the language", !skillsFromText("I go to work and Go home").includes("Go"));
check("'Go, Python' is the language", skillsFromText("Go, Python").includes("Go"));

const empty = parseResumeText("");
check("an empty resume yields nothing rather than a guess", !empty.name && empty.skills.length === 0 && !empty.years);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
