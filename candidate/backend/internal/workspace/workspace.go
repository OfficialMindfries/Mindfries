// Package workspace is a candidate's project inside their sandbox: putting
// the task there, reading and writing its files, running a command in it,
// and taking a copy of it for the report.
//
// The workspace lives in one directory of the sandbox (Dir, under the
// sandbox user's home). Callers name files the way the IDE does — a path
// from the project root with a leading slash, "/pricing/discount.py" — and
// nothing here lets such a path reach outside that directory: the sandbox
// is the candidate's to do anything in from the terminal, but this API is
// driven by a browser, and it only ever touches the project.
package workspace

import (
	"context"
	"errors"
	"fmt"
	"path"
	"sort"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/mindfries/candidate-backend/internal/sandbox"
)

const (
	// Dir is the project directory, relative to the sandbox user's home.
	Dir = "workspace"
	// MaxFiles is the most files listed or copied. A real task is tens of
	// files; this is a ceiling for a project that has grown a generated tree
	// the ignore list below doesn't know about.
	MaxFiles = 1500
	// MaxFileBytes is the largest file read into the IDE or a snapshot.
	MaxFileBytes = 512 * 1024
	// MaxSnapshotBytes bounds a whole snapshot.
	MaxSnapshotBytes = 4 << 20
)

// Directories that are never the candidate's own work: version control
// internals, installed dependencies, caches and build output. They are left
// out of the file list and of snapshots — a `npm install` should not put
// forty thousand files in the explorer or the report.
var ignoredDirs = []string{".git", "node_modules", ".venv", "venv", "env", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".next", ".turbo", "target", "dist", "build", ".gradle", ".idea", ".cache"}

// ErrBadPath is a path that isn't inside the project.
var ErrBadPath = errors.New("workspace: path is outside the project")

// Client is what this package needs of the sandbox; *sandbox.Client is it.
type Client interface {
	Execute(ctx context.Context, sandboxID, command, cwd string, timeoutSec int) (sandbox.ExecuteResult, error)
	WriteFile(ctx context.Context, sandboxID, path string, content []byte) error
	ReadFile(ctx context.Context, sandboxID, path string) ([]byte, error)
	DeletePath(ctx context.Context, sandboxID, path string) error
	MovePath(ctx context.Context, sandboxID, from, to string) error
	MakeDir(ctx context.Context, sandboxID, path string) error
}

// Workspace is one sandbox's project.
type Workspace struct {
	Client    Client
	SandboxID string
}

// Rel turns an IDE path ("/src/app.py") into the sandbox path of that file
// ("workspace/src/app.py"). It refuses anything that would leave the
// project, and the project root itself.
func Rel(idePath string) (string, error) {
	if strings.ContainsRune(idePath, 0) {
		return "", ErrBadPath
	}
	// Cleaned as a relative path, so a ".." that climbs above the root is
	// still there to be seen afterwards. (Cleaned as a rooted path it would
	// be quietly dropped, and "/../etc/passwd" would become a file in the
	// project — harmless, but not what was asked for, so it is refused.)
	clean := path.Clean(strings.TrimLeft(strings.ReplaceAll(idePath, "\\", "/"), "/"))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", ErrBadPath
	}
	return Dir + "/" + clean, nil
}

// Entry is one file in the project.
type Entry struct {
	// Path is the IDE's form: from the project root, with a leading slash.
	Path string `json:"path"`
	Size int64  `json:"size"`
	// ModTime is seconds since the epoch, with fractions — enough to tell
	// that a file changed, which is all it is used for.
	ModTime float64 `json:"modTime"`
}

// shellQuote wraps s for a POSIX shell.
func shellQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'" }

func (w Workspace) run(ctx context.Context, command string, timeoutSec int) (sandbox.ExecuteResult, error) {
	// Run through bash explicitly: the sandbox's login shell varies by image,
	// and these commands are written for a POSIX shell.
	return w.Client.Execute(ctx, w.SandboxID, "bash -lc "+shellQuote("cd ~/"+Dir+" && "+command), "", timeoutSec)
}

// Manifest lists the project's files, without their contents. Truncated is
// true when there were more than MaxFiles.
func (w Workspace) Manifest(ctx context.Context) (entries []Entry, truncated bool, err error) {
	var prune []string
	for _, d := range ignoredDirs {
		prune = append(prune, "-name "+shellQuote(d))
	}
	// One line per file: size, mtime, path. Paths with a newline in them are
	// dropped (-name '*\n*' can't be expressed portably; the parser skips a
	// malformed line instead).
	find := fmt.Sprintf(`find . \( -type d \( %s \) -prune \) -o -type f -printf '%%s\t%%T@\t%%P\n' | head -n %d`, strings.Join(prune, " -o "), MaxFiles+1)
	res, err := w.run(ctx, find, 30)
	if err != nil {
		return nil, false, err
	}
	for _, line := range strings.Split(res.Output, "\n") {
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) != 3 || parts[2] == "" {
			continue
		}
		size, err1 := strconv.ParseInt(parts[0], 10, 64)
		mod, err2 := strconv.ParseFloat(parts[1], 64)
		if err1 != nil || err2 != nil {
			continue
		}
		entries = append(entries, Entry{Path: "/" + parts[2], Size: size, ModTime: mod})
	}
	if len(entries) > MaxFiles {
		entries, truncated = entries[:MaxFiles], true
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	return entries, truncated, nil
}

// File is a file's content as the IDE can hold it.
type File struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	// Skipped says why Content is empty when it is: "binary", "too_large",
	// or "missing". The file exists (unless missing) and is the
	// candidate's; the editor just can't show it.
	Skipped string `json:"skipped,omitempty"`
}

// Read returns the content of each path. A file that is binary, too large
// or gone comes back marked rather than failing the rest.
func (w Workspace) Read(ctx context.Context, paths []string) ([]File, error) {
	out := make([]File, len(paths))
	var wg sync.WaitGroup
	var firstErr error
	var mu sync.Mutex
	limit := make(chan struct{}, 8)
	for i, p := range paths {
		rel, err := Rel(p)
		if err != nil {
			return nil, err
		}
		wg.Add(1)
		go func(i int, p, rel string) {
			defer wg.Done()
			limit <- struct{}{}
			defer func() { <-limit }()
			data, err := w.Client.ReadFile(ctx, w.SandboxID, rel)
			f := File{Path: p}
			switch {
			case errors.Is(err, sandbox.ErrNotFound):
				f.Skipped = "missing"
			case err != nil:
				mu.Lock()
				if firstErr == nil {
					firstErr = err
				}
				mu.Unlock()
				return
			case len(data) > MaxFileBytes:
				f.Skipped = "too_large"
			case !utf8.Valid(data) || strings.ContainsRune(string(data), 0):
				f.Skipped = "binary"
			default:
				f.Content = string(data)
			}
			out[i] = f
		}(i, p, rel)
	}
	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}
	return out, nil
}

// Write saves a file's content, creating directories as needed.
func (w Workspace) Write(ctx context.Context, idePath, content string) error {
	rel, err := Rel(idePath)
	if err != nil {
		return err
	}
	if len(content) > MaxFileBytes {
		return fmt.Errorf("workspace: %s is larger than %d bytes", idePath, MaxFileBytes)
	}
	return w.Client.WriteFile(ctx, w.SandboxID, rel, []byte(content))
}

// Delete removes a file or a directory.
func (w Workspace) Delete(ctx context.Context, idePath string) error {
	rel, err := Rel(idePath)
	if err != nil {
		return err
	}
	return w.Client.DeletePath(ctx, w.SandboxID, rel)
}

// Move renames a file or directory within the project.
func (w Workspace) Move(ctx context.Context, from, to string) error {
	relFrom, err := Rel(from)
	if err != nil {
		return err
	}
	relTo, err := Rel(to)
	if err != nil {
		return err
	}
	if dir := path.Dir(relTo); dir != Dir {
		if err := w.Client.MakeDir(ctx, w.SandboxID, dir); err != nil {
			return err
		}
	}
	return w.Client.MovePath(ctx, w.SandboxID, relFrom, relTo)
}

// MakeDir creates a directory.
func (w Workspace) MakeDir(ctx context.Context, idePath string) error {
	rel, err := Rel(idePath)
	if err != nil {
		return err
	}
	return w.Client.MakeDir(ctx, w.SandboxID, rel)
}

// Run runs a command in the project directory and waits for it.
func (w Workspace) Run(ctx context.Context, command string, timeoutSec int) (sandbox.ExecuteResult, error) {
	return w.run(ctx, command, timeoutSec)
}

// Snapshot is a copy of the project's text files, as path → content: what
// the report and the interviewer read. Binary and oversized files are left
// out, and the whole is bounded; `complete` is false when something was.
func (w Workspace) Snapshot(ctx context.Context) (files map[string]string, complete bool, err error) {
	entries, truncated, err := w.Manifest(ctx)
	if err != nil {
		return nil, false, err
	}
	complete = !truncated
	var paths []string
	for _, e := range entries {
		if e.Size > MaxFileBytes {
			complete = false
			continue
		}
		paths = append(paths, e.Path)
	}
	read, err := w.Read(ctx, paths)
	if err != nil {
		return nil, false, err
	}
	files = make(map[string]string, len(read))
	total := 0
	for _, f := range read {
		if f.Skipped != "" {
			if f.Skipped != "missing" {
				complete = false
			}
			continue
		}
		if total+len(f.Content) > MaxSnapshotBytes {
			complete = false
			continue
		}
		total += len(f.Content)
		files[f.Path] = f.Content
	}
	return files, complete, nil
}
