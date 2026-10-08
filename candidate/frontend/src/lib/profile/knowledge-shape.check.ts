/**
 * Checks knowledge-shape.ts, in Node:
 *
 *   node src/lib/profile/knowledge-shape.check.ts          recorded responses only
 *   node src/lib/profile/knowledge-shape.check.ts --live   also reads a real GitHub and GitLab account
 */
import { shapeGithub, shapeGitlab, statsOf } from "./knowledge-shape.ts";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const gh = shapeGithub(
  { login: "asha", name: "Asha Verma", html_url: "https://github.com/asha", public_repos: 4, followers: 12, created_at: "2015-03-01T00:00:00Z" },
  [
    { name: "ledger", language: "Go", stargazers_count: 40, pushed_at: "2026-09-01T10:00:00Z", html_url: "https://github.com/asha/ledger", fork: false, description: "A ledger" },
    { name: "linux", language: "C", stargazers_count: 0, pushed_at: "2026-09-20T10:00:00Z", html_url: "https://github.com/asha/linux", fork: true },
    { name: "recon", language: "Python", stargazers_count: 3, pushed_at: "2026-09-10T10:00:00Z", html_url: "https://github.com/asha/recon", fork: false, description: null },
    { name: "queue", language: "Go", stargazers_count: 1, pushed_at: "2025-01-10T10:00:00Z", html_url: "https://github.com/asha/queue", fork: false },
    { name: "notes", language: null, stargazers_count: 0, pushed_at: "2024-01-10T10:00:00Z", html_url: "https://github.com/asha/notes", fork: false },
  ],
  [
    { type: "PushEvent", created_at: "2026-09-10T10:00:00Z" },
    { type: "PushEvent", created_at: "2026-08-02T10:00:00Z" },
    { type: "PullRequestEvent", created_at: "2026-09-12T10:00:00Z" },
    { type: "WatchEvent", created_at: "2026-07-01T10:00:00Z" },
  ],
);
check("forks are left out of projects", gh.projectCount === 4 && !gh.projects.some((p) => p.name === "linux"), gh.projects.map((p) => p.name).join(", "));
check("projects are most recently worked on first", gh.projects[0].name === "recon" && gh.projects[1].name === "ledger");
check("languages are counted across own projects", gh.languages[0].name === "Go" && gh.languages[0].projects === 2 && gh.languages.length === 2, JSON.stringify(gh.languages));
check("a fork's language is not counted", !gh.languages.some((l) => l.name === "C"));
check("activity counts events by kind", gh.activity?.pushes === 2 && gh.activity.pullRequests === 1 && gh.activity.events === 4);
check("activity says what window it covers", gh.activity?.since === "2026-07-01T10:00:00Z" && gh.activity.lastActiveAt === "2026-09-12T10:00:00Z");
check("the tile's few fields come from the same read", statsOf(gh).name === "Asha Verma" && statsOf(gh).publicRepos === 4);

const quiet = shapeGithub({ login: "quiet" }, [], []);
check("an account with nothing public is empty, not an error", quiet.projects.length === 0 && quiet.activity?.lastActiveAt === null && quiet.profile.name === "quiet");
check("events the platform wouldn't give are null, not zero", shapeGithub({ login: "x" }, [], null).activity === null);

const gl = shapeGitlab(
  { username: "asha", name: "Asha V", web_url: "https://gitlab.com/asha" },
  [
    { id: 1, name: "svc", star_count: 2, last_activity_at: "2026-05-01T00:00:00Z", web_url: "https://gitlab.com/asha/svc" },
    { id: 2, name: "forked", star_count: 0, last_activity_at: "2026-06-01T00:00:00Z", web_url: "https://gitlab.com/asha/forked", forked_from_project: { id: 9 } },
    { id: 3, name: "site", star_count: 0, last_activity_at: "2026-04-01T00:00:00Z", web_url: "https://gitlab.com/asha/site" },
  ],
  { "1": { Go: 80.5, Shell: 19.5 }, "3": { TypeScript: 60, CSS: 40 } },
  [
    { action_name: "pushed to", created_at: "2026-05-01T00:00:00Z" },
    { action_name: "opened", target_type: "MergeRequest", created_at: "2026-05-02T00:00:00Z" },
    { action_name: "opened", target_type: "Issue", created_at: "2026-05-03T00:00:00Z" },
  ],
);
check("a GitLab project's language is its largest share", gl.projects[0].language === "Go" && gl.projects[1].language === "TypeScript");
check("GitLab forks are left out", gl.projectCount === 2);
check("GitLab activity is counted by kind", gl.activity?.pushes === 1 && gl.activity.pullRequests === 1 && gl.activity.issues === 1);

if (process.argv.includes("--live")) {
  const headers = { "User-Agent": "Mindfries-Candidate-App/1.0", Accept: "application/json" };
  const j = async (url: string) => {
    const res = await fetch(url, { headers });
    return res.ok ? res.json() : null;
  };
  const u = "gaearon";
  const [user, repos, events] = await Promise.all([j(`https://api.github.com/users/${u}`), j(`https://api.github.com/users/${u}/repos?per_page=100&sort=pushed&type=owner`), j(`https://api.github.com/users/${u}/events/public?per_page=100`)]);
  if (!user) console.log("skip  GitHub didn't answer (rate limit?), so the live GitHub case wasn't run");
  else {
    const live = shapeGithub(user, repos ?? [], events);
    check("a real GitHub account is read", live.handle.toLowerCase() === u && live.projects.length > 0 && live.languages.length > 0, `${live.projectCount} projects, top language ${live.languages[0]?.name}, last active ${live.activity?.lastActiveAt}`);
  }
  const found = await j("https://gitlab.com/api/v4/users?username=gitlab-bot");
  if (!found?.[0]) console.log("skip  GitLab didn't answer, so the live GitLab case wasn't run");
  else {
    const id = found[0].id;
    const [projects, glEvents] = await Promise.all([j(`https://gitlab.com/api/v4/users/${id}/projects?per_page=100`), j(`https://gitlab.com/api/v4/users/${id}/events?per_page=100`)]);
    const live = shapeGitlab(found[0], projects ?? [], {}, glEvents);
    check("a real GitLab account is read", live.handle === "gitlab-bot", `${live.projectCount} projects, events ${live.activity ? live.activity.events : "not given"}`);
  }
}

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
