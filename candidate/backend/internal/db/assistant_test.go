package db

import "testing"

func TestParseAssistantConfig(t *testing.T) {
	cases := []struct {
		name, raw string
		want      AssistantConfig
	}{
		{"a role nobody has configured", `{}`, AssistantConfig{Enabled: true, MaxMessages: 60}},
		{"nothing stored", ``, AssistantConfig{Enabled: true, MaxMessages: 60}},
		{"junk", `not json`, AssistantConfig{Enabled: true, MaxMessages: 60}},
		{"turned off", `{"enabled":false}`, AssistantConfig{Enabled: false, MaxMessages: 60}},
		{"limited", `{"enabled":true,"maxMessages":10}`, AssistantConfig{Enabled: true, MaxMessages: 10}},
		{"a limit with no enabled field is still on", `{"maxMessages":5}`, AssistantConfig{Enabled: true, MaxMessages: 5}},
		{"a limit above the platform's ceiling", `{"maxMessages":5000}`, AssistantConfig{Enabled: true, MaxMessages: 60}},
		{"a limit of zero isn't a way to switch it off", `{"maxMessages":0}`, AssistantConfig{Enabled: true, MaxMessages: 60}},
	}
	for _, c := range cases {
		if got := ParseAssistantConfig([]byte(c.raw)); got != c.want {
			t.Errorf("%s: got %+v, want %+v", c.name, got, c.want)
		}
	}
}

func TestTemplateContentVersion(t *testing.T) {
	original := "original brief"
	tc := TemplateContent{
		Name: "Limiter", TaskBrief: &original, StarterFiles: map[string]string{"a.py": "original"},
		Variants: []TemplateVariant{{TaskBrief: "variant one", StarterFiles: map[string]string{"b.py": "one"}}},
	}
	if v := tc.Version(0); *v.TaskBrief != "original brief" || v.StarterFiles["a.py"] != "original" {
		t.Errorf("version 0 is the original: %+v", v)
	}
	v := tc.Version(1)
	if *v.TaskBrief != "variant one" || v.StarterFiles["b.py"] != "one" || v.Name != "Limiter" {
		t.Errorf("version 1 is the first variant under the template's own name: %+v", v)
	}
	if *tc.TaskBrief != "original brief" {
		t.Error("taking a version must not change the template")
	}
	if v := tc.Version(7); *v.TaskBrief != "original brief" {
		t.Errorf("a version that doesn't exist falls back to the original: %+v", v)
	}
}
