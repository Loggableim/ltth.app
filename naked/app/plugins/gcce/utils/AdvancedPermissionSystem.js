/**
 * Advanced Permission System
 * V1: Custom roles with inheritance and fine-grained permissions
 */

class AdvancedPermissionSystem {
  constructor() {
    // Custom roles
    // Map<roleName, RoleDefinition>
    this.customRoles = new Map();
    
    // User role assignments
    // Map<userId, Set<roleName>>
    this.userRoles = new Map();
    
    // Role inheritance
    // Map<roleName, Set<parentRoleName>>
    this.roleInheritance = new Map();
    
    // Permission overrides (per user, per command)
    // Map<userId:commandName, boolean>
    this.permissionOverrides = new Map();
  }

  /**
   * Define a custom role
   * @param {Object} roleDef - Role definition
   * @returns {boolean} Success status
   */
  defineRole(roleDef) {
    try {
      const role = {
        name: roleDef.name.toLowerCase(),
        displayName: roleDef.displayName || roleDef.name,
        permissions: roleDef.permissions || [], // Array of permission strings
        inherits: roleDef.inherits || [], // Array of parent role names
        priority: roleDef.priority || 0, // Higher = more permissions
        description: roleDef.description || '',
        createdAt: Date.now()
      };

      this.customRoles.set(role.name, role);

      // Set up inheritance
      if (role.inherits.length > 0) {
        this.roleInheritance.set(role.name, new Set(role.inherits));
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Assign role to user
   * @param {string} userId - User ID
   * @param {string} roleName - Role name
   * @returns {boolean} Success status
   */
  assignRole(userId, roleName) {
    roleName = roleName.toLowerCase();
    
    if (!this.customRoles.has(roleName)) {
      return false;
    }

    if (!this.userRoles.has(userId)) {
      this.userRoles.set(userId, new Set());
    }

    this.userRoles.get(userId).add(roleName);
    return true;
  }

  /**
   * Remove role from user
   * @param {string} userId - User ID
   * @param {string} roleName - Role name
   * @returns {boolean} Success status
   */
  removeRole(userId, roleName) {
    roleName = roleName.toLowerCase();
    
    const roles = this.userRoles.get(userId);
    if (!roles) return false;

    return roles.delete(roleName);
  }

  /**
   * Check if user has permission for command
   * @param {string} userId - User ID
   * @param {string} permission - Required permission
   * @param {string} commandName - Command name (for overrides)
   * @returns {boolean} True if has permission
   */
  hasPermission(userId, permission, commandName = null) {
    // Check permission override first
    if (commandName) {
      const overrideKey = `${userId}:${commandName}`;
      const override = this.permissionOverrides.get(overrideKey);
      if (override !== undefined) {
        return override;
      }
    }

    // Get user's roles
    const userRoleNames = this.userRoles.get(userId);
    if (!userRoleNames || userRoleNames.size === 0) {
      return false;
    }

    // Get all inherited roles
    const allRoles = new Set();
    for (const roleName of userRoleNames) {
      this.collectInheritedRoles(roleName, allRoles);
    }

    // Check if any role grants the permission
    for (const roleName of allRoles) {
      const role = this.customRoles.get(roleName);
      if (role && this.roleHasPermission(role, permission)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Collect all inherited roles
   * @param {string} roleName - Starting role
   * @param {Set} collected - Set to collect into
   */
  collectInheritedRoles(roleName, collected) {
    if (collected.has(roleName)) return;
    collected.add(roleName);

    const parents = this.roleInheritance.get(roleName);
    if (parents) {
      for (const parent of parents) {
        this.collectInheritedRoles(parent, collected);
      }
    }
  }

  /**
   * Check if role has specific permission
   * @param {Object} role - Role object
   * @param {string} permission - Permission to check
   * @returns {boolean} True if has permission
   */
  roleHasPermission(role, permission) {
    // Support wildcard permissions
    if (role.permissions.includes('*')) return true;
    if (role.permissions.includes(permission)) return true;

    // Support prefix wildcards (e.g., "command.*")
    for (const perm of role.permissions) {
      if (perm.endsWith('*')) {
        const prefix = perm.slice(0, -1);
        if (permission.startsWith(prefix)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Set permission override for user on specific command
   * @param {string} userId - User ID
   * @param {string} commandName - Command name
   * @param {boolean} allowed - Allow or deny
   */
  setPermissionOverride(userId, commandName, allowed) {
    const key = `${userId}:${commandName}`;
    this.permissionOverrides.set(key, allowed);
  }

  /**
   * Remove permission override
   * @param {string} userId - User ID
   * @param {string} commandName - Command name
   */
  removePermissionOverride(userId, commandName) {
    const key = `${userId}:${commandName}`;
    this.permissionOverrides.delete(key);
  }

  /**
   * Get user's roles
   * @param {string} userId - User ID
   * @returns {Array} Array of role names
   */
  getUserRoles(userId) {
    const roles = this.userRoles.get(userId);
    return roles ? Array.from(roles) : [];
  }

  /**
   * Get all custom roles
   * @returns {Array} Array of role definitions
   */
  getAllRoles() {
    return Array.from(this.customRoles.values());
  }

  /**
   * Get role definition
   * @param {string} roleName - Role name
   * @returns {Object|null} Role definition or null
   */
  getRole(roleName) {
    return this.customRoles.get(roleName.toLowerCase()) || null;
  }

  /**
   * Delete custom role
   * @param {string} roleName - Role name
   * @returns {boolean} True if deleted
   */
  deleteRole(roleName) {
    roleName = roleName.toLowerCase();
    
    // Remove from all users
    for (const roles of this.userRoles.values()) {
      roles.delete(roleName);
    }

    // Remove inheritance
    this.roleInheritance.delete(roleName);

    // Remove role
    return this.customRoles.delete(roleName);
  }

  /**
   * Get statistics
   * @returns {Object} Permission stats
   */
  getStats() {
    return {
      customRoles: this.customRoles.size,
      usersWithRoles: this.userRoles.size,
      permissionOverrides: this.permissionOverrides.size
    };
  }

  /**
   * Clear all custom roles and assignments
   */
  clear() {
    this.customRoles.clear();
    this.userRoles.clear();
    this.roleInheritance.clear();
    this.permissionOverrides.clear();
  }
}

module.exports = AdvancedPermissionSystem;
