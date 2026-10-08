package verify

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/mindfries/candidate-backend/internal/sandbox"
)

const maxRunOutput = 6000

// safePath returns p as a relative path inside a project, or false when it
// would escape one. Generated paths come from a model, and a file named
// "../../etc/…" must not be written anywhere.
func safePath(p string) (string, bool) {
	clean := filepath.ToSlash(filepath.Clean(strings.TrimLeft(strings.ReplaceAll(p, "\\", "/"), "/")))
	if clean == "." || clean == "" || strings.HasPrefix(clean, "../") || clean == ".." || strings.Contains(clean, ":") {
		return "", false
	}
	return clean, true
}

// ── Local process ────────────────────────────────────────────────────────

// LocalRunner runs the tests as a child process of this server, in a
// temporary directory. It gives the code no isolation beyond that directory:
// it is for development, on a machine where running model-written code is
// acceptable. It is never chosen automatically — see FromEnv.
type LocalRunner struct{}

func (LocalRunner) Name() string { return "a local process" }

func (LocalRunner) Run(ctx context.Context, files map[string]string, command []string) (Run, error) {
	dir, err := os.MkdirTemp("", "mindfries-verify-")
	if err != nil {
		return Run{}, err
	}
	defer os.RemoveAll(dir)

	for p, content := range files {
		rel, ok := safePath(p)
		if !ok {
			return Run{}, fmt.Errorf("refusing to write a file outside the project: %q", p)
		}
		full := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			return Run{}, err
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			return Run{}, err
		}
	}

	name := command[0]
	if name == "python" {
		// Most Linux hosts only have "python3"; Windows only "python".
		if _, err := exec.LookPath("python3"); err == nil {
			name = "python3"
		}
	}
	if _, err := exec.LookPath(name); err != nil {
		return Run{}, fmt.Errorf("%s is not installed on this server", command[0])
	}

	ctx, cancel := context.WithTimeout(ctx, runTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, command[1:]...)
	cmd.Dir = dir
	// A minimal environment: the tests get a PATH and nothing of this
	// server's own — no database URL, no API keys.
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + dir, "TMPDIR=" + dir, "SystemRoot=" + os.Getenv("SystemRoot"), "PYTHONDONTWRITEBYTECODE=1"}
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out

	err = cmd.Run()
	run := Run{Output: tail(out.String(), maxRunOutput)}
	var exit *exec.ExitError
	switch {
	case ctx.Err() != nil:
		return Run{}, errors.New("the tests did not finish in time")
	case errors.As(err, &exit):
		run.ExitCode = exit.ExitCode()
	case err != nil:
		return Run{}, err
	}
	return run, nil
}

// ── Daytona sandbox ──────────────────────────────────────────────────────

// SandboxRunner runs the tests in a Daytona sandbox created for the purpose
// and deleted afterwards.
type SandboxRunner struct{ Client *sandbox.Client }

func (SandboxRunner) Name() string { return "a sandbox" }

func (r SandboxRunner) Run(ctx context.Context, files map[string]string, command []string) (Run, error) {
	sb, err := r.Client.CreateSandbox(ctx, sandbox.CreateOptions{})
	if err != nil {
		return Run{}, err
	}
	defer func() {
		// Its own context: the sandbox has to go even if the run was cancelled.
		_ = r.Client.DeleteSandbox(context.WithoutCancel(ctx), sb.ID)
	}()

	const root = "/tmp/task"
	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	for _, p := range paths {
		rel, ok := safePath(p)
		if !ok {
			return Run{}, fmt.Errorf("refusing to write a file outside the project: %q", p)
		}
		// Content travels base64-encoded, so nothing in a file can be read
		// as shell. The path is single-quoted, and safePath has ruled out
		// the characters that would end the quote early... except a quote.
		if strings.ContainsAny(rel, "'\n") {
			return Run{}, fmt.Errorf("unsupported file name: %q", p)
		}
		write := fmt.Sprintf("mkdir -p '%s/%s' && echo '%s' | base64 -d > '%s/%s'",
			root, filepath.ToSlash(filepath.Dir(rel)), base64.StdEncoding.EncodeToString([]byte(files[p])), root, rel)
		if res, err := r.Client.ExecuteCommand(ctx, sb.ID, write); err != nil {
			return Run{}, err
		} else if res.ExitCode != 0 {
			return Run{}, fmt.Errorf("could not write %s in the sandbox: %s", rel, tail(res.Output, 300))
		}
	}

	name := command[0]
	if name == "python" {
		name = "python3"
	}
	res, err := r.Client.ExecuteCommand(ctx, sb.ID, fmt.Sprintf("cd '%s' && %s %s 2>&1", root, name, strings.Join(command[1:], " ")))
	if err != nil {
		return Run{}, err
	}
	return Run{ExitCode: res.ExitCode, Output: tail(res.Output, maxRunOutput)}, nil
}

// FromEnv picks the runner. TASK_VERIFY decides:
//
//	"sandbox" (or unset, when Daytona is configured) — a Daytona sandbox
//	"local"                                           — a local process
//	"off"                                             — none
//
// The local runner has to be asked for by name: it runs model-written code
// on this machine, which is a decision, not a default.
func FromEnv(sb *sandbox.Client) Runner {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("TASK_VERIFY"))) {
	case "local":
		return LocalRunner{}
	case "off":
		return nil
	}
	if sb != nil && sb.Configured() {
		return SandboxRunner{Client: sb}
	}
	return nil
}
