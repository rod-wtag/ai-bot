const { Project, CustomRule } = require('../models');

class ProjectController {
  async createProject(req, res) {
    try {
      const { name, repository, owner, reviewLevel, customRules } = req.body;

      const project = await Project.create({
        name,
        repository,
        owner,
        review_level: reviewLevel || 'standard',
        custom_rules: customRules || []
      });

      res.status(201).json({
        success: true,
        project
      });

    } catch (error) {
      console.error('Create project error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async updateProject(req, res) {
    try {
      const { projectId } = req.params;
      const updates = req.body;

      const project = await Project.findByPk(projectId);
      
      if (!project) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        });
      }

      await project.update(updates);

      res.json({
        success: true,
        project
      });

    } catch (error) {
      console.error('Update project error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getProject(req, res) {
    try {
      const { projectId } = req.params;

      const project = await Project.findByPk(projectId, {
        include: [CustomRule]
      });

      if (!project) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        });
      }

      res.json({
        success: true,
        project
      });

    } catch (error) {
      console.error('Get project error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async listProjects(req, res) {
    try {
      const projects = await Project.findAll({
        order: [['created_at', 'DESC']]
      });

      res.json({
        success: true,
        projects
      });

    } catch (error) {
      console.error('List projects error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async addCustomRule(req, res) {
    try {
      const { projectId } = req.params;
      const { ruleName, ruleType, pattern, message, severity } = req.body;

      const rule = await CustomRule.create({
        project_id: projectId,
        rule_name: ruleName,
        rule_type: ruleType,
        pattern,
        message,
        severity
      });

      res.status(201).json({
        success: true,
        rule
      });

    } catch (error) {
      console.error('Add custom rule error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async updateCustomRule(req, res) {
    try {
      const { ruleId } = req.params;
      const updates = req.body;

      const rule = await CustomRule.findByPk(ruleId);
      
      if (!rule) {
        return res.status(404).json({
          success: false,
          error: 'Rule not found'
        });
      }

      await rule.update(updates);

      res.json({
        success: true,
        rule
      });

    } catch (error) {
      console.error('Update custom rule error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async deleteCustomRule(req, res) {
    try {
      const { ruleId } = req.params;

      const rule = await CustomRule.findByPk(ruleId);
      
      if (!rule) {
        return res.status(404).json({
          success: false,
          error: 'Rule not found'
        });
      }

      await rule.destroy();

      res.json({
        success: true,
        message: 'Rule deleted successfully'
      });

    } catch (error) {
      console.error('Delete custom rule error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new ProjectController();