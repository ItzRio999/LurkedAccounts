const { EmbedBuilder } = require("discord.js");
const { saveJson, addLogo } = require("../utils/fileManager");
const { mention } = require("../utils/permissions");

function addBoostLog(userId, action, data, dataPath) {
  if (!data.boost_log) data.boost_log = [];

  data.boost_log.push({
    user_id: String(userId),
    action,
    timestamp: new Date().toISOString(),
  });
  saveJson(dataPath, data);
}

function summarizeBoosts(data, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let gains = 0;
  let losses = 0;

  for (const entry of data.boost_log || []) {
    const ts = Date.parse(entry.timestamp);
    if (Number.isNaN(ts) || ts < cutoff) continue;
    if (entry.action === "boost_start") gains += 1;
    if (entry.action === "boost_end") losses += 1;
  }

  return { gains, losses };
}

async function showBoostReport(interaction, data) {
  const days = interaction.options.getInteger("days") || 30;
  const { gains, losses } = summarizeBoosts(data, days);
  const net = gains - losses;

  const embed = new EmbedBuilder()
    .setTitle("📊 Boost Report")
    .setDescription(`Server boost statistics for the last ${days} day${days !== 1 ? "s" : ""}.`)
    .addFields(
      { name: "📈 Boosts Gained", value: `${gains}`, inline: true },
      { name: "📉 Boosts Lost", value: `${losses}`, inline: true },
      {
        name: "📊 Net Change",
        value: `${net >= 0 ? "+" : ""}${net}`,
        inline: true,
      }
    )
    .setColor(net >= 0 ? 0x57F287 : 0xED4245)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function showBoostLog(interaction, data) {
  const limit = interaction.options.getInteger("limit") || 5;
  const entries = (data.boost_log || []).slice(-limit).reverse();

  if (!entries.length) {
    const embed = new EmbedBuilder()
      .setDescription("No boost events recorded yet.")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed] });
  }

  const description = entries
    .map((entry) => {
      const timestamp = Math.floor(Date.parse(entry.timestamp) / 1000);
      const action = entry.action === "boost_start" ? "📈 Started Boosting" : "📉 Stopped Boosting";
      return `<t:${timestamp}:R> - ${mention(entry.user_id)}\n${action}`;
    })
    .join("\n\n");

  const embed = new EmbedBuilder()
    .setTitle("📋 Recent Boost Events")
    .setDescription(description)
    .setColor(0x5865F2)
    .setFooter({ text: `Showing ${entries.length} most recent event${entries.length !== 1 ? "s" : ""}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function showCurrentBoosters(interaction, config, data) {
  const members = await interaction.guild.members.fetch();
  const boosters = members.filter((m) => m.premiumSince);

  const boostLevel = interaction.guild.premiumTier;
  const boostCount = interaction.guild.premiumSubscriptionCount || boosters.size;

  const levelNames = {
    0: "No Level",
    1: "Level 1",
    2: "Level 2",
    3: "Level 3",
  };

  // Calculate boosts needed for next level
  const nextLevelThresholds = { 0: 2, 1: 7, 2: 14, 3: null };
  const nextThreshold = nextLevelThresholds[boostLevel];
  const toNextLevel = nextThreshold ? nextThreshold - boostCount : 0;

  // Get user boost counts
  const userBoostCounts = {};
  for (const booster of boosters.values()) {
    const userId = String(booster.id);
    const boostLogs = (data.boost_log || []).filter(
      (log) => log.user_id === userId && log.action === "boost_start"
    );
    userBoostCounts[userId] = boostLogs.length;
  }

  // Find top boosters
  const topBoosters = Object.entries(userBoostCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  let description = `Current boosters and boost level for ${interaction.guild.name}\n\n`;

  if (nextThreshold) {
    description += `**${toNextLevel}** more boost${toNextLevel !== 1 ? "s" : ""} needed to reach **${levelNames[boostLevel + 1]}**! 🎯`;
  } else {
    description += `**Maximum boost level reached!** 🎉`;
  }

  const embed = new EmbedBuilder()
    .setTitle("💎 Server Boost Status")
    .setDescription(description)
    .addFields(
      { name: "🎯 Boost Level", value: levelNames[boostLevel] || "Unknown", inline: true },
      { name: "📊 Total Boosts", value: `${boostCount}`, inline: true },
      { name: "👥 Active Boosters", value: `${boosters.size}`, inline: true }
    )
    .setColor(0xF47FFF)
    .setTimestamp();

  // Add top boosters section
  if (topBoosters.length > 0) {
    const topBoosterText = topBoosters
      .map(([userId, count], index) => {
        const medals = ["🥇", "🥈", "🥉"];
        const medal = medals[index] || "💎";
        return `${medal} ${mention(userId)} - **${count}** boost${count !== 1 ? "s" : ""}`;
      })
      .join("\n");
    embed.addFields({ name: "🏆 Top Boosters", value: topBoosterText });
  }

  // Add booster list if small enough
  if (boosters.size > 0 && boosters.size <= 15) {
    const boosterList = boosters
      .map((m) => {
        const count = userBoostCounts[String(m.id)] || 0;
        const sinceTimestamp = Math.floor(m.premiumSince.getTime() / 1000);
        return `${mention(m.id)} - Boosting since <t:${sinceTimestamp}:R>`;
      })
      .join("\n");
    embed.addFields({ name: "💝 Thank you to our Boosters!", value: boosterList });
  } else if (boosters.size > 15) {
    embed.addFields({
      name: "💝 Boosters",
      value: `Too many to list! Use \`/boostlog\` to see recent boost activity.`
    });
  }

  await interaction.reply({ embeds: [embed] });
}

module.exports = {
  addBoostLog,
  summarizeBoosts,
  showBoostReport,
  showBoostLog,
  showCurrentBoosters,
};
