const aiReviewService = require('../services/aiReviewService');
const securityScannerService = require('../services/securityScannerService');
const customLinterService = require('../services/customLinterService');
const githubService = require('../services/githubService');
const { Review, Project } = require('../models');

class ReviewController {
  async createReview(req, res) {
    try {
      const {
        prNumber,
        repository,
        owner,
        diff,
        files,
        reviewLevel,
        openaiKey,
        githubToken
      } = req.body;

      // Initialize GitHub service
      githubService.initialize(githubToken);

      // Check if project exists, create if not
      let project = await Project.findOne({
        where: { repository, owner }
      });

      if (!project) {
        project = await Project.create({
          name: repository,
          repository,
          owner,
          review_level: reviewLevel
        });
      }

      // Create review record
      const review = await Review.create({
        project_id: project.id,
        pr_number: prNumber,
        review_status: 'pending'
      });

      // Perform AI review
      const aiAnalysis = await aiReviewService.analyzePullRequest({
        diff,
        files,
        repository,
        prNumber
      }, reviewLevel);

      // Perform security scan
      const securityScan = await securityScannerService.scanCode(files);

      // Perform custom linting
      const customRules = project.custom_rules || [];
      const lintingResults = await customLinterService.lintFiles(files, customRules);

      // Combine all results
      const combinedComments = [
        ...aiAnalysis.comments,
        ...securityScan.issues.critical.map(issue => ({
          path: issue.file,
          line: issue.line,
          body: `🔒 **SECURITY ${issue.severity.toUpperCase()}**: ${issue.message}\n\n${issue.suggestion}`
        })),
        ...lintingResults.issues.errors.map(issue => ({
          path: issue.file,
          line: issue.line,
          body: `📏 **LINTING ERROR**: ${issue.message}\n\nRule: \`${issue.rule}\``
        }))
      ];

      // Generate comprehensive summary
      const summary = this.generateComprehensiveSummary(
        aiAnalysis,
        securityScan,
        lintingResults,
        reviewLevel
      );

      // Update review record
      await review.update({
        review_status: 'completed',
        ai_feedback: aiAnalysis,
        security_issues: securityScan.issues,
        linting_issues: lintingResults.issues,
        metrics: {
          totalIssues: combinedComments.length,
          aiIssues: aiAnalysis.comments.length,
          securityIssues: securityScan.total,
          lintingIssues: lintingResults.total
        }
      });

      // Update project metrics
      await this.updateProjectMetrics(project.id, review);

      res.json({
        success: true,
        reviewId: review.id,
        comments: combinedComments,
        summary,
        securityIssues: securityScan,
        lintingIssues: lintingResults,
        metrics: {
          totalIssues: combinedComments.length,
          criticalIssues: securityScan.critical,
          highPriorityIssues: securityScan.high
        }
      });

    } catch (error) {
      console.error('Review creation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getReview(req, res) {
    try {
      const { reviewId } = req.params;
      
      const review = await Review.findByPk(reviewId, {
        include: [Project]
      });

      if (!review) {
        return res.status(404).json({
          success: false,
          error: 'Review not found'
        });
      }

      res.json({
        success: true,
        review
      });

    } catch (error) {
      console.error('Get review error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getProjectReviews(req, res) {
    try {
      const { projectId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      
      const offset = (page - 1) * limit;
      
      const { count, rows: reviews } = await Review.findAndCountAll({
        where: { project_id: projectId },
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      res.json({
        success: true,
        reviews,
        pagination: {
          total: count,
          page: parseInt(page),
          pages: Math.ceil(count / limit)
        }
      });

    } catch (error) {
      console.error('Get project reviews error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  generateComprehensiveSummary(aiAnalysis, securityScan, lintingResults, reviewLevel) {
    let summary = `# 🤖 AI Code Companion Review Report\n\n`;
    summary += `**Review Level:** ${reviewLevel}\n`;
    summary += `**Timestamp:** ${new Date().toISOString()}\n\n`;

    // Overall status
    const totalIssues = 
      aiAnalysis.comments.length + 
      securityScan.total + 
      lintingResults.total;

    const hasCritical = securityScan.critical > 0 || lintingResults.issues.errors.length > 0;
    
    if (totalIssues === 0) {
      summary += `## ✅ Status: APPROVED\n\nNo issues found. Great job!\n\n`;
    } else if (hasCritical) {
      summary += `## ❌ Status: CHANGES REQUESTED\n\nCritical issues found that must be addressed.\n\n`;
    } else {
      summary += `## ⚠️ Status: REVIEW SUGGESTED\n\nSome issues found that should be reviewed.\n\n`;
    }

    // Metrics summary
    summary += `## 📊 Metrics\n\n`;
    summary += `| Category | Count | Priority |\n`;
    summary += `|----------|-------|----------|\n`;
    summary += `| Security Issues | ${securityScan.total} | ${securityScan.critical > 0 ? '🔴 Critical' : securityScan.high > 0 ? '🟠 High' : '🟡 Medium'} |\n`;
    summary += `| Code Quality | ${aiAnalysis.comments.length} | ${aiAnalysis.issues.bugs.length > 0 ? '🟠 High' : '🟡 Medium'} |\n`;
    summary += `| Linting | ${lintingResults.total} | ${lintingResults.issues.errors.length > 0 ? '🔴 Errors' : '⚠️ Warnings'} |\n\n`;

    // Detailed sections
    if (securityScan.total > 0) {
      summary += `## 🔒 Security Analysis\n\n`;
      summary += securityScan.summary + '\n\n';
    }

    if (aiAnalysis.comments.length > 0) {
      summary += `## 🧠 AI Code Review\n\n`;
      summary += aiAnalysis.summary + '\n\n';
    }

    if (lintingResults.total > 0) {
      summary += `## 📝 Custom Linting\n\n`;
      summary += lintingResults.summary + '\n\n';
    }

    // Recommendations
    summary += `## 💡 Recommendations\n\n`;
    if (hasCritical) {
      summary += `1. **Address critical security issues immediately**\n`;
      summary += `2. Fix all linting errors before merge\n`;
    }
    if (aiAnalysis.issues.performance.length > 0) {
      summary += `3. Consider performance optimizations suggested\n`;
    }
    summary += `4. Review all AI suggestions for code quality improvements\n\n`;

    summary += `---\n`;
    summary += `*Generated by [AI Code Companion](https://github.com/your-org/ai-code-companion)*\n`;
    summary += `*Questions? Check our [documentation](https://docs.ai-companion.dev)*`;

    return summary;
  }

  async updateProjectMetrics(projectId, review) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const [metric, created] = await ReviewMetric.findOrCreate({
        where: {
          project_id: projectId,
          date: today
        },
        defaults: {
          total_reviews: 0,
          issues_found: 0,
          security_issues: 0
        }
      });

      await metric.increment({
        total_reviews: 1,
        issues_found: review.metrics.totalIssues,
        security_issues: review.metrics.securityIssues
      });

    } catch (error) {
      console.error('Error updating metrics:', error);
    }
  }
}

module.exports = new ReviewController();