package llm

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// The three candidate-facing agents — the workspace assistant, the follow-up
// interviewer, and task generation — live here, apart from agents.go's four
// analysis agents, because they talk *to* someone rather than *about* a
// finished session. All three go through OpenRouter like everything else;
// the interviewer was once specced against Gemini's Live API directly, and
// was moved here (a Gemini model, through OpenRouter) on 2026-10-07.

const assistantSystemPrompt = `You are Mindfries AI, the assistant inside a candidate's coding assessment workspace.
You help the candidate think: explain unfamiliar code, unpack an error message, discuss trade-offs between approaches, point at where to look.
You do NOT do the assessment for them. Never write the solution, never return code they can paste as their answer, and never tell them the exact fix. A short illustrative snippet of a general concept (not their task) is fine.
If they ask you to solve it, say plainly that this is their work to do, then offer the next useful thing: a question to ask themselves, a place to look, a concept to check.
Be concise and concrete. Plain text, no markdown headers. The conversation is recorded as evidence of how they work, so treat a sharp question as a good sign.`

// Assist answers one candidate message in the workspace assistant. brief is
// the real task description; filePath/fileContent are whatever the candidate
// has open (both may be empty); history is the conversation so far, oldest
// first, as "user"/"assistant" turns.
func (a *Agents) Assist(ctx context.Context, brief, filePath, fileContent string, history []ChatMessage, message string) (string, error) {
	if strings.TrimSpace(message) == "" {
		return "", errors.New("llm: empty message")
	}
	var context strings.Builder
	if strings.TrimSpace(brief) != "" {
		context.WriteString("The task the candidate was given:\n" + brief + "\n\n")
	}
	if filePath != "" {
		context.WriteString("The file they currently have open (" + filePath + "):\n" + fileContent + "\n")
	}

	messages := []ChatMessage{{Role: "system", Content: assistantSystemPrompt}}
	if context.Len() > 0 {
		messages = append(messages, ChatMessage{Role: "system", Content: context.String()})
	}
	messages = append(messages, history...)
	messages = append(messages, ChatMessage{Role: "user", Content: message})
	return a.quickProse(ctx, a.models.Assistant, messages, assistantTokens)
}

const interviewSystemPrompt = `You are the AI Interviewer in Mindfries' evidence-based hiring platform.
A candidate has just finished working on a coding task. You ask a short follow-up interview to verify they understand their own work and to hear the reasoning behind it.
Rules:
- Ask exactly ONE question per turn, in one or two sentences, phrased the way a person would say it aloud.
- Ground every question in what this candidate actually did — a specific file, change, command, or decision from their session. Never ask a generic textbook question.
- Do not say whether an answer was right or wrong, do not teach, do not hint at a better solution.
- Build on their previous answers; don't repeat a topic already covered.
- If they changed nothing, ask how they approached the problem and what stopped them.
Reply with the question text only — no numbering, no preamble, no quotes.`

// InterviewContext is everything the interviewer is told about the session
// it is asking about, and how it should ask.
type InterviewContext struct {
	Brief string
	// Guidance is the template author's own note on what to probe. May be empty.
	Guidance string
	// Work is the candidate's actual changes; Trail their activity log.
	Work  string
	Trail string
	// Tone is "neutral", "friendly" or "rigorous" — the hiring company's
	// choice of register. Anything else is treated as neutral.
	Tone string
	// Language is the name of the language to ask in, e.g. "Hindi". Empty
	// means English.
	Language string
}

// interviewTones is how each register a company can choose is put to the
// model. All three keep the same rules; only the manner changes.
var interviewTones = map[string]string{
	"friendly": "Warm and encouraging. Put the candidate at ease; phrase questions as genuine curiosity about their thinking.",
	"rigorous": "Direct and exacting, like a senior engineer in a design review. Press on specifics and edge cases; do not soften the question.",
}

// InterviewTurn produces the next interviewer question. transcript is the
// interview so far ("assistant" = interviewer, "user" = candidate). n is the
// 1-based number of the question being asked, out of total.
func (a *Agents) InterviewTurn(ctx context.Context, ic InterviewContext, transcript []ChatMessage, n, total int) (string, error) {
	brief, guidance, work, trail := ic.Brief, ic.Guidance, ic.Work, ic.Trail
	var b strings.Builder
	if strings.TrimSpace(brief) != "" {
		b.WriteString("TASK BRIEF\n" + brief + "\n\n")
	}
	if strings.TrimSpace(guidance) != "" {
		b.WriteString("WHAT THE TASK'S AUTHOR WANTS PROBED\n" + guidance + "\n\n")
	}
	if manner, ok := interviewTones[ic.Tone]; ok {
		b.WriteString("MANNER\n" + manner + "\n\n")
	}
	if ic.Language != "" && ic.Language != "English" {
		b.WriteString("LANGUAGE\nAsk the question in " + ic.Language + ". Keep code identifiers, file names and commands exactly as they are written.\n\n")
	}
	b.WriteString("WHAT THE CANDIDATE CHANGED\n" + orNone(work) + "\n\n")
	b.WriteString("ACTIVITY TRAIL\n" + orNone(trail) + "\n\n")
	b.WriteString("INTERVIEW SO FAR\n")
	if len(transcript) == 0 {
		b.WriteString("(nothing yet)\n")
	}
	for _, t := range transcript {
		who := "Candidate"
		if t.Role == "assistant" {
			who = "Interviewer"
		}
		b.WriteString(who + ": " + t.Content + "\n")
	}
	fmt.Fprintf(&b, "\nAsk question %d of %d now.", n, total)

	out, err := a.quickProse(ctx, a.models.Interviewer, []ChatMessage{
		{Role: "system", Content: interviewSystemPrompt},
		{Role: "user", Content: b.String()},
	}, interviewTokens)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

const interviewAnalysisSystemPrompt = `You are the Interview agent in Mindfries' evidence-based hiring platform.
Given the transcript of a short follow-up interview held right after a coding assessment, alongside what the candidate actually changed, describe what the conversation shows: whether they could explain their own work, how accurately their account matches what they did, and how they reasoned about trade-offs.
Write specific, evidence-grounded observations, quoting short phrases where useful. Not a verdict. One observation per paragraph, plain prose, no headers.`

// AnalyzeInterview turns an interview transcript into evidence observations.
func (a *Agents) AnalyzeInterview(ctx context.Context, work, transcript string) (string, error) {
	if strings.TrimSpace(transcript) == "" {
		return "", errors.New("llm: no interview took place for this session")
	}
	return a.prose(ctx, a.models.Report, []ChatMessage{
		{Role: "system", Content: interviewAnalysisSystemPrompt},
		{Role: "user", Content: "WHAT THE CANDIDATE CHANGED\n" + orNone(work) + "\n\nINTERVIEW TRANSCRIPT\n" + transcript},
	}, analysisTokens)
}

func orNone(s string) string {
	if strings.TrimSpace(s) == "" {
		return "(none recorded)"
	}
	return s
}

// TaskSpec is what an author gives the Task Generation agent.
type TaskSpec struct {
	Name        string
	TaskVariant string // debugging | feature | refactoring | ...
	TechStack   []string
	DurationMin int
	// Notes is free text: the company, the role, what the team actually
	// works on, anything the task should reflect.
	Notes string
}

// GeneratedTask is a task brief plus the starting codebase it refers to.
type GeneratedTask struct {
	TaskBrief    string            `json:"taskBrief"`
	StarterFiles map[string]string `json:"starterFiles"`
}

const taskGenSystemPrompt = `You are the Task Generation agent in Mindfries' evidence-based hiring platform.
You author a realistic take-home engineering task: a small but genuine codebase with a real problem in it, and the brief a candidate reads.
The workspace runs in a browser: Python (Pyodide) and JavaScript/TypeScript run for real; there is no database, no network server, and no native binaries. Design a task that works inside that.
Requirements:
- The starter codebase must be complete and consistent: every file the brief mentions exists, imports resolve, and it runs.
- 4 to 7 files, each under 80 lines — small enough to read in ten minutes. Include at least one test file and a short README.
- Tests must run with the language's standard tooling and no third-party packages (Python: unittest, run with "python -m unittest"; JavaScript: node:test and node:assert, run with "node --test").
- With the code as given, the tests for existing, correct behaviour pass. For a debugging or bug-fix task, at least one test fails because of the planted bug, and passes once it is fixed.
- The task must fit the stated duration and match the stated task type and tech stack.
- For a debugging or bug-fix task, plant a real, non-obvious bug. Do NOT reveal its location or cause anywhere: not in the brief, and not in the code — no comment, name, docstring or TODO may mark or hint at it. The buggy code must read like code someone believed was correct.
- Test names and comments may describe the expected behaviour, never the defect.
- The brief is Markdown with these sections: Context, Objective, Constraints, Getting Started, Evaluation. Never include the solution.
Reply in exactly this layout and nothing else — no JSON, no code fences, no commentary. Each marker sits alone on its own line:
=====BRIEF=====
<the brief, as markdown>
=====FILE: relative/path/to/file=====
<that file's exact content>
=====FILE: another/file=====
<that file's exact content>`

// GenerateTask authors a task brief and starter codebase from a spec. A
// reply that can't be read as a brief plus files is an error, not a partial
// success — a half-parsed codebase would be worse than none.
//
// The reply is a marker-delimited layout rather than JSON on purpose: a
// codebase inside a JSON string means every quote, backslash and newline in
// every file has to be escaped perfectly, and models don't manage it
// reliably. Markers on their own lines need no escaping at all.
func (a *Agents) GenerateTask(ctx context.Context, spec TaskSpec) (GeneratedTask, error) {
	if strings.TrimSpace(spec.Name) == "" {
		return GeneratedTask{}, errors.New("llm: a task needs a name to be generated from")
	}
	duration := spec.DurationMin
	if duration <= 0 {
		duration = 60
	}
	var b strings.Builder
	b.WriteString("Assessment name: " + spec.Name + "\n")
	b.WriteString("Task type: " + orNone(spec.TaskVariant) + "\n")
	b.WriteString("Tech stack: " + orNone(strings.Join(spec.TechStack, ", ")) + "\n")
	fmt.Fprintf(&b, "Duration: %d minutes\n", duration)
	if strings.TrimSpace(spec.Notes) != "" {
		b.WriteString("About the company, the role and what the task should reflect:\n" + spec.Notes + "\n")
	}

	raw, err := a.client.CompleteQuick(ctx, a.models.TaskGeneration, []ChatMessage{
		{Role: "system", Content: taskGenSystemPrompt},
		{Role: "user", Content: b.String()},
	}, taskGenTokens)
	if errors.Is(err, ErrTruncated) {
		return GeneratedTask{}, errors.New("llm: the generated task was too long and got cut off — ask for a smaller task")
	}
	if err != nil {
		return GeneratedTask{}, err
	}

	task := parseGeneratedTask(raw)
	if strings.TrimSpace(task.TaskBrief) == "" || len(task.StarterFiles) == 0 {
		return GeneratedTask{}, errors.New("llm: the model's reply didn't contain a brief and starter files in the requested layout")
	}
	return task, nil
}
