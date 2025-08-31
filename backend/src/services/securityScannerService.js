const crypto = require('crypto');

class SecurityScannerService {
  constructor() {
    this.patterns = {
      secrets: [
        {
          name: 'AWS Access Key',
          pattern: /AKIA[0-9A-Z]{16}/gi,
          severity: 'critical'
        },
        {
          name: 'AWS Secret Key',
          pattern: /aws(.{0,20})?['\"][0-9a-zA-Z\/+]{40}['\"]/gi,
          severity: 'critical'
        },
        {
          name: 'GitHub Token',
          pattern: /ghp_[0-9a-zA-Z]{36}/gi,
          severity: 'critical'
        },
        {
          name: 'Generic API Key',
          pattern: /api[_\-]?key['\"]?\s*[:=]\s*['\"][0-9a-zA-Z\-_]{20,}['\"]/gi,
          severity: 'high'
        },
        {
          name: 'Private Key',
          pattern: /-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----/gi,
          severity: 'critical'
        },
        {
          name: 'Database Connection String',
          pattern: /['\"]?((mongodb|mysql|postgresql|redis):\/\/[^'\"]+)['\"]/gi,
          severity: 'critical'
        },
        {
          name: 'JWT Secret',
          pattern: /jwt[_\-]?secret['\"]?\s*[:=]\s*['\"][^'\"]{10,}['\"]/gi,
          severity: 'high'
        }
      ],
      vulnerabilities: [
        {
          name: 'SQL Injection',
          pattern: /query\s*\(\s*['"`].*\$\{.*\}.*['"`]\s*\)/gi,
          severity: 'high',
          description: 'Potential SQL injection vulnerability'
        },
        {
          name: 'Command Injection',
          pattern: /exec\s*\(.*\$\{.*\}/gi,
          severity: 'critical',
          description: 'Potential command injection vulnerability'
        },
        {
          name: 'XSS',
          pattern: /innerHTML\s*=\s*[^'"`]+(\$\{|user|input|data)/gi,
          severity: 'high',
          description: 'Potential XSS vulnerability'
        },
        {
          name: 'Path Traversal',
          pattern: /\.\.\/|\.\.\\|%2e%2e%2f/gi,
          severity: 'medium',
          description: 'Potential path traversal vulnerability'
        },
        {
          name: 'Hardcoded Password',
          pattern: /password['\"]?\s*[:=]\s*['\"]\w{4,}['\"]/gi,
          severity: 'critical',
          description: 'Hardcoded password detected'
        }
      ],
      dependencies: [
        {
          name: 'Outdated Dependencies',
          pattern: /\"(?:dependencies|devDependencies)\"\s*:\s*\{[^}]*\}/g,
          severity: 'low',
          check: 'version'
        }
      ]
    };
  }

  async scanCode(files) {
    const issues = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };

    for (const file of files) {
      if (!this.shouldScanFile(file.filename)) continue;
      
      const fileIssues = await this.scanFile(file);
      this.categorizeIssuesBySeverity(fileIssues, issues);
    }

    return {
      issues,
      summary: this.generateSecuritySummary(issues),
      total: Object.values(issues).flat().length,
      critical: issues.critical.length,
      high: issues.high.length
    };
  }

  async scanFile(file) {
    const issues = [];
    const content = file.patch || '';
    const lines = content.split('\n');

    // Scan for secrets
    for (const secretPattern of this.patterns.secrets) {
      const matches = content.matchAll(secretPattern.pattern);
      for (const match of matches) {
        const lineNumber = this.getLineNumber(lines, match.index);
        issues.push({
          type: 'secret',
          name: secretPattern.name,
          severity: secretPattern.severity,
          file: file.filename,
          line: lineNumber,
          match: this.sanitizeSecret(match[0]),
          message: `Potential ${secretPattern.name} exposed`,
          suggestion: 'Remove sensitive data and use environment variables'
        });
      }
    }

    // Scan for vulnerabilities
    for (const vulnPattern of this.patterns.vulnerabilities) {
      const matches = content.matchAll(vulnPattern.pattern);
      for (const match of matches) {
        const lineNumber = this.getLineNumber(lines, match.index);
        issues.push({
          type: 'vulnerability',
          name: vulnPattern.name,
          severity: vulnPattern.severity,
          file: file.filename,
          line: lineNumber,
          description: vulnPattern.description,
          message: `${vulnPattern.description} detected`,
          suggestion: this.getVulnerabilitySuggestion(vulnPattern.name)
        });
      }
    }

    // Additional security checks
    issues.push(...this.performAdvancedChecks(file, content));

    return issues;
  }

  performAdvancedChecks(file, content) {
    const issues = [];

    // Check for unsafe random number generation
    if (/Math\.random\(\)/.test(content) && 
        (file.filename.includes('auth') || file.filename.includes('token') || file.filename.includes('crypto'))) {
      issues.push({
        type: 'vulnerability',
        name: 'Weak Random Number Generation',
        severity: 'high',
        file: file.filename,
        message: 'Math.random() is not cryptographically secure',
        suggestion: 'Use crypto.randomBytes() or similar secure methods'
      });
    }

    // Check for disabled security features
    if (/csrf:\s*false|helmet:\s*false|cors:\s*\{\s*origin:\s*['"]\*['"]/gi.test(content)) {
      issues.push({
        type: 'configuration',
        name: 'Disabled Security Feature',
        severity: 'medium',
        file: file.filename,
        message: 'Security feature appears to be disabled',
        suggestion: 'Enable security features unless specifically required'
      });
    }

    // Check for eval usage
    if (/eval\s*\(|new\s+Function\s*\(/gi.test(content)) {
      issues.push({
        type: 'vulnerability',
        name: 'Dangerous Function Usage',
        severity: 'high',
        file: file.filename,
        message: 'Usage of eval() or Function constructor detected',
        suggestion: 'Avoid eval() and Function constructor for security'
      });
    }

    return issues;
  }

  getVulnerabilitySuggestion(vulnType) {
    const suggestions = {
      'SQL Injection': 'Use parameterized queries or prepared statements',
      'Command Injection': 'Sanitize input and use safe APIs that don\'t invoke shell',
      'XSS': 'Use textContent instead of innerHTML, or sanitize HTML content',
      'Path Traversal': 'Validate and sanitize file paths, use path.join()',
      'Hardcoded Password': 'Use environment variables or secure key management'
    };
    return suggestions[vulnType] || 'Review and fix the security issue';
  }

  sanitizeSecret(secret) {
    if (secret.length <= 10) return secret;
    const visibleChars = 4;
    return secret.substring(0, visibleChars) + '*'.repeat(8) + '...';
  }

  getLineNumber(lines, charIndex) {
    let currentIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      currentIndex += lines[i].length + 1; // +1 for newline
      if (currentIndex > charIndex) {
        return i + 1;
      }
    }
    return 1;
  }

  shouldScanFile(filename) {
    const scanExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cs', '.php', '.rb', '.go', '.yml', '.yaml', '.json', '.env'];
    return scanExtensions.some(ext => filename.endsWith(ext));
  }

  categorizeIssuesBySeverity(fileIssues, issues) {
    fileIssues.forEach(issue => {
      issues[issue.severity].push(issue);
    });
  }

  generateSecuritySummary(issues) {
    const total = Object.values(issues).flat().length;
    
    if (total === 0) {
      return '✅ No security issues detected';
    }

    let summary = `🔒 Security Scan Results:\n`;
    
    if (issues.critical.length > 0) {
      summary += `\n🔴 **CRITICAL (${issues.critical.length})**: Immediate action required\n`;
      issues.critical.slice(0, 3).forEach(issue => {
        summary += `  - ${issue.name} in ${issue.file}\n`;
      });
    }
    
    if (issues.high.length > 0) {
      summary += `\n🟠 **HIGH (${issues.high.length})**: Should be fixed before merge\n`;
      issues.high.slice(0, 3).forEach(issue => {
        summary += `  - ${issue.name} in ${issue.file}\n`;
      });
    }
    
    if (issues.medium.length > 0) {
      summary += `\n🟡 **MEDIUM (${issues.medium.length})**: Consider fixing\n`;
    }
    
    if (issues.low.length > 0) {
      summary += `\n🟢 **LOW (${issues.low.length})**: Minor issues\n`;
    }

    return summary;
  }
}

module.exports = new SecurityScannerService();