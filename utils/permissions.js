function isOwnerOrCoowner(member, config) {
  if (!member || !member.guild) return false;

  // Check if user is in the whitelist (for cross-server permissions)
  // Convert both to strings for comparison since Discord IDs are strings
  const whitelist = new Set((config.owner_user_ids || []).map(id => String(id)));
  const memberIdStr = String(member.id);

  if (whitelist.has(memberIdStr)) return true;

  // Check if user is the Discord server owner
  if (member.guild.ownerId === member.id) return true;

  const roleIds = new Set(member.roles.cache.map((r) => r.id));
  const ownerRoles = new Set(config.owner_role_ids || []);
  const coownerRoles = new Set(config.coowner_role_ids || []);

  for (const id of ownerRoles) {
    if (roleIds.has(id)) return true;
  }
  for (const id of coownerRoles) {
    if (roleIds.has(id)) return true;
  }
  return false;
}

function hasStaffRole(member, config) {
  if (!member) return false;
  const roleIds = new Set(member.roles.cache.map((r) => r.id));
  for (const id of config.staff_role_ids || []) {
    if (roleIds.has(id)) return true;
  }
  return false;
}

function mention(userId) {
  return `<@${userId}>`;
}

module.exports = {
  isOwnerOrCoowner,
  hasStaffRole,
  mention,
};
