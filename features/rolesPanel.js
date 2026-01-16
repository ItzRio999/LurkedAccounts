const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { saveJson, addLogo } = require("../utils/fileManager");

// Default roles panel configuration
const DEFAULT_ROLES_PANEL = {
  title: "Role Selection",
  description: "Click the buttons below to toggle notification roles.",
  color: 0x5865F2,
  footer: "Click to toggle roles on/off",
  thumbnail: null,
  image: null,
  roles: [
    {
      id: "announcements",
      label: "Announcements",
      emoji: "📢",
      style: "Primary",
      role_id: null, // Set by admin
      description: "Server announcements"
    },
    {
      id: "drops",
      label: "Account Drops",
      emoji: "🎁",
      style: "Success",
      role_id: null,
      description: "Account drop notifications"
    },
    {
      id: "movies",
      label: "Movie Nights",
      emoji: "🎬",
      style: "Secondary",
      role_id: null,
      description: "Movie night pings"
    }
  ]
};

// Get roles panel config or create default
function getRolesPanelConfig(config) {
  if (!config.roles_panel) {
    config.roles_panel = DEFAULT_ROLES_PANEL;
  }
  return config.roles_panel;
}

// Create roles panel embed
async function createRolesPanel(interaction, config, configPath) {
  const panel = getRolesPanelConfig(config);
  saveJson(configPath, config);

  // Filter out roles that don't have role_id set
  const validRoles = panel.roles.filter(r => r.role_id);

  if (validRoles.length === 0) {
    const embed = new EmbedBuilder()
      .setDescription("❌ No roles configured! Use `/rolespanel configure` to set up roles first.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const embed = new EmbedBuilder()
    .setTitle(panel.title)
    .setDescription(panel.description)
    .setColor(panel.color)
    .setFooter({ text: panel.footer })
    .setTimestamp();

  if (panel.thumbnail) embed.setThumbnail(panel.thumbnail);
  if (panel.image) embed.setImage(panel.image);
  addLogo(embed, config);

  // Create button rows (max 5 buttons per row)
  const buttons = validRoles.map(r =>
    new ButtonBuilder()
      .setCustomId(`role_${r.id}`)
      .setLabel(r.label)
      .setStyle(ButtonStyle[r.style])
      .setEmoji(r.emoji)
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  await interaction.channel.send({ embeds: [embed], components: rows });

  const successEmbed = new EmbedBuilder()
    .setDescription("✅ Roles panel created successfully!")
    .setColor(0x57F287);

  await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
}

// Handle role button click
async function handleRoleButton(interaction, roleId, config) {
  const panel = getRolesPanelConfig(config);
  const roleConfig = panel.roles.find(r => r.id === roleId);

  if (!roleConfig || !roleConfig.role_id) {
    const embed = new EmbedBuilder()
      .setDescription("❌ This role is not configured!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const role = interaction.guild.roles.cache.get(roleConfig.role_id);

  if (!role) {
    const embed = new EmbedBuilder()
      .setDescription("❌ Role not found! Please contact an admin.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const member = interaction.member;
  const hasRole = member.roles.cache.has(role.id);

  try {
    if (hasRole) {
      await member.roles.remove(role);
      const embed = new EmbedBuilder()
        .setDescription(`Removed ${role}`)
        .setColor(0xED4245);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } else {
      await member.roles.add(role);
      const embed = new EmbedBuilder()
        .setDescription(`Added ${role}`)
        .setColor(0x57F287);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    console.error("Error toggling role:", error);
    const embed = new EmbedBuilder()
      .setDescription("❌ Failed to toggle role. Make sure the bot has proper permissions.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

module.exports = {
  createRolesPanel,
  handleRoleButton,
  getRolesPanelConfig,
  DEFAULT_ROLES_PANEL,
};
