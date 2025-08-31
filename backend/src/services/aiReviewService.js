const OpenAI = require('openai');
const { Review } = require('../models/Review');

class AIReviewService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async analyzePullRequest(prData, reviewLevel = 'standard') {
    const { diff, files, repository, prNumber } = prData;
    
    const comments = [];
    const issues = {
      bugs: [],
      codeSmells: [],
      performance: [],
      security: [],
      bestPractices: []
    };

    // Analyze each file
    for (const file of files) {
      if (this.shouldSkipFile(file.filename)) continue;
      
      const analysis = await this.analyzeFile(file, reviewLevel);
      comments.push(...analysis.comments);
      this.categorizeIssues(analysis.issues, issues);
    }

    // Generate summary
    const summary = await this.generateSummary(issues, files, reviewLevel);
    
    // Save to database
    const review = await Review.create({
      pr_number: prNumber,
      repository: repository,
      ai_feedback: { comments, issues, summary },
      review_status: 'completed'
    });

    return {
      comments,
      summary,
      issues,
      reviewId: review.id
    };
  }

  async analyzeFile(file, reviewLevel) {
    const prompt = this.buildAnalysisPrompt(file, reviewLevel);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `You are an expert code reviewer. Analyze the code changes and provide:
              1. Specific, actionable feedback
              2. Security vulnerabilities
              3. Performance issues
              4. Code quality improvements
              5. Best practice violations
              
              Format your response as JSON with structure:
              {
                "comments": [
                  {
                    "line": number,
                    "body": "comment text",
                    "severity": "error|warning|info",
                    "category": "bug|security|performance|style|bestpractice"
                  }
                ],
                "issues": [
                  {
                    "type": "category",
                    "description": "issue description",
                    "suggestion": "how to fix"
                  }
                ]
              }`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('AI analysis error:', error);
      return { comments: [], issues: [] };
    }
  }

  buildAnalysisPrompt(file, reviewLevel) {
    const levelInstructions = {
      light: 'Focus only on critical bugs and security issues',
      standard: 'Review for bugs, security, performance, and major code quality issues',
      strict: 'Comprehensive review including style, naming, documentation, and all best practices'
    };

    return `
      Review Level: ${reviewLevel}
      Instructions: ${levelInstructions[reviewLevel]}
      
      File: ${file.filename}
      Status: ${file.status}
      Additions: ${file.additions}
      Deletions: ${file.deletions}
      
      Code Patch:
      ${file.patch}
      
      Analyze this code change and provide feedback.
    `;
  }

  async generateSummary(issues, files, reviewLevel) {
    const totalIssues = Object.values(issues).flat().length;
    const criticalIssues = issues.security.length + issues.bugs.length;
    
    let summary = `## 🤖 AI Code Review Summary\n\n`;
    summary += `**Review Level:** ${reviewLevel}\n`;
    summary += `**Files Analyzed:** ${files.length}\n`;
    summary += `**Total Issues Found:** ${totalIssues}\n\n`;
    
    if (criticalIssues > 0) {
      summary += `### ⚠️ Critical Issues (${criticalIssues})\n`;
      if (issues.security.length > 0) {
        summary += `\n**Security Issues:** ${issues.security.length}\n`;
        issues.security.forEach(issue => {
          summary += `- ${issue.description}\n`;
        });
      }
      if (issues.bugs.length > 0) {
        summary += `\n**Potential Bugs:** ${issues.bugs.length}\n`;
        issues.bugs.forEach(issue => {
          summary += `- ${issue.description}\n`;
        });
      }
    }
    
    if (issues.performance.length > 0) {
      summary += `\n### 🚀 Performance Improvements (${issues.performance.length})\n`;
      issues.performance.slice(0, 3).forEach(issue => {
        summary += `- ${issue.description}\n`;
      });
    }
    
    if (issues.bestPractices.length > 0) {
      summary += `\n### 📚 Best Practice Suggestions (${issues.bestPractices.length})\n`;
      issues.bestPractices.slice(0, 3).forEach(issue => {
        summary += `- ${issue.description}\n`;
      });
    }
    
    summary += `\n---\n*Generated by AI Code Companion*`;
    
    return summary;
  }

  shouldSkipFile(filename) {
    const skipPatterns = [
      /node_modules/,
      /package-lock\.json/,
      /\.min\.js$/,
      /\.min\.css$/,
      /dist\//,
      /build\//,
      /\.map$/
    ];
    
    return skipPatterns.some(pattern => pattern.test(filename));
  }

  categorizeIssues(issues, categories) {
    issues.forEach(issue => {
      switch (issue.type) {
        case 'bug':
          categories.bugs.push(issue);
          break;
        case 'security':
          categories.security.push(issue);
          break;
        case 'performance':
          categories.performance.push(issue);
          break;
        case 'style':
          categories.codeSmells.push(issue);
          break;
        case 'bestpractice':
          categories.bestPractices.push(issue);
          break;
        default:
          categories.codeSmells.push(issue);
      }
    });
  }
}

module.exports = new AIReviewService();