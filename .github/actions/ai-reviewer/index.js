const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

async function run() {
  try {
    const token = core.getInput('github-token');
    const apiEndpoint = core.getInput('api-endpoint');
    const openaiKey = core.getInput('openai-api-key');
    const reviewLevel = core.getInput('review-level');
    
    const octokit = github.getOctokit(token);
    const context = github.context;
    
    if (context.eventName !== 'pull_request') {
      core.info('This action only runs on pull requests');
      return;
    }
    
    const pr = context.payload.pull_request;
    
    // Get PR diff
    const { data: diff } = await octokit.rest.pulls.get({
      ...context.repo,
      pull_number: pr.number,
      mediaType: { format: 'diff' }
    });
    
    // Get changed files
    const { data: files } = await octokit.rest.pulls.listFiles({
      ...context.repo,
      pull_number: pr.number
    });
    
    // Send to backend for analysis
    const reviewResponse = await axios.post(`${apiEndpoint}/api/reviews`, {
      prNumber: pr.number,
      repository: context.repo.repo,
      owner: context.repo.owner,
      diff: diff,
      files: files.map(f => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
        contents: f.contents_url
      })),
      reviewLevel: reviewLevel,
      openaiKey: openaiKey
    });
    
    const { comments, summary, securityIssues, lintingIssues } = reviewResponse.data;
    
    // Post review comments
    for (const comment of comments) {
      await octokit.rest.pulls.createReviewComment({
        ...context.repo,
        pull_number: pr.number,
        body: comment.body,
        path: comment.path,
        line: comment.line || comment.position,
        side: comment.side || 'RIGHT'
      });
    }
    
    // Post summary review
    await octokit.rest.pulls.createReview({
      ...context.repo,
      pull_number: pr.number,
      body: summary,
      event: securityIssues.critical > 0 ? 'REQUEST_CHANGES' : 'COMMENT'
    });
    
    // Set action outputs
    core.setOutput('review-complete', 'true');
    core.setOutput('security-issues', securityIssues.total);
    core.setOutput('linting-issues', lintingIssues.total);
    
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();