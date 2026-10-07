package llm

import (
	"regexp"
	"strings"
)

// DetectSteering finds text written to instruct or influence an AI
// evaluator — "ignore previous instructions", "rate this candidate
// strong_hire", a note addressed to "the AI" — and returns a short quote of
// each occurrence.
//
// The agents are asked to report this themselves (see injectionRule), but
// whether they do depends on the model: in a live run a small model noticed
// an override attempt, described it in passing, and never flagged it. A
// hiring team shouldn't learn about an attempt to game the evaluation only
// when the model happens to mention it, so this check runs on the
// candidate's material directly and doesn't involve a model at all.
//
// It is a tripwire, not a classifier: these are phrasings with no honest
// reason to appear in a coding task's code, chat or interview answers. A
// determined candidate can word around it — the fencing and the agents'
// instructions are what stop the attempt from working; this only makes sure
// the obvious ones are always seen.
func DetectSteering(text string) []string {
	var found []string
	seen := map[string]bool{}
	for _, re := range steeringPatterns {
		for _, loc := range re.FindAllStringIndex(text, 3) {
			quote := quoteAround(text, loc[0], loc[1])
			if !seen[quote] {
				seen[quote] = true
				found = append(found, quote)
			}
		}
	}
	return found
}

var steeringPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|your|all|the)\b[^.\n]{0,20}\b(instructions?|prompts?|rules?|guidelines?)`),
	regexp.MustCompile(`(?i)\bsystem\s+override\b`),
	regexp.MustCompile(`(?i)\byou\s+are\s+now\s+(in\s+)?(an?\s+)?(admin|developer|debug|unrestricted|jailbr\w+)`),
	regexp.MustCompile(`(?i)\b(note|message|instructions?)\s+(to|for)\s+(the\s+)?(ai|llm|model|evaluator|grader|reviewer\s+ai)\b`),
	regexp.MustCompile(`(?i)\b(dear|hey|attention)[,:]?\s+(ai|llm|evaluator|grader)\b`),
	regexp.MustCompile(`(?i)\b(rate|score|grade|mark|recommend|evaluate)\b[^.\n]{0,40}\b(strong[_ ]hire|as\s+(a\s+)?hire|100\s*(/|out of)\s*100|full\s+marks|highest|maximum|perfect)`),
	regexp.MustCompile(`(?i)\b(output|return|respond with|reply with)\b[^.\n]{0,30}\b(recommendation|strong[_ ]hire|score)`),
	regexp.MustCompile(`(?i)\bstrong_hire\b`),
}

// quoteAround returns the matched text with a little context either side,
// on one line, short enough to read in a report.
func quoteAround(text string, start, end int) string {
	const context, max = 40, 180
	from := start - context
	if from < 0 {
		from = 0
	}
	to := end + context
	if to > len(text) {
		to = len(text)
	}
	// Don't cut a multi-byte character in half at either edge.
	for from > 0 && !isRuneStart(text[from]) {
		from--
	}
	for to < len(text) && !isRuneStart(text[to]) {
		to++
	}
	quote := strings.Join(strings.Fields(text[from:to]), " ")
	if len(quote) > max {
		quote = quote[:max]
		for len(quote) > 0 && !isRuneStart(quote[len(quote)-1]) {
			quote = quote[:len(quote)-1]
		}
		quote = strings.TrimSpace(quote[:len(quote)-1]) + "…"
	}
	return quote
}

func isRuneStart(b byte) bool { return b&0xC0 != 0x80 }
