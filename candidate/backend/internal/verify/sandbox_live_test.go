package verify

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/mindfries/candidate-backend/internal/config"
	"github.com/mindfries/candidate-backend/internal/sandbox"
)

// The real thing, against the real Daytona: creates a sandbox, writes a small
// project into it, runs its tests twice, and deletes it. It costs a sandbox,
// so it only runs when asked for:
//
//	DAYTONA_LIVE=1 go test ./internal/verify -run Live -v
//
// The key is read from the environment, or from candidate/backend/.env.local.
func TestLiveSandboxRunnerRunsAGeneratedTask(t *testing.T) {
	if os.Getenv("DAYTONA_LIVE") == "" {
		t.Skip("set DAYTONA_LIVE=1 to run this against Daytona")
	}
	config.LoadEnvFiles("../../.env.local", "../../.env")
	client := sandbox.New(os.Getenv("DAYTONA_API_KEY"), os.Getenv("DAYTONA_BASE_URL"))
	if !client.Configured() {
		t.Fatal("DAYTONA_API_KEY is not set")
	}

	task := Task{
		StarterFiles: map[string]string{
			"/pricing/__init__.py": "",
			"/pricing/discount.py": "def apply(total, percent):\n    return total - total * percent\n",
			"/tests/__init__.py":   "",
			"/tests/test_discount.py": "import unittest\nfrom pricing.discount import apply\n\n\nclass DiscountTest(unittest.TestCase):\n" +
				"    def test_ten_percent_off(self):\n        self.assertEqual(apply(200, 10), 180)\n",
		},
		SolutionFiles: map[string]string{
			"/pricing/discount.py": "def apply(total, percent):\n    return total - total * percent / 100\n",
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	started := time.Now()
	got := Check(ctx, SandboxRunner{Client: client}, task)
	t.Logf("status %s in %s — %s", got.Status, time.Since(started).Round(time.Second), got.Reason)
	if got.Starter != nil {
		t.Logf("starter exit %d:\n%s", got.Starter.ExitCode, got.Starter.Output)
	}
	if got.Solution != nil {
		t.Logf("solution exit %d:\n%s", got.Solution.ExitCode, got.Solution.Output)
	}
	if got.Status != Verified {
		t.Fatalf("expected the task to verify in a sandbox")
	}
	if got.Starter.ExitCode == 0 || !strings.Contains(got.Starter.Output, "FAILED") || got.Solution.ExitCode != 0 {
		t.Errorf("starter should fail and the solution pass")
	}
}
