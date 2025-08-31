class CustomLinterService {
    constructor() {
        this.defaultRules = [
            {
                name: 'no-console-log',
                pattern: /console\.(log|debug|info)/g,
                message: 'Remove console statements before production',
                severity: 'warning',
                fileTypes: ['.js', '.jsx', '.ts', '.tsx']
            },
            {
                name: 'no-todo-comments',
                pattern: /\/\/\s*(TODO|FIXME|HACK)/gi,
                message: 'TODO comment found - create a ticket instead',
                severity: 'info',
                fileTypes: ['.js', '.jsx', '.ts', '.tsx', '.py', '.java']
            },
            {
                name: 'max-line-length',
                check: 'lineLength',
                maxLength: 120,
                message: 'Line exceeds maximum length of 120 characters',
                severity: 'warning'
            },
            {
                name: 'no-magic-numbers',
                pattern: /(?<![0-9])[0-9]{2,}(?![0-9])/g,
                message: 'Magic number detected - consider using a named constant',
                severity: 'info',
                exceptions: [0, 1, 100, 1000]
            },
            {
                name: 'consistent-naming',
                patterns: {
                    'camelCase': /^[a-z][a-zA-Z0-9]*$/,
                    'PascalCase': /^[A-Z][a-zA-Z0-9]*$/,
                    'UPPER_SNAKE_CASE': /^[A-Z][A-Z0-9_]*$/
                },
                message: 'Inconsistent naming convention',
                severity: 'warning'
            },
            {
                name: 'function-complexity',
                check: 'complexity',
                maxComplexity: 10,
                message: 'Function complexity exceeds threshold',
                severity: 'warning'
            },
            {
                name: 'no-duplicate-imports',
                check: 'imports',
                message: 'Duplicate import detected',
                severity: 'error'
            }
        ];
    }

    async loadCustomRules(projectId) {
        try {
            // Load from database or config file
            const customRulesPath = path.join(process.cwd(), '.ai-companion', 'rules.json');
            const customRules = await fs.readFile(customRulesPath, 'utf8');
            return JSON.parse(customRules);
        } catch (error) {
            console.log('No custom rules found, using defaults');
            return [];
        }
    }

    async lintFiles(files, customRules = []) {
        const allRules = [...this.defaultRules, ...customRules];
        const issues = {
            errors: [],
            warnings: [],
            info: []
        };

        for (const file of files) {
            const fileIssues = await this.lintFile(file, allRules);
            this.categorizeIssuesBySeverity(fileIssues, issues);
        }

        return {
            issues,
            summary: this.generateLintingSummary(issues),
            total: Object.values(issues).flat().length
        };
    }

    async lintFile(file, rules) {
        const issues = [];
        const content = file.patch || '';
        const lines = content.split('\n');
        const extension = path.extname(file.filename);

        for (const rule of rules) {
            // Skip if rule doesn't apply to this file type
            if (rule.fileTypes && !rule.fileTypes.includes(extension)) {
                continue;
            }

            if (rule.pattern) {
                // Pattern-based rules
                const matches = content.matchAll(rule.pattern);
                for (const match of matches) {
                    if (rule.exceptions && rule.exceptions.includes(parseInt(match[0]))) {
                        continue;
                    }

                    const lineNumber = this.getLineNumber(lines, match.index);
                    issues.push({
                        rule: rule.name,
                        severity: rule.severity,
                        message: rule.message,
                        file: file.filename,
                        line: lineNumber,
                        column: this.getColumnNumber(lines[lineNumber - 1], match.index)
                    });
                }
            } else if (rule.check === 'lineLength') {
                // Line length check
                lines.forEach((line, index) => {
                    if (line.length > rule.maxLength) {
                        issues.push({
                            rule: rule.name,
                            severity: rule.severity,
                            message: `${rule.message} (${line.length} chars)`,
                            file: file.filename,
                            line: index + 1
                        });
                    }
                });
            } else if (rule.check === 'complexity') {
                // Cyclomatic complexity check
                const complexity = this.calculateComplexity(content);
                if (complexity > rule.maxComplexity) {
                    issues.push({
                        rule: rule.name,
                        severity: rule.severity,
                        message: `${rule.message} (complexity: ${complexity})`,
                        file: file.filename
                    });
                }
            } else if (rule.check === 'imports') {
                // Check for duplicate imports
                const imports = this.extractImports(content);
                const duplicates = this.findDuplicates(imports);
                duplicates.forEach(dup => {
                    issues.push({
                        rule: rule.name,
                        severity: rule.severity,
                        message: `${rule.message}: ${dup}`,
                        file: file.filename
                    });
                });
            }
        }

        // Custom checks
        issues.push(...this.performCustomChecks(file, content));

        return issues;
    }

    performCustomChecks(file, content) {
        const issues = [];

        // Check for async without await
        const asyncPattern = /async\s+(?:function|\([^)]*\)\s*=>|\w+\s*\([^)]*\))\s*{[^}]*}/g;
        const asyncMatches = content.matchAll(asyncPattern);
        for (const match of asyncMatches) {
            if (!match[0].includes('await')) {
                issues.push({
                    rule: 'async-without-await',
                    severity: 'warning',
                    message: 'Async function without await',
                    file: file.filename
                });
            }
        }

        // Check for unused variables (simple check)
        const varPattern = /(?:const|let|var)\s+(\w+)\s*=/g;
        const varMatches = content.matchAll(varPattern);
        for (const match of varMatches) {
            const varName = match[1];
            const usagePattern = new RegExp(`\\b${varName}\\b`, 'g');
            const usages = (content.match(usagePattern) || []).length;
            if (usages === 1) { // Only the declaration
                issues.push({
                    rule: 'unused-variable',
                    severity: 'warning',
                    message: `Unused variable: ${varName}`,
                    file: file.filename
                });
            }
        }

        // Check for error handling
        if (/\.catch\s*\(\s*\)/.test(content) || /catch\s*\([^)]*\)\s*{\s*}/.test(content)) {
            issues.push({
                rule: 'empty-catch',
                severity: 'error',
                message: 'Empty catch block - handle or log errors properly',
                file: file.filename
            });
        }

        return issues;
    }

    calculateComplexity(code) {
        // Simplified cyclomatic complexity calculation
        const patterns = [
            /if\s*\(/g,
            /else\s+if\s*\(/g,
            /for\s*\(/g,
            /while\s*\(/g,
            /case\s+/g,
            /catch\s*\(/g,
            /\?\s*[^:]+\s*:/g, // ternary operator
            /&&/g,
            /\|\|/g
        ];

        let complexity = 1; // Base complexity
        patterns.forEach(pattern => {
            const matches = code.match(pattern);
            if (matches) {
                complexity += matches.length;
            }
        });

        return complexity;
    }

    extractImports(content) {
        const imports = [];
        const importPattern = /import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g;
        const matches = content.matchAll(importPattern);
        for (const match of matches) {
            imports.push(match[1]);
        }
        return imports;
    }

    findDuplicates(arr) {
        const seen = new Set();
        const duplicates = new Set();
        arr.forEach(item => {
            if (seen.has(item)) {
                duplicates.add(item);
            }
            seen.add(item);
        });
        return Array.from(duplicates);
    }

    getLineNumber(lines, charIndex) {
        let currentIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            currentIndex += lines[i].length + 1;
            if (currentIndex > charIndex) {
                return i + 1;
            }
        }
        return 1;
    }

    getColumnNumber(line, charIndex) {
        if (!line) return 0;
        return charIndex % (line.length + 1);
    }

    categorizeIssuesBySeverity(fileIssues, issues) {
        fileIssues.forEach(issue => {
            if (issue.severity === 'error') {
                issues.errors.push(issue);
            } else if (issue.severity === 'warning') {
                issues.warnings.push(issue);
            } else {
                issues.info.push(issue);
            }
        });
    }

    generateLintingSummary(issues) {
        const total = Object.values(issues).flat().length;

        if (total === 0) {
            return '✅ No linting issues found';
        }

        let summary = `📝 Custom Linting Results:\n`;

        if (issues.errors.length > 0) {
            summary += `\n❌ **Errors (${issues.errors.length})**: Must be fixed\n`;
            issues.errors.slice(0, 3).forEach(issue => {
                summary += `  - ${issue.rule}: ${issue.message} in ${issue.file}\n`;
            });
        }

        if (issues.warnings.length > 0) {
            summary += `\n⚠️ **Warnings (${issues.warnings.length})**: Should be addressed\n`;
            issues.warnings.slice(0, 3).forEach(issue => {
                summary += `  - ${issue.rule}: ${issue.message} in ${issue.file}\n`;
            });
        }

        if (issues.info.length > 0) {
            summary += `\nℹ️ **Info (${issues.info.length})**: Suggestions for improvement\n`;
        }

        return summary;
    }
}

module.exports = new CustomLinterService();