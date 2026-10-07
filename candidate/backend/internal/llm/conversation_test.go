package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// fakeAgents answers every completion with reply and hands each request's
// decoded body to inspect.
func fakeAgents(t *testing.T, reply string, inspect func(chatRequest)) *Agents {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req chatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("request body: %v", err)
		}
		if inspect != nil {
			inspect(req)
		}
		json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]string{"role": "assistant", "content": reply}}},
		})
	}))
	t.Cleanup(srv.Close)
	return NewAgents(NewOpenRouterClient("k", srv.URL), DefaultAgentModels())
}

func TestAssistSendsBriefFileHistoryAndTheNoSolutionRule(t *testing.T) {
	var got chatRequest
	a := fakeAgents(t, "Look at how expiry is compared.", func(r chatRequest) { got = r })

	history := []ChatMessage{{Role: "user", Content: "earlier question"}, {Role: "assistant", Content: "earlier answer"}}
	reply, err := a.Assist(context.Background(), "Fix the auth bug", "src/auth.js", "const x = 1", history, "where do I start?")
	if err != nil || reply == "" {
		t.Fatalf("Assist: %q, %v", reply, err)
	}
	if got.Model != conversationModel {
		t.Errorf("model = %q, want %q", got.Model, conversationModel)
	}
	all, _ := json.Marshal(got.Messages)
	for _, want := range []string{"Never write the solution", "Fix the auth bug", "src/auth.js", "earlier answer"} {
		if !strings.Contains(string(all), want) {
			t.Errorf("request is missing %q", want)
		}
	}
	if last := got.Messages[len(got.Messages)-1]; last.Role != "user" || last.Content != "where do I start?" {
		t.Errorf("the candidate's message should be last, got %+v", last)
	}
	if _, err := a.Assist(context.Background(), "", "", "", nil, "  "); err == nil {
		t.Error("a blank message should be refused")
	}
}

func TestInterviewTurnCarriesTheWorkAndTranscript(t *testing.T) {
	var got chatRequest
	a := fakeAgents(t, "  Why did you change the comparison?  ", func(r chatRequest) { got = r })

	q, err := a.InterviewTurn(context.Background(), "brief", "probe the expiry check", "=== a.js (modified)", "[10:00] file_edit",
		[]ChatMessage{{Role: "assistant", Content: "First question?"}, {Role: "user", Content: "My answer."}}, 2, 4)
	if err != nil {
		t.Fatal(err)
	}
	if q != "Why did you change the comparison?" {
		t.Errorf("question should be trimmed, got %q", q)
	}
	prompt := got.Messages[len(got.Messages)-1].Content
	for _, want := range []string{"probe the expiry check", "a.js (modified)", "Interviewer: First question?", "Candidate: My answer.", "question 2 of 4"} {
		if !strings.Contains(prompt, want) {
			t.Errorf("prompt is missing %q:\n%s", want, prompt)
		}
	}
}

func TestGenerateTaskParsesFencedJSONAndRejectsJunk(t *testing.T) {
	good := "```json\n{\"taskBrief\": \"# Task\", \"starterFiles\": {\"README.md\": \"hi\"}}\n```"
	task, err := fakeAgents(t, good, nil).GenerateTask(context.Background(), TaskSpec{Name: "Auth fix", TechStack: []string{"Node"}})
	if err != nil {
		t.Fatal(err)
	}
	if task.TaskBrief != "# Task" || task.StarterFiles["README.md"] != "hi" {
		t.Fatalf("unexpected task: %+v", task)
	}

	if _, err := fakeAgents(t, "Sure, here is a task", nil).GenerateTask(context.Background(), TaskSpec{Name: "x"}); err == nil {
		t.Error("a non-JSON reply should be an error, not a task")
	}
	if _, err := fakeAgents(t, `{"taskBrief": "", "starterFiles": {}}`, nil).GenerateTask(context.Background(), TaskSpec{Name: "x"}); err == nil {
		t.Error("an empty task should be an error")
	}
	if _, err := fakeAgents(t, good, nil).GenerateTask(context.Background(), TaskSpec{}); err == nil {
		t.Error("a spec with no name should be refused")
	}
}
