import { execSync } from "child_process";
import { Octokit } from "@octokit/rest";
import OpenAI from "openai";

// Get PR info from env
const repoFullName = process.env.REPO; // e.g., "user/repo"
const prNumber = process.env.PR_NUMBER;
const githubToken = process.env.GITHUB_TOKEN;

// Initialize Octokit (GitHub API)
const octokit = new Octokit({ auth: githubToken });

// Initialize OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 1️⃣ Get list of changed files in the PR
const { data: files } = await octokit.rest.pulls.listFiles({
  owner: repoFullName.split("/")[0],
  repo: repoFullName.split("/")[1],
  pull_number: prNumber,
});

let codeToReview = "";

for (const file of files) {
  if (file.status === "added" || file.status === "modified") {
    // Get raw file content
    const content = execSync(`git show HEAD:${file.filename}`, { encoding: "utf8" }).toString();
    codeToReview += `File: ${file.filename}\n${content}\n\n`;
  }
}

// 2️⃣ Ask AI to review the code
const reviewPrompt = `
You are an expert code reviewer. Review the following code and provide constructive comments or suggestions:

${codeToReview}

Respond in markdown format.
`;

const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: reviewPrompt }],
});

// 3️⃣ Post AI review as a comment
await octokit.rest.issues.createComment({
  owner: repoFullName.split("/")[0],
  repo: repoFullName.split("/")[1],
  issue_number: prNumber,
  body: response.choices[0].message.content,
});
