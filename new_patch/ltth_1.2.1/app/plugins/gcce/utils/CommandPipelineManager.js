/**
 * Command Pipeline System
 * F9: Allows chaining commands with data flow between them
 * Example: /fetch data | /transform | /display
 */

class CommandPipelineManager {
  constructor(commandParser) {
    this.commandParser = commandParser;
    
    // Map<pipelineId, PipelineDefinition>
    this.pipelines = new Map();
    
    // Pipeline separator
    this.separator = '|';
    
    // Statistics
    this.stats = {
      totalPipelines: 0,
      totalExecutions: 0,
      totalFailed: 0
    };
  }

  /**
   * Register a pipeline
   * @param {Object} pipelineDef - Pipeline definition
   * @returns {boolean} Success status
   */
  registerPipeline(pipelineDef) {
    try {
      const pipeline = {
        id: pipelineDef.id.toLowerCase(),
        name: pipelineDef.name,
        description: pipelineDef.description || '',
        stages: pipelineDef.stages, // Array of command names
        stopOnError: pipelineDef.stopOnError !== undefined ? pipelineDef.stopOnError : true,
        dataFlow: pipelineDef.dataFlow !== undefined ? pipelineDef.dataFlow : true,
        timeout: pipelineDef.timeout || 30000, // 30 seconds default
        createdAt: Date.now()
      };

      this.pipelines.set(pipeline.id, pipeline);
      this.stats.totalPipelines++;

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Execute a pipeline
   * @param {string} pipelineId - Pipeline ID or raw pipeline string
   * @param {Object} context - Execution context
   * @param {*} initialData - Initial data for first stage
   * @returns {Promise<Object>} Execution result
   */
  async executePipeline(pipelineId, context, initialData = null) {
    let pipeline;
    let stages;

    // Check if it's a registered pipeline or raw string
    if (this.pipelines.has(pipelineId.toLowerCase())) {
      pipeline = this.pipelines.get(pipelineId.toLowerCase());
      stages = pipeline.stages;
    } else {
      // Parse inline pipeline
      stages = this.parsePipelineString(pipelineId);
      if (stages.length === 0) {
        return {
          success: false,
          error: 'Invalid pipeline format'
        };
      }
      
      pipeline = {
        stopOnError: true,
        dataFlow: true,
        timeout: 30000
      };
    }

    this.stats.totalExecutions++;

    const results = [];
    let currentData = initialData;
    let allSuccess = true;

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      
      try {
        // Build command with data if dataFlow enabled
        let command = stage.trim();
        
        if (pipeline.dataFlow && currentData !== null) {
          // Append data as argument
          command += ` ${JSON.stringify(currentData)}`;
        }

        // Execute stage with timeout
        const stagePromise = this.commandParser.parse(command, context);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Stage timeout')), pipeline.timeout)
        );

        const result = await Promise.race([stagePromise, timeoutPromise]);
        
        results.push({
          stage: i + 1,
          command: stage,
          ...result
        });

        if (!result.success && pipeline.stopOnError) {
          allSuccess = false;
          break;
        }

        // Pass result data to next stage if dataFlow enabled
        if (pipeline.dataFlow && result.data) {
          currentData = result.data;
        }

      } catch (error) {
        results.push({
          stage: i + 1,
          command: stage,
          success: false,
          error: error.message
        });

        if (pipeline.stopOnError) {
          allSuccess = false;
          break;
        }
      }
    }

    if (!allSuccess) {
      this.stats.totalFailed++;
    }

    return {
      success: allSuccess,
      pipelineId: pipelineId,
      results,
      totalStages: stages.length,
      executedStages: results.length,
      finalData: currentData
    };
  }

  /**
   * Parse a pipeline string into stages
   * @param {string} pipelineString - Pipeline string
   * @returns {Array} Array of command strings
   */
  parsePipelineString(pipelineString) {
    return pipelineString
      .split(this.separator)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Check if a command contains a pipeline
   * @param {string} command - Command string
   * @returns {boolean} True if contains pipeline separator
   */
  isPipeline(command) {
    return command.includes(this.separator);
  }

  /**
   * Get pipeline by ID
   * @param {string} pipelineId - Pipeline ID
   * @returns {Object|null} Pipeline or null
   */
  getPipeline(pipelineId) {
    return this.pipelines.get(pipelineId.toLowerCase()) || null;
  }

  /**
   * Get all pipelines
   * @returns {Array} Array of pipelines
   */
  getAllPipelines() {
    return Array.from(this.pipelines.values());
  }

  /**
   * Delete pipeline
   * @param {string} pipelineId - Pipeline ID
   * @returns {boolean} True if deleted
   */
  deletePipeline(pipelineId) {
    const result = this.pipelines.delete(pipelineId.toLowerCase());
    if (result) {
      this.stats.totalPipelines--;
    }
    return result;
  }

  /**
   * Set pipeline separator
   * @param {string} separator - New separator
   */
  setSeparator(separator) {
    this.separator = separator;
  }

  /**
   * Get statistics
   * @returns {Object} Pipeline stats
   */
  getStats() {
    return {
      ...this.stats,
      currentPipelines: this.pipelines.size
    };
  }

  /**
   * Clear all pipelines
   */
  clear() {
    this.pipelines.clear();
    this.stats = {
      totalPipelines: 0,
      totalExecutions: 0,
      totalFailed: 0
    };
  }
}

module.exports = CommandPipelineManager;
