const { EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

async function nukeMessages(interaction) {
  const amount = interaction.options.getInteger("amount", true);
  const targetUser = interaction.options.getUser("user");

  // Check bot permissions
  if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
    const embed = new EmbedBuilder()
      .setDescription("❌ I don't have permission to manage messages in this channel!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  try {
    // Defer reply as ephemeral first
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let totalDeleted = 0;
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

    // Fetch all messages at once (up to amount specified)
    const fetchAmount = Math.min(amount, 1000); // Discord limit is 1000
    const messages = await interaction.channel.messages.fetch({ limit: fetchAmount });

    let messagesToDelete = messages;

    // Filter by user if specified
    if (targetUser) {
      messagesToDelete = messagesToDelete.filter((msg) => msg.author.id === targetUser.id);
    }

    // Filter out messages older than 14 days (Discord API limitation)
    messagesToDelete = messagesToDelete.filter((msg) => msg.createdTimestamp > twoWeeksAgo);

    if (messagesToDelete.size === 0) {
      const embed = new EmbedBuilder()
        .setDescription("❌ No messages found to nuke (messages must be less than 14 days old)!")
        .setColor(0xED4245);
      return interaction.editReply({ embeds: [embed] });
    }

    // Delete in batches of 100 (Discord limit) without delays for speed
    const messageArray = Array.from(messagesToDelete.values());
    for (let i = 0; i < messageArray.length; i += 100) {
      const batch = messageArray.slice(i, i + 100);
      const deleted = await interaction.channel.bulkDelete(batch, true);
      totalDeleted += deleted.size;
    }

    // Delete the ephemeral reply
    await interaction.deleteReply().catch(() => {});

    // Send public nuke embed with GIF
    const nukeEmbed = new EmbedBuilder()
      .setTitle("Channel Cleared")
      .setDescription(`Cleared by ${interaction.user}\n\n**${totalDeleted} message${totalDeleted !== 1 ? "s" : ""} deleted**${targetUser ? `\nTarget: ${targetUser}` : ""}`)
      .setColor(0xFF4500)
      .setFooter({ text: totalDeleted < amount ? `Stopped at ${totalDeleted} messages` : "Clear complete" })
      .setTimestamp();

    await interaction.channel.send({ embeds: [nukeEmbed] });
  } catch (error) {
    console.error("Error purging messages:", error);
    const embed = new EmbedBuilder()
      .setDescription("❌ Failed to purge messages. Make sure they're less than 14 days old!")
      .setColor(0xED4245);

    if (interaction.deferred) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
}

// Timeout (mute) a user
async function timeoutUser(interaction) {
  const targetUser = interaction.options.getUser("user", true);
  const duration = interaction.options.getInteger("duration", true); // in minutes
  const reason = interaction.options.getString("reason") || "No reason provided";

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  if (!member) {
    const embed = new EmbedBuilder()
      .setDescription("❌ User not found in this server!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Check if target is moderatable
  if (!member.moderatable) {
    const embed = new EmbedBuilder()
      .setDescription("❌ I cannot timeout this user! They may have a higher role than me.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Prevent self-timeout
  if (targetUser.id === interaction.user.id) {
    const embed = new EmbedBuilder()
      .setDescription("❌ You cannot timeout yourself!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  try {
    const durationMs = duration * 60 * 1000;
    await member.timeout(durationMs, reason);

    // Try to DM the user
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle("You Have Been Timed Out")
        .setDescription(`You have been timed out in **${interaction.guild.name}**`)
        .addFields(
          { name: "Duration", value: formatDuration(durationMs), inline: true },
          { name: "Moderator", value: interaction.user.tag, inline: true },
          { name: "Reason", value: reason, inline: false }
        )
        .setColor(0xFEE75C)
        .setTimestamp();

      await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch (error) {
      // Ignore DM errors
    }

    const embed = new EmbedBuilder()
      .setTitle("User Timed Out")
      .addFields(
        { name: "User", value: `${targetUser} (${targetUser.tag})`, inline: true },
        { name: "Duration", value: formatDuration(durationMs), inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true },
        { name: "Reason", value: reason, inline: false }
      )
      .setColor(0xFEE75C)
      .setFooter({ text: `User ID: ${targetUser.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error timing out user:", error);
    const embed = new EmbedBuilder()
      .setDescription("❌ Failed to timeout user!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// Remove timeout from a user
async function untimeoutUser(interaction) {
  const targetUser = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") || "No reason provided";

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  if (!member) {
    const embed = new EmbedBuilder()
      .setDescription("❌ User not found in this server!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (!member.communicationDisabledUntilTimestamp) {
    const embed = new EmbedBuilder()
      .setDescription("❌ This user is not timed out!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  try {
    await member.timeout(null, reason);

    const embed = new EmbedBuilder()
      .setTitle("Timeout Removed")
      .addFields(
        { name: "User", value: `${targetUser} (${targetUser.tag})`, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        { name: "Reason", value: reason, inline: false }
      )
      .setColor(0x57F287)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error removing timeout:", error);
    const embed = new EmbedBuilder()
      .setDescription("❌ Failed to remove timeout!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// Kick a user
async function kickUser(interaction) {
  const targetUser = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") || "No reason provided";

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  if (!member) {
    const embed = new EmbedBuilder()
      .setDescription("❌ User not found in this server!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (!member.kickable) {
    const embed = new EmbedBuilder()
      .setDescription("❌ I cannot kick this user! They may have a higher role than me.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (targetUser.id === interaction.user.id) {
    const embed = new EmbedBuilder()
      .setDescription("❌ You cannot kick yourself!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  try {
    // Try to DM before kicking
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle("You Have Been Kicked")
        .setDescription(`You have been kicked from **${interaction.guild.name}**`)
        .addFields(
          { name: "Moderator", value: interaction.user.tag, inline: true },
          { name: "Reason", value: reason, inline: false }
        )
        .setColor(0xF26522)
        .setTimestamp();

      await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch (error) {
      // Ignore DM errors
    }

    await member.kick(reason);

    const embed = new EmbedBuilder()
      .setTitle("User Kicked")
      .addFields(
        { name: "User", value: `${targetUser} (${targetUser.tag})`, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        { name: "Reason", value: reason, inline: false }
      )
      .setColor(0xF26522)
      .setFooter({ text: `User ID: ${targetUser.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error kicking user:", error);
    const embed = new EmbedBuilder()
      .setDescription("❌ Failed to kick user!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// Ban a user (hard ban - deletes messages)
async function banUser(interaction) {
  const targetUser = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") || "No reason provided";
  const deleteMessages = interaction.options.getInteger("delete_days") || 1; // Days of messages to delete

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  // Check if already banned
  const existingBan = await interaction.guild.bans.fetch(targetUser.id).catch(() => null);
  if (existingBan) {
    const embed = new EmbedBuilder()
      .setDescription("❌ This user is already banned!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (member && !member.bannable) {
    const embed = new EmbedBuilder()
      .setDescription("❌ I cannot ban this user! They may have a higher role than me.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (targetUser.id === interaction.user.id) {
    const embed = new EmbedBuilder()
      .setDescription("❌ You cannot ban yourself!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  try {
    // Try to DM before banning
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle("You Have Been Banned")
        .setDescription(`You have been permanently banned from **${interaction.guild.name}**`)
        .addFields(
          { name: "Moderator", value: interaction.user.tag, inline: true },
          { name: "Reason", value: reason, inline: false }
        )
        .setColor(0xED4245)
        .setTimestamp();

      await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch (error) {
      // Ignore DM errors
    }

    await interaction.guild.bans.create(targetUser.id, {
      reason: reason,
      deleteMessageSeconds: deleteMessages * 86400 // Convert days to seconds
    });

    const embed = new EmbedBuilder()
      .setTitle("User Banned")
      .addFields(
        { name: "User", value: `${targetUser} (${targetUser.tag})`, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true },
        { name: "Messages Deleted", value: `${deleteMessages} day${deleteMessages !== 1 ? 's' : ''}`, inline: true },
        { name: "Reason", value: reason, inline: false }
      )
      .setColor(0xED4245)
      .setFooter({ text: `User ID: ${targetUser.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error banning user:", error);
    const embed = new EmbedBuilder()
      .setDescription("❌ Failed to ban user!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// Soft ban (ban + unban to delete messages and kick)
async function softbanUser(interaction) {
  const targetUser = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") || "No reason provided";
  const deleteMessages = interaction.options.getInteger("delete_days") || 7; // Days of messages to delete

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  if (member && !member.bannable) {
    const embed = new EmbedBuilder()
      .setDescription("❌ I cannot soft ban this user! They may have a higher role than me.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (targetUser.id === interaction.user.id) {
    const embed = new EmbedBuilder()
      .setDescription("❌ You cannot soft ban yourself!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  try {
    // Try to DM before soft banning
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle("You Have Been Soft Banned")
        .setDescription(
          `You have been soft banned from **${interaction.guild.name}**\n\n` +
          `This means you were kicked and your recent messages were deleted. You can rejoin using an invite link.`
        )
        .addFields(
          { name: "Moderator", value: interaction.user.tag, inline: true },
          { name: "Messages Deleted", value: `${deleteMessages} day${deleteMessages !== 1 ? 's' : ''}`, inline: true },
          { name: "Reason", value: reason, inline: false }
        )
        .setColor(0xF26522)
        .setTimestamp();

      await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch (error) {
      // Ignore DM errors
    }

    // Ban to delete messages
    await interaction.guild.bans.create(targetUser.id, {
      reason: `Soft ban: ${reason}`,
      deleteMessageSeconds: deleteMessages * 86400
    });

    // Immediately unban
    await interaction.guild.bans.remove(targetUser.id, `Soft ban unban: ${reason}`);

    const embed = new EmbedBuilder()
      .setTitle("User Soft Banned")
      .setDescription(`User was kicked and their messages were deleted. They can rejoin with an invite link.`)
      .addFields(
        { name: "User", value: `${targetUser} (${targetUser.tag})`, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true },
        { name: "Messages Deleted", value: `${deleteMessages} day${deleteMessages !== 1 ? 's' : ''}`, inline: true },
        { name: "Reason", value: reason, inline: false }
      )
      .setColor(0xF26522)
      .setFooter({ text: `User ID: ${targetUser.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error soft banning user:", error);
    const embed = new EmbedBuilder()
      .setDescription("❌ Failed to soft ban user!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// Unban a user
async function unbanUser(interaction) {
  const userId = interaction.options.getString("user_id", true);
  const reason = interaction.options.getString("reason") || "No reason provided";

  try {
    // Check if user is banned
    const bannedUser = await interaction.guild.bans.fetch(userId).catch(() => null);

    if (!bannedUser) {
      const embed = new EmbedBuilder()
        .setDescription("❌ This user is not banned!")
        .setColor(0xED4245);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    await interaction.guild.bans.remove(userId, reason);

    const embed = new EmbedBuilder()
      .setTitle("User Unbanned")
      .addFields(
        { name: "User", value: `${bannedUser.user.tag}`, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        { name: "Reason", value: reason, inline: false }
      )
      .setColor(0x57F287)
      .setFooter({ text: `User ID: ${userId}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error unbanning user:", error);
    const embed = new EmbedBuilder()
      .setDescription("❌ Failed to unban user! Make sure the User ID is correct.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// Helper function to format duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days !== 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

module.exports = {
  nukeMessages,
  timeoutUser,
  untimeoutUser,
  kickUser,
  banUser,
  softbanUser,
  unbanUser,
};
