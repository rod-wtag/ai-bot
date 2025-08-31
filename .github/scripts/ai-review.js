import { execSync } from "child_process";
import OpenAI from "openai";
import { Octokit } from "@octokit/rest";

// === 1. Setup GitHub + HuggingFace ===
const githubToken = process.env.GITHUB_TOKEN;
const hfToken = process.env.HF_TOKEN;
const prNumber = process.env.PR_NUMBER;
const repo = process.env.GITHUB_REPOSITORY;

if (!githubToken || !hfToken) {
  console.error("❌ Missing GITHUB_TOKEN or HF_TOKEN");
  process.exit(1);
}

const [owner, repoName] = repo.split("/");
const octokit = new Octokit({ auth: githubToken });

// Hugging Face OpenAI-compatible client
const client = new OpenAI({
  baseURL: "https://router.huggingface.co/v1",
  apiKey: hfToken,
});

// === 2. Get PR diff ===
let diff;
try {
  diff = execSync(`git fetch origin pull/${prNumber}/head:pr-${prNumber} && git diff origin/main...pr-${prNumber}`, {
    encoding: "utf-8",
  });
} catch (err) {
  console.error("❌ Failed to fetch PR diff:", err.message);
  process.exit(1);
}

// === 3. Send diff to AI ===
let aiResponse;
try {
  const completion = await client.chat.completions.create({
    model: "HuggingFaceH4/zephyr-7b-beta", // free Hugging Face model
    messages: [
      {
        role: "system",
        content: "You are a senior code reviewer. Provide constructive, concise feedback on code diffs.",
      },
      {
        role: "user",
        content: `Please review this pull request diff and suggest improvements:\n\n${diff}`,
      },
    ],
  });

  aiResponse = completion.choices[0].message.content;
} catch (err) {
  console.error("❌ AI request failed:", err);
  process.exit(1);
}

// === 4. Post review as PR comment ===
try {
  await octokit.issues.createComment({
    owner,
    repo: repoName,
    issue_number: prNumber,
    body: `🤖 **AI Code Review**\n\n${aiResponse}`,
  });
  console.log("✅ AI review posted successfully!");
} catch (err) {
  console.error("❌ Failed to post PR comment:", err.message);
  process.exit(1);
}
