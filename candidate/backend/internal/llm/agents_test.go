package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestStripCodeFence(t *testing.T) {
	cases := map[string]string{
		`{"a":1}`:                 `{"a":1}`,
		"```json\n{\"a\":1}\n```": `{"a":1}`,
		"```\n{\"a\":1}\n```":     `{"a":1}`,
		"  {\"a\":1}  ":           `{"a":1}`,
	}
	for in, want := range cases {
		if got := stripCodeFence(in); got != want {
			t.Errorf("stripCodeFence(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestDefaultAgentModelsFallsBackToDefault(t *testing.T) {
	for _, k := range []string{"OPENROUTER_MODEL_CODE_EVAL", "OPENROUTER_MODEL_REASONING", "OPENROUTER_MODEL_WORKFLOW", "OPENROUTER_MODEL_REPORT"} {
		os.Unsetenv(k)
	}
	m := DefaultAgentModels()
	if m.CodeEvaluation != defaultModel || m.Reasoning != defaultModel || m.Workflow != defaultModel || m.Report != defaultModel {
		t.Fatalf("expected every agent to default to %q, got %+v", defaultModel, m)
	}
}

func TestDefaultAgentModelsHonorsOverride(t *testing.T) {
	os.Setenv("OPENROUTER_MODEL_CODE_EVAL", "some/other-model")
	defer os.Unsetenv("OPENROUTER_MODEL_CODE_EVAL")
	m := DefaultAgentModels()
	if m.CodeEvaluation != "some/other-model" {
		t.Fatalf("CodeEvaluation = %q, want the override", m.CodeEvaluation)
	}
	if m.Reasoning != defaultModel {
		t.Fatalf("Reasoning should stay at the default when only Code Eval is overridden")
	}
}

func TestAgentsRefuseEmptyEvidence(t *testing.T) {
	a := NewAgents(NewOpenRouterClient("k", ""), DefaultAgentModels())
	if _, err := a.EvaluateCode(context.Background(), ""); err == nil {
		t.Error("EvaluateCode with empty diff should error")
	}
	if _, err := a.AnalyzeReasoning(context.Background(), "  "); err == nil {
		t.Error("AnalyzeReasoning with blank digest should error")
	}
	if _, err := a.AnalyzeWorkflow(context.Background(), ""); err == nil {
		t.Error("AnalyzeWorkflow with empty digest should error")
	}
	if _, err := a.GenerateReport(context.Background(), nil); err == nil {
		t.Error("GenerateReport with no evidence should error")
	}
}

func TestGenerateReportParsesStrictJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(chatResponse{
			Choices: []struct {
				Message ChatMessage `json:"message"`
			}{{Message: ChatMessage{Content: `{"recommendation":"hire","summary":"solid work"}`}}},
		})
	}))
	defer srv.Close()

	a := NewAgents(NewOpenRouterClient("k", srv.URL), DefaultAgentModels())
	result, err := a.GenerateReport(context.Background(), []string{"Code Evaluation:\nlooks fine"})
	if err != nil {
		t.Fatalf("GenerateReport: %v", err)
	}
	if result.Recommendation != "hire" || result.Summary != "solid work" {
		t.Fatalf("got %+v", result)
	}
}

func TestGenerateReportDegradesGracefullyOnNonJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(chatResponse{
			Choices: []struct {
				Message ChatMessage `json:"message"`
			}{{Message: ChatMessage{Content: "I think this candidate did fine, no JSON here."}}},
		})
	}))
	defer srv.Close()

	a := NewAgents(NewOpenRouterClient("k", srv.URL), DefaultAgentModels())
	result, err := a.GenerateReport(context.Background(), []string{"evidence"})
	if err != nil {
		t.Fatalf("expected a graceful degrade, not an error: %v", err)
	}
	if result.Recommendation != "" {
		t.Fatalf("expected an empty recommendation when the model didn't reply in JSON, got %q", result.Recommendation)
	}
	if result.Summary == "" {
		t.Fatal("expected the raw reply to be kept as the summary")
	}
}
