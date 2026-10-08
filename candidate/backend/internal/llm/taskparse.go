package llm

import (
	"regexp"
	"strings"
)

// The markers taskGenSystemPrompt asks for, matched loosely: models vary the
// number of "=", drop the closing run after a file path (the real model does
// exactly that), and sometimes wrap a marker in bold or a stray backtick.
// None of that should cost an otherwise usable reply.
var (
	briefMarkerRe = regexp.MustCompile(`^\W*=+\s*BRIEF\s*=*\W*$`)
	fileMarkerRe  = regexp.MustCompile(`^\W*=+\s*FILE:\s*(.+?)\s*=*\W*$`)
	solutionRe    = regexp.MustCompile(`^\W*=+\s*SOLUTION:\s*(.+?)\s*=*\W*$`)
)

// parseGeneratedTask reads the marker layout into a brief and a set of
// files. Anything before the first marker is ignored, so an opening
// sentence or code fence doesn't spoil the reply. File content is kept
// verbatim apart from surrounding blank lines.
func parseGeneratedTask(raw string) GeneratedTask {
	task := GeneratedTask{StarterFiles: map[string]string{}, SolutionFiles: map[string]string{}}

	const none, brief, file, solution = 0, 1, 2, 3
	section := none
	path := ""
	var lines []string

	flush := func() {
		body := strings.Trim(strings.Join(lines, "\n"), "\n")
		switch section {
		case brief:
			task.TaskBrief = body
		case file:
			if path != "" {
				task.StarterFiles[path] = body + "\n"
			}
		case solution:
			if path != "" {
				task.SolutionFiles[path] = body + "\n"
			}
		}
		lines = nil
	}

	for _, line := range strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n") {
		if briefMarkerRe.MatchString(line) {
			flush()
			section = brief
			continue
		}
		if m := fileMarkerRe.FindStringSubmatch(line); m != nil {
			flush()
			section = file
			path = strings.TrimPrefix(strings.Trim(m[1], "`*\" "), "/")
			continue
		}
		if m := solutionRe.FindStringSubmatch(line); m != nil {
			flush()
			section = solution
			path = strings.TrimPrefix(strings.Trim(m[1], "`*\" "), "/")
			continue
		}
		lines = append(lines, line)
	}
	flush()
	return task
}
