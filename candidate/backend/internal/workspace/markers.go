package workspace

import (
	"bytes"
	"encoding/base64"
	"strconv"
	"strings"
)

// The terminal's output carries the shell's reports of what ran (seed.go):
//
//	ESC ] 7770 ; C ; <base64 of the command line> BEL     a command is starting
//	ESC ] 7770 ; E ; <exit status> BEL                    the last one finished
//
// MarkerFilter takes them out of the stream and returns them as events, so
// the browser gets clean terminal output and the backend gets a record.
// Output arrives in arbitrary chunks, so a sequence can be split across two
// of them; the filter holds back an unfinished one until the rest arrives.

var markerStart = []byte("\x1b]7770;")

const (
	markerEnd = 0x07
	// A sequence longer than this isn't one of ours (a command line is
	// capped by the shell's own limits well below it) — it is passed through
	// rather than held back forever.
	maxMarker = 64 * 1024
)

// Marker is one report from the shell.
type Marker struct {
	// Command is the command line that is starting. Empty for a finish.
	Command string
	// Exit is the finished command's status; nil for a start.
	Exit *int
}

// MarkerFilter is not safe for concurrent use; one terminal has one.
type MarkerFilter struct {
	held []byte
}

// Feed takes the next chunk of terminal output and returns what should be
// shown, and any reports it contained.
func (f *MarkerFilter) Feed(chunk []byte) (out []byte, markers []Marker) {
	data := chunk
	if len(f.held) > 0 {
		data = append(f.held, chunk...)
		f.held = nil
	}
	for {
		i := bytes.Index(data, markerStart)
		if i < 0 {
			// No sequence starts here — but the chunk may end partway through
			// the introducer itself ("…ESC ]77"). Hold that tail back.
			keep := partialSuffix(data)
			out = append(out, data[:len(data)-keep]...)
			if keep > 0 {
				f.held = append([]byte(nil), data[len(data)-keep:]...)
			}
			return out, markers
		}
		out = append(out, data[:i]...)
		rest := data[i+len(markerStart):]
		end := bytes.IndexByte(rest, markerEnd)
		if end < 0 {
			if len(rest) > maxMarker {
				// Not ours. Let it through as it is.
				out = append(out, data[i:]...)
				return out, markers
			}
			f.held = append([]byte(nil), data[i:]...)
			return out, markers
		}
		if m, ok := parseMarker(string(rest[:end])); ok {
			markers = append(markers, m)
		}
		data = rest[end+1:]
	}
}

// partialSuffix is how many bytes at the end of data are the beginning of
// the introducer.
func partialSuffix(data []byte) int {
	max := len(markerStart) - 1
	if len(data) < max {
		max = len(data)
	}
	for n := max; n > 0; n-- {
		if bytes.Equal(data[len(data)-n:], markerStart[:n]) {
			return n
		}
	}
	return 0
}

func parseMarker(body string) (Marker, bool) {
	kind, value, ok := strings.Cut(body, ";")
	if !ok {
		return Marker{}, false
	}
	switch kind {
	case "C":
		raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(value))
		if err != nil {
			return Marker{}, false
		}
		command := strings.TrimSpace(string(raw))
		if command == "" {
			return Marker{}, false
		}
		return Marker{Command: command}, true
	case "E":
		code, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil {
			return Marker{}, false
		}
		return Marker{Exit: &code}, true
	}
	return Marker{}, false
}
