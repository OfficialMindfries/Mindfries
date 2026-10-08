package db

import "testing"

func TestInterviewConfigNormalizedKeepsValidSettings(t *testing.T) {
	in := InterviewConfig{Questions: 6, Tone: "rigorous", Language: "hi-IN", AnswerSeconds: 90}
	if got := in.Normalized(); got != in {
		t.Fatalf("valid settings were changed: %+v", got)
	}
}

func TestInterviewConfigNormalizedReplacesAnythingOutOfRange(t *testing.T) {
	d := DefaultInterviewConfig()
	for name, in := range map[string]InterviewConfig{
		"empty (a role nobody configured)": {},
		"zero questions":                   {Questions: 0, Tone: "neutral", Language: "en-US", AnswerSeconds: 120},
		"a hundred questions":              {Questions: 100, Tone: "neutral", Language: "en-US", AnswerSeconds: 120},
		"an unknown tone":                  {Questions: 4, Tone: "hostile", Language: "en-US", AnswerSeconds: 120},
		"an unknown language":              {Questions: 4, Tone: "neutral", Language: "xx-XX", AnswerSeconds: 120},
		"a one-second answer limit":        {Questions: 4, Tone: "neutral", Language: "en-US", AnswerSeconds: 1},
		"a day-long answer limit":          {Questions: 4, Tone: "neutral", Language: "en-US", AnswerSeconds: 86400},
	} {
		if got := in.Normalized(); got != d {
			t.Errorf("%s: got %+v, want the defaults %+v", name, got, d)
		}
	}
}

func TestEveryInterviewLanguageHasAName(t *testing.T) {
	for tag, name := range InterviewLanguages {
		if name == "" {
			t.Errorf("language %q has no name to give the model", tag)
		}
	}
	if _, ok := InterviewLanguages[DefaultInterviewConfig().Language]; !ok {
		t.Error("the default language must be one a company can pick")
	}
}
