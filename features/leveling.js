const { EmbedBuilder, MessageFlags } = require("discord.js");
const { saveJson, addLogo } = require("../utils/fileManager");
const { mention } = require("../utils/permissions");

function getLevel(xp) {
  return Math.floor(0.1 * Math.sqrt(xp));
}

function getXpForLevel(level) {
  return Math.pow(level / 0.1, 2);
}

function addXp(userId, data, dataPath, amount = 15) {
  const userIdStr = String(userId);
  if (!data.levels[userIdStr]) {
    data.levels[userIdStr] = { xp: 0, level: 0, last_message: 0 };
  }

  const now = Date.now();
  if (now - data.levels[userIdStr].last_message < 60000) return null;

  data.levels[userIdStr].last_message = now;
  data.levels[userIdStr].xp += amount;

  const oldLevel = data.levels[userIdStr].level;
  const newLevel = getLevel(data.levels[userIdStr].xp);

  if (newLevel > oldLevel) {
    data.levels[userIdStr].level = newLevel;
    saveJson(dataPath, data);
    return { leveledUp: true, newLevel };
  }

  saveJson(dataPath, data);
  return { leveledUp: false };
}

function getLeaderboard(data, limit = 10) {
  return Object.entries(data.levels || {})
    .map(([userId, stats]) => ({ userId, ...stats }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

// Get level-appropriate GIF based on milestone
function getLevelUpGif(level) {
  // Legendary levels (100+)
  if (level >= 100) {
    return "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif"; // Epic legendary celebration
  }
  // Master levels (75-99)
  if (level >= 75) {
    return "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif"; // Master achievement
  }
  // Expert levels (50-74)
  if (level >= 50) {
    return "https://media.giphy.com/media/3oz8xAFtqoOUUrsh7W/giphy.gif"; // Expert celebration
  }
  // Advanced levels (25-49)
  if (level >= 25) {
    return "https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif"; // Advanced congrats
  }
  // Intermediate levels (10-24)
  if (level >= 10) {
    return "https://media.giphy.com/media/g9582DNuQppxC/giphy.gif"; // Nice job
  }
  // Beginner levels (1-9)
  return "https://media.giphy.com/media/3o6ZsZdNs3yE5l6hWM/giphy.gif"; // Good job
}

// Get level tier name for title
function getLevelTier(level) {
  if (level >= 100) return "🌟 LEGENDARY";
  if (level >= 75) return "👑 MASTER";
  if (level >= 50) return "💎 EXPERT";
  if (level >= 25) return "⭐ ADVANCED";
  if (level >= 10) return "📈 INTERMEDIATE";
  return "🎉 LEVEL UP";
}

async function handleLevelUp(message, newLevel, config, data) {
  const levelChannel = config.level_channel_id
    ? message.guild.channels.cache.get(config.level_channel_id)
    : message.channel;

  if (!levelChannel) return;

  const userIdStr = String(message.author.id);
  const currentXP = data.levels[userIdStr]?.xp || 0;
  const nextLevel = newLevel + 1;
  const xpForNext = getXpForLevel(nextLevel);
  const xpNeeded = Math.floor(xpForNext - currentXP);

  const levelTier = getLevelTier(newLevel);
  const levelGif = getLevelUpGif(newLevel);

  const embed = addLogo(
    new EmbedBuilder()
      .setAuthor({
        name: message.author.tag,
        iconURL: message.author.displayAvatarURL({ dynamic: true, size: 256 }),
      })
      .setTitle(`${levelTier} - Level ${newLevel} Reached!`)
      .setDescription(
        `Amazing work ${mention(message.author.id)}! You've advanced to **Level ${newLevel}**!\n\u200b`
      )
      .addFields(
        { name: "💎 Current XP", value: `${currentXP.toLocaleString()}`, inline: true },
        { name: "📊 Current Level", value: `${newLevel}`, inline: true },
        { name: "🎯 Next Level", value: `${xpNeeded.toLocaleString()} XP`, inline: true }
      )
      .setColor(0x57F287)
      .setImage(levelGif)
      .setFooter({ text: "Keep chatting to earn rewards and climb the ranks!" })
      .setTimestamp(),
    config
  );

  await levelChannel.send({ embeds: [embed] }).catch(console.error);

  // Award level roles
  if (config.level_roles && config.level_roles[newLevel]) {
    const roleId = config.level_roles[newLevel];
    const role = message.guild.roles.cache.get(roleId);
    if (role && message.member && !message.member.roles.cache.has(roleId)) {
      await message.member.roles.add(role).catch(console.error);

      const roleEmbed = addLogo(
        new EmbedBuilder()
          .setTitle("🏆 Role Reward Unlocked!")
          .setDescription(
            `Congratulations ${mention(message.author.id)}!\n\n` +
            `You've earned the ${role} role for reaching **Level ${newLevel}**!`
          )
          .setColor(0xFFD700)
          .setImage("https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif") // Trophy/reward GIF
          .setFooter({ text: "Keep leveling up to unlock more rewards!" })
          .setTimestamp(),
        config
      );

      levelChannel.send({ embeds: [roleEmbed] }).catch(console.error);
    }
  }
}

async function showRank(interaction, user, data, config) {
  const userStats = data.levels[String(user.id)];

  if (!userStats || userStats.xp === 0) {
    const embed = addLogo(
      new EmbedBuilder()
        .setDescription(`${user.tag} hasn't earned any XP yet!`)
        .setColor(0xED4245),
      config
    );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const nextLevel = userStats.level + 1;
  const xpForNext = getXpForLevel(nextLevel);
  const xpNeeded = Math.floor(xpForNext - userStats.xp);
  const xpForCurrent = getXpForLevel(userStats.level);
  const xpProgress = userStats.xp - xpForCurrent;
  const xpRequired = xpForNext - xpForCurrent;
  const percentage = Math.floor((xpProgress / xpRequired) * 100);

  // Get user's rank position
  const leaderboard = getLeaderboard(data, 999);
  const rank = leaderboard.findIndex((entry) => entry.userId === String(user.id)) + 1;

  const progressBar = createProgressBar(percentage, 20);

  const embed = addLogo(
    new EmbedBuilder()
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true, size: 256 }) })
      .setTitle(`📊 Member Ranking & Statistics`)
      .setDescription(`Viewing stats for ${user}\n\u200b`)
      .addFields(
        { name: "🏆 Server Rank", value: `#${rank}`, inline: true },
        { name: "⭐ Current Level", value: `${userStats.level}`, inline: true },
        { name: "✨ Total XP", value: `${userStats.xp.toLocaleString()}`, inline: true },
        {
          name: "📈 Progress to Level " + nextLevel,
          value: `${progressBar}\n${xpProgress.toLocaleString()} / ${xpRequired.toLocaleString()} XP (**${percentage}%** complete)`,
        },
        { name: "🎯 XP Required", value: `${xpNeeded.toLocaleString()} more XP needed`, inline: false }
      )
      .setColor(0x5865F2)
      .setFooter({ text: "Keep engaging with the community to level up!" })
      .setTimestamp(),
    config
  );

  await interaction.reply({ embeds: [embed] });
}

async function showLeaderboard(interaction, data, limit, config) {
  const leaderboard = getLeaderboard(data, limit);

  if (leaderboard.length === 0) {
    const embed = addLogo(
      new EmbedBuilder()
        .setDescription("No one has earned XP yet! Start chatting to be the first on the leaderboard!")
        .setColor(0xED4245),
      config
    );
    return interaction.reply({ embeds: [embed] });
  }

  const medals = ["🥇", "🥈", "🥉"];
  const description = leaderboard
    .map((entry, index) => {
      const medal = medals[index] || `**${index + 1}.**`;
      return `${medal} ${mention(entry.userId)} - Level **${entry.level}** (${entry.xp.toLocaleString()} XP)`;
    })
    .join("\n");

  const embed = addLogo(
    new EmbedBuilder()
      .setTitle("🏆 Community Leaderboard")
      .setDescription(`Top members ranked by activity and engagement\n\u200b\n${description}`)
      .setColor(0xFFD700)
      .setFooter({ text: `Top ${leaderboard.length} Most Active Members • Keep chatting to climb the ranks!` })
      .setTimestamp(),
    config
  );

  await interaction.reply({ embeds: [embed] });
}

function createProgressBar(percentage, length = 20) {
  const filled = Math.floor((percentage / 100) * length);
  const empty = length - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

// ============== LEVEL MANAGEMENT COMMANDS ==============
async function setUserLevel(interaction, data, dataPath, config) {
  const user = interaction.options.getUser("user", true);
  const level = interaction.options.getInteger("level", true);

  const userIdStr = String(user.id);
  if (!data.levels[userIdStr]) {
    data.levels[userIdStr] = { xp: 0, level: 0, last_message: 0 };
  }

  const xpForLevel = getXpForLevel(level);
  data.levels[userIdStr].level = level;
  data.levels[userIdStr].xp = xpForLevel;
  saveJson(dataPath, data);

  const embed = addLogo(
    new EmbedBuilder()
      .setDescription(`✅ Set ${mention(user.id)}'s level to **${level}** (${xpForLevel.toLocaleString()} XP)`)
      .setColor(0x57F287),
    config
  );

  await interaction.reply({ embeds: [embed] });
}

async function addUserXp(interaction, data, dataPath, config) {
  const user = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  const userIdStr = String(user.id);
  if (!data.levels[userIdStr]) {
    data.levels[userIdStr] = { xp: 0, level: 0, last_message: 0 };
  }

  const oldLevel = data.levels[userIdStr].level;
  data.levels[userIdStr].xp += amount;
  const newLevel = getLevel(data.levels[userIdStr].xp);
  data.levels[userIdStr].level = newLevel;
  saveJson(dataPath, data);

  const embed = addLogo(
    new EmbedBuilder()
      .setDescription(
        `✅ Added **${amount.toLocaleString()} XP** to ${mention(user.id)}\n\n` +
        `**New Total:** ${data.levels[userIdStr].xp.toLocaleString()} XP\n` +
        `**Level:** ${oldLevel} → **${newLevel}**` + (newLevel > oldLevel ? " 🎉" : "")
      )
      .setColor(0x57F287),
    config
  );

  await interaction.reply({ embeds: [embed] });
}

async function removeUserXp(interaction, data, dataPath, config) {
  const user = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  const userIdStr = String(user.id);
  if (!data.levels[userIdStr]) {
    const embed = addLogo(
      new EmbedBuilder()
        .setDescription(`❌ ${user.tag} has no XP to remove!`)
        .setColor(0xED4245),
      config
    );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const oldLevel = data.levels[userIdStr].level;
  data.levels[userIdStr].xp = Math.max(0, data.levels[userIdStr].xp - amount);
  const newLevel = getLevel(data.levels[userIdStr].xp);
  data.levels[userIdStr].level = newLevel;
  saveJson(dataPath, data);

  const embed = addLogo(
    new EmbedBuilder()
      .setDescription(
        `✅ Removed **${amount.toLocaleString()} XP** from ${mention(user.id)}\n\n` +
        `**New Total:** ${data.levels[userIdStr].xp.toLocaleString()} XP\n` +
        `**Level:** ${oldLevel} → **${newLevel}**`
      )
      .setColor(0x57F287),
    config
  );

  await interaction.reply({ embeds: [embed] });
}

async function resetUserLevel(interaction, data, dataPath, config) {
  const user = interaction.options.getUser("user", true);
  const userIdStr = String(user.id);

  if (!data.levels[userIdStr]) {
    const embed = addLogo(
      new EmbedBuilder()
        .setDescription(`❌ ${user.tag} has no level data to reset!`)
        .setColor(0xED4245),
      config
    );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const oldXp = data.levels[userIdStr].xp;
  const oldLevel = data.levels[userIdStr].level;

  data.levels[userIdStr] = { xp: 0, level: 0, last_message: 0 };
  saveJson(dataPath, data);

  const embed = addLogo(
    new EmbedBuilder()
      .setTitle("🔄 Level Reset")
      .setDescription(
        `Reset level data for ${mention(user.id)}\n\n` +
        `**Previous:** Level ${oldLevel} (${oldXp.toLocaleString()} XP)\n` +
        `**New:** Level 0 (0 XP)`
      )
      .setColor(0xFEE75C),
    config
  );

  await interaction.reply({ embeds: [embed] });
}

module.exports = {
  addXp,
  getLeaderboard,
  handleLevelUp,
  showRank,
  showLeaderboard,
  getXpForLevel,
  setUserLevel,
  addUserXp,
  removeUserXp,
  resetUserLevel,
};
