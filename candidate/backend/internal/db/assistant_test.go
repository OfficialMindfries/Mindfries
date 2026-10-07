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
