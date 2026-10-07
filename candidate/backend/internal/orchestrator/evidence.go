package orchestrator

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
)

// Parts of a report that are worked out from the session's record rather
// than written by a model: where an observation can be traced to, whether
// the interview actually happened, and signs that work came from outside
// the workspace. They say only what the record shows, and say so.

// ── References from evidence back to the moment it came from ─────────────

// eventRef is how an entry in the trail or transcript is labelled for the
// agents, and how they cite it back: "[E1234]", the activity event's own id.
// The hiring team's view turns each one into a link to that moment.
func eventRef(id int64) string { return "E" + strconv.FormatInt(id, 10) }

var refPattern = regexp.MustCompile(`\[E(\d+)(?:\s*[,–-]\s*E?(\d+))*\]`)
var singleRef = regexp.MustCompile(`E?(\d+)`)

// keepKnownRefs rewrites every reference in text to the plain "[E12]" form,
// one per bracket, and drops any that don't name a real event of this
// session. A model that is asked to cite will occasionally cite something
// that isn't there; a link to nothing is worse than no link.
func keepKnownRefs(text string, known map[int64]bool) string {
	out := refPattern.ReplaceAllStringFunc(text, func(match string) string {
		var kept []string
		for _, m := range singleRef.FindAllStringSubmatch(match, -1) {
			if id, err := strconv.ParseInt(m[1], 10, 64); err == nil && known[id] {
				kept = append(kept, "["+eventRef(id)+"]")
			}
		}
		return strings.Join(kept, " ")
	})
	// Tidy what removing a reference leaves behind: " ." and doubled spaces.
	out = regexp.MustCompile(` +([.,;:)])`).ReplaceAllString(out, "$1")
	return regexp.MustCompile(` {2,}`).ReplaceAllString(out, " ")
}

// stripRefs removes references altogether — for text shown where there is
// nothing to link them to.
func stripRefs(text string) string {
	return keepKnownRefs(text, nil)
}

func eventIDs(events []db.ActivityEvent) map[int64]bool {
	ids := make(map[int64]bool, len(events))
	for _, e := range events {
		ids[e.ID] = true
	}
	return ids
}

// interviewTranscript writes the interview out for the Interview agent with
// each turn labelled by its event, so what it observes can cite the answer
// it's about. Timing notes are the same as formatTranscript's.
func interviewTranscript(events []db.ActivityEvent) string {
	var b strings.Builder
	for _, e := range events {
		if e.EventType != eventInterview {
			continue
		}
		var t Turn
		if json.Unmarshal(e.Payload, &t) != nil || t.Text == "" {
			continue
		}
		b.WriteString("[" + eventRef(e.ID) + "] ")
		b.WriteString(formatTranscript([]Turn{t}))
	}
	return b.String()
}

// ── Whether the interview happened ───────────────────────────────────────

// interviewStatus says, when it is true, that the interview didn't take
// place or wasn't completed, and why as far as the record shows. Empty when
// every question was asked and answered — there's nothing to flag.
//
// A report without this reads the same whether the candidate gave four
// thoughtful answers or never saw a question; the hiring team has to be
// told which it was.
func interviewStatus(events []db.ActivityEvent, cfg db.InterviewConfig) string {
	turns := turnsOf(events, eventInterview)
	asked, answered, unanswered, late := 0, 0, 0, 0
	for _, t := range turns {
		switch {
		case t.Role == roleInterviewer:
			asked++
		case t.Text == noAnswerText:
			unanswered++
		default:
			answered++
			if t.TimedOut {
				late++
			}
		}
	}
	autoSubmitted := false
	for _, e := range events {
		if e.EventType == eventAutoSubmitted {
			autoSubmitted = true
		}
	}

	var parts []string
	switch {
	case asked == 0 && autoSubmitted:
		parts = append(parts, "No interview took place. The candidate never submitted — the session was closed by the server after its time ran out — so they were not asked about their work.")
	case asked == 0:
		parts = append(parts, "No interview took place. The candidate's work was submitted without the follow-up questions being asked, which happens when the interviewer could not be reached. Nothing in this report reflects their own account of their work.")
	case asked < cfg.Questions:
		why := "the time allowed for it ran out"
		if autoSubmitted {
			why = "the candidate left and the session was closed by the server"
		}
		parts = append(parts, fmt.Sprintf("The interview was cut short: %d of %d questions were asked before %s.", asked, cfg.Questions, why))
	}
	if asked > 0 {
		if waiting := asked - answered - unanswered; waiting > 0 {
			parts = append(parts, "The last question was asked but never answered.")
		}
		if unanswered > 0 {
			parts = append(parts, fmt.Sprintf("%s went unanswered when the time for the answer ran out.", plural(unanswered, "question")))
		}
		if late > 0 {
			parts = append(parts, fmt.Sprintf("%s ran past the time limit.", plural(late, "answer")))
		}
	}
	return strings.Join(parts, " ")
}

// ── Signs that work came from outside the workspace ──────────────────────

const (
	eventPaste     = "paste"
	eventTabHidden = "tab_hidden"

	// A paste this large is unlikely to be a variable name or a line moved
	// from elsewhere in the file.
	largePasteChars = 200
	largePasteLines = 5
	// An absence worth reporting, and how soon after one a paste counts as
	// following it.
	notableAbsence  = 60 * time.Second
	afterAbsenceGap = 20 * time.Second
)

type pasteEvent struct {
	Chars int `json:"chars"`
	Lines int `json:"lines"`
	// Internal means the text had been copied from inside the workspace
	// itself a moment before — moving code around, not bringing it in.
	Internal bool   `json:"internal"`
	Target   string `json:"target"`
}

// provenanceSignals reports what the record shows about where the work came
// from: text pasted in from outside the workspace, and time spent away from
// it. These are signals for a person to weigh, not findings — a paste can
// be the candidate's own notes or a line from documentation, and looking
// something up is how engineers work. So it states counts and sizes, cites
// the moments, and draws no conclusion.
//
// Empty when the session has none of this telemetry (an older workspace
// build) or nothing in it is notable.
func provenanceSignals(events []db.ActivityEvent) string {
	type absence struct {
		end time.Time
		dur time.Duration
	}
	var absences []absence
	var away time.Duration
	var longest time.Duration
	var large []string
	externalChars, afterAbsence, seen := 0, 0, 0

	for _, e := range events {
		switch e.EventType {
		case eventTabHidden:
			seen++
			var p struct {
				Seconds float64 `json:"seconds"`
			}
			if json.Unmarshal(e.Payload, &p) != nil || p.Seconds <= 0 {
				continue
			}
			d := time.Duration(p.Seconds * float64(time.Second))
			away += d
			if d > longest {
				longest = d
			}
			if d >= notableAbsence {
				absences = append(absences, absence{end: e.OccurredAt, dur: d})
			}
		case eventPaste:
			seen++
			var p pasteEvent
			if json.Unmarshal(e.Payload, &p) != nil || p.Internal {
				continue
			}
			externalChars += p.Chars
			if p.Chars < largePasteChars && p.Lines < largePasteLines {
				continue
			}
			where := p.Target
			if where == "" {
				where = "the workspace"
			}
			note := fmt.Sprintf("%d characters over %s into %s at %s [%s]", p.Chars, plural(max(p.Lines, 1), "line"), where, e.OccurredAt.Format("15:04:05"), eventRef(e.ID))
			for _, a := range absences {
				if gap := e.OccurredAt.Sub(a.end); gap >= 0 && gap <= afterAbsenceGap {
					note += fmt.Sprintf(", %d seconds after returning from %s away", int(gap.Seconds()), a.dur.Round(time.Second))
					afterAbsence++
					break
				}
			}
			large = append(large, note)
		}
	}
	if seen == 0 || (len(large) == 0 && len(absences) == 0) {
		return ""
	}

	var b strings.Builder
	b.WriteString("Signals about where the work came from, for a reviewer to weigh. They are not findings: pasted text can be the candidate's own notes or documentation, and time away can be reading it.\n")
	if len(large) > 0 {
		fmt.Fprintf(&b, "\n%s of text copied from outside the workspace (%d characters pasted from outside in all):", plural(len(large), "large paste"), externalChars)
		for _, l := range large {
			b.WriteString("\n- " + l)
		}
		if afterAbsence > 0 {
			fmt.Fprintf(&b, "\n%d of these came within %d seconds of returning to the workspace.", afterAbsence, int(afterAbsenceGap.Seconds()))
		}
	}
	if len(absences) > 0 {
		fmt.Fprintf(&b, "\n\nThe workspace tab was left for more than a minute %s; the longest was %s, and %s in total was spent away.",
			plural(len(absences), "time"), longest.Round(time.Second), away.Round(time.Second))
	}
	return b.String()
}
