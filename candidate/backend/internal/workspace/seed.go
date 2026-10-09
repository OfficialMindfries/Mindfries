package workspace

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
)

// The shell setup written into a new sandbox. It does two things.
//
// It gives the prompt the project's path instead of the sandbox's id, which
// is what the default prompt shows and means nothing to a candidate.
//
// And it reports each command to the workspace: before a command runs, and
// again when it finishes with its exit status, the shell prints a private
// escape sequence (OSC 7770) into the terminal's own output. The backend's
// terminal relay takes those out of the stream before it reaches the
// browser (markers.go) and records them — that is how "what the candidate
// ran, and whether it worked" becomes evidence without guessing at it from
// keystrokes. The command text is base64, so nothing in it can end the
// sequence early.
//
// This runs as the candidate, in the candidate's shell, so a candidate who
// goes looking can remove it or print sequences of their own; what it
// records is their own trail. It is evidence of how they worked, not a
// tamper-proof audit log, and the report doesn't present it as one.
const zshrc = `
# ── Mindfries workspace ──────────────────────────────────────────────────────
PROMPT='%F{cyan}%~%f %# '
mf_preexec() { printf '\033]7770;C;%s\007' "$(printf '%s' "$1" | base64 | tr -d '\n')"; }
mf_precmd() { local code=$?; printf '\033]7770;E;%s\007' "$code"; }
autoload -Uz add-zsh-hook
add-zsh-hook preexec mf_preexec
add-zsh-hook precmd mf_precmd
`

// The same for bash, for an image whose shell is bash. bash has no preexec;
// the DEBUG trap is the usual stand-in, guarded so it reports the command
// line once rather than every simple command inside it.
const bashrc = `
# ── Mindfries workspace ──────────────────────────────────────────────────────
PS1='\[\033[36m\]\w\[\033[0m\] \$ '
mf_precmd() { local code=$?; printf '\033]7770;E;%s\007' "$code"; mf_ready=1; }
mf_preexec() {
  [ -n "$COMP_LINE" ] && return
  [ "$BASH_COMMAND" = "$PROMPT_COMMAND" ] && return
  [ -z "$mf_ready" ] && return
  mf_ready=
  printf '\033]7770;C;%s\007' "$(HISTTIMEFORMAT= history 1 | sed 's/^ *[0-9]* *//' | base64 | tr -d '\n')"
}
trap 'mf_preexec' DEBUG
PROMPT_COMMAND=mf_precmd
`

// Seed puts a task into a fresh sandbox: its files in the project
// directory, a git repository with the task as its first commit (so `git
// diff` shows the candidate exactly what they have changed), and the shell
// setup above. `author` is the candidate's name and email for their own
// commits.
func (w Workspace) Seed(ctx context.Context, files map[string]string, authorName, authorEmail string) error {
	if err := w.Client.MakeDir(ctx, w.SandboxID, Dir); err != nil {
		return fmt.Errorf("workspace: creating the project directory: %w", err)
	}

	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	sort.Strings(paths)

	var wg sync.WaitGroup
	var mu sync.Mutex
	var firstErr error
	limit := make(chan struct{}, 8)
	for _, p := range paths {
		rel, err := Rel(p)
		if err != nil {
			return fmt.Errorf("workspace: the task has a file outside the project (%q)", p)
		}
		wg.Add(1)
		go func(p, rel string) {
			defer wg.Done()
			limit <- struct{}{}
			defer func() { <-limit }()
			if err := w.Client.WriteFile(ctx, w.SandboxID, rel, []byte(files[p])); err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("workspace: writing %s: %w", p, err)
				}
				mu.Unlock()
			}
		}(p, rel)
	}
	wg.Wait()
	if firstErr != nil {
		return firstErr
	}

	// Appended, not written over: an image may ship an rc file of its own.
	for name, content := range map[string]string{".zshrc": zshrc, ".bashrc": bashrc} {
		existing, _ := w.Client.ReadFile(ctx, w.SandboxID, name)
		if strings.Contains(string(existing), "Mindfries workspace") {
			continue
		}
		if err := w.Client.WriteFile(ctx, w.SandboxID, name, append(existing, []byte(content)...)); err != nil {
			return fmt.Errorf("workspace: writing %s: %w", name, err)
		}
	}

	name, email := strings.TrimSpace(authorName), strings.TrimSpace(authorEmail)
	if name == "" {
		name = "Candidate"
	}
	if email == "" {
		email = "candidate@mindfries.invalid"
	}
	// The first commit is the task as handed over, authored as Mindfries so
	// it reads as the starting point and not as the candidate's work.
	git := strings.Join([]string{
		"git init -q -b main",
		"git config user.name " + shellQuote(name),
		"git config user.email " + shellQuote(email),
		"git add -A",
		"git -c user.name=Mindfries -c user.email=tasks@mindfries.invalid commit -q --allow-empty -m 'Task as given'",
	}, " && ")
	res, err := w.run(ctx, git, 60)
	if err != nil {
		return fmt.Errorf("workspace: setting up git: %w", err)
	}
	if res.ExitCode != 0 {
		return fmt.Errorf("workspace: setting up git failed: %s", strings.TrimSpace(res.Output))
	}

	// Caches and installed dependencies are kept out of `git status` without
	// touching the task's own .gitignore: .git/info/exclude is local to this
	// repository and isn't a file in the project. Not fatal if it fails —
	// the candidate just sees a noisier status.
	var exclude strings.Builder
	exclude.WriteString("# Mindfries: caches and installed dependencies\n")
	for _, d := range ignoredDirs {
		if d != ".git" {
			exclude.WriteString(d + "/\n")
		}
	}
	_ = w.Client.WriteFile(ctx, w.SandboxID, Dir+"/.git/info/exclude", []byte(exclude.String()))
	return nil
}
