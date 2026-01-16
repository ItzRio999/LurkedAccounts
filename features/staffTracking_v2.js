const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { saveJson, addLogo } = require("../utils/fileManager");
const { hasStaffRole } = require("../utils/permissions");

// Track activity with streak and achievement tracking
function incStaffActivity(userId, data, dataPath) {
  if (!data.staff_activity) data.staff_activity = {};
  if (!data.staff_activity[userId]) {
    data.staff_activity[userId] = {
      messages: 0,
      daily: {},
      weekly: {},
      monthly: {},
      first_tracked: new Date().toISOString(),
      last_active: new Date().toISOString(),
      streak: 0,
      longest_streak: 0,
      achievements: [],
      milestones: [],
    };
  }

  const today = new Date().toISOString().split('T')[0];
  const week = getWeekNumber(new Date());
  const month = new Date().toISOString().slice(0, 7);
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const activity = data.staff_activity[userId];

  activity.messages++;
  activity.last_active = new Date().toISOString();

  // Daily tracking
  if (!activity.daily[today]) {
    activity.daily[today] = 0;
  }
  activity.daily[today]++;

  // Streak tracking
  if (!activity.daily[yesterday] && today !== activity.last_active.split('T')[0]) {
    activity.streak = 1;
  } else if (activity.daily[yesterday]) {
    activity.streak = (activity.streak || 0) + 1;
    if (activity.streak > (activity.longest_streak || 0)) {
      activity.longest_streak = activity.streak;
      checkAchievement(activity, "streak", activity.streak);
    }
  }

  // Weekly tracking
  if (!activity.weekly[week]) {
    activity.weekly[week] = 0;
  }
  activity.weekly[week]++;

  // Monthly tracking
  if (!activity.monthly[month]) {
    activity.monthly[month] = 0;
  }
  activity.monthly[month]++;

  // Check for milestones
  checkMilestones(activity);

  saveJson(dataPath, data);
}

function checkAchievement(activity, type, value) {
  const achievements = {
    streak: [
      { threshold: 7, title: "🔥 Week Warrior", desc: "7 day streak" },
      { threshold: 30, title: "🔥🔥 Monthly Master", desc: "30 day streak" },
      { threshold: 100, title: "🔥🔥🔥 Century Streak", desc: "100 day streak" },
    ],
  };

  if (achievements[type]) {
    for (const ach of achievements[type]) {
      if (value >= ach.threshold && !activity.achievements.includes(ach.title)) {
        activity.achievements.push(ach.title);
        activity.milestones.push({
          type: "achievement",
          title: ach.title,
          desc: ach.desc,
          date: new Date().toISOString(),
        });
      }
    }
  }
}

function checkMilestones(activity) {
  const milestones = [100, 500, 1000, 5000, 10000, 25000, 50000, 100000];

  for (const milestone of milestones) {
    if (activity.messages >= milestone) {
      const hasThis = activity.milestones.some(m => m.type === "messages" && m.value === milestone);
      if (!hasThis) {
        activity.milestones.push({
          type: "messages",
          value: milestone,
          title: `📊 ${milestone.toLocaleString()} Messages`,
          date: new Date().toISOString(),
        });
      }
    }
  }
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${Math.ceil((((d - yearStart) / 86400000) + 1) / 7)}`;
}

// Calculate staff performance rating (out of 100)
function calculateStaffPerformance(activity) {
  if (!activity.ticket_ratings || activity.ticket_ratings.length === 0) {
    return null; // No ratings yet
  }

  // Calculate average rating from all ticket ratings
  const totalRating = activity.ticket_ratings.reduce((sum, r) => sum + r.rating, 0);
  const avgRating = totalRating / activity.ticket_ratings.length;

  // Convert 1-5 scale to 0-100 percentage
  // 1 star = 20%, 2 stars = 40%, 3 stars = 60%, 4 stars = 80%, 5 stars = 100%
  const percentage = (avgRating / 5) * 100;

  return {
    percentage: percentage.toFixed(1),
    avgRating: avgRating.toFixed(2),
    totalRatings: activity.ticket_ratings.length,
    ticketsHandled: activity.tickets_handled || activity.ticket_ratings.length
  };
}

// Generate performance bar visual
function generatePerformanceBar(percentage) {
  const filled = Math.round(percentage / 10); // 0-10 blocks
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

// Get color based on performance
function getPerformanceColor(percentage) {
  if (percentage >= 80) return 0x57F287; // Green - Excellent
  if (percentage >= 60) return 0xFEE75C; // Yellow - Good
  if (percentage >= 40) return 0xF26522; // Orange - Fair
  return 0xED4245; // Red - Poor
}

// Enhanced staff report with leaderboard
async function showStaffReport(interaction, data, config) {
  const days = interaction.options.getInteger("days") || 7;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoff).toISOString().split('T')[0];

  const staffStats = [];

  for (const [userId, activity] of Object.entries(data.staff_activity || {})) {
    let messageCount = 0;
    let activeDays = 0;

    // Count messages from the last N days
    for (const [date, count] of Object.entries(activity.daily || {})) {
      if (date >= cutoffDate) {
        messageCount += count;
        activeDays++;
      }
    }

    if (messageCount > 0) {
      staffStats.push({
        userId,
        messages: messageCount,
        activeDays,
        avgPerDay: (messageCount / days).toFixed(1),
        lastActive: activity.last_active,
      });
    }
  }

  // Sort by message count
  staffStats.sort((a, b) => b.messages - a.messages);

  const embed = new EmbedBuilder()
    .setTitle(`Staff Activity Report`)
    .setDescription(`Activity over the last **${days} days**`)
    .setColor(0x5865F2)
    .setTimestamp();

  addLogo(embed, config);

  if (staffStats.length === 0) {
    embed.setDescription(`No staff activity recorded in the last ${days} days.`);
  } else {
    // Add top 10 staff members
    const topStaff = staffStats.slice(0, 10);

    let leaderboard = "";
    for (let i = 0; i < topStaff.length; i++) {
      const stat = topStaff[i];
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      const lastActive = `<t:${Math.floor(Date.parse(stat.lastActive) / 1000)}:R>`;

      leaderboard += `${medal} <@${stat.userId}>\n`;
      leaderboard += `\`\`\`Messages: ${stat.messages} | Avg/Day: ${stat.avgPerDay} | Active Days: ${stat.activeDays}/${days}\`\`\`\n`;
    }

    embed.setDescription(
      `Activity over the last **${days} days**\n\n` +
      `**Total Staff Active:** ${staffStats.length}\n` +
      `**Total Messages:** ${staffStats.reduce((sum, s) => sum + s.messages, 0)}\n\n` +
      `**📈 Leaderboard**\n${leaderboard}`
    );

    // Add summary field
    const totalMessages = staffStats.reduce((sum, s) => sum + s.messages, 0);
    const avgMessages = (totalMessages / staffStats.length).toFixed(1);

    embed.addFields(
      {
        name: "Statistics",
        value: `**Avg Messages/Staff:** ${avgMessages}\n**Most Active:** <@${staffStats[0].userId}> (${staffStats[0].messages} msgs)`,
        inline: true
      }
    );
  }

  embed.setFooter({ text: `Use /staffstats to view individual statistics` });

  await interaction.reply({ embeds: [embed] });
}

// Enhanced individual staff stats
async function showStaffStats(interaction, data, config) {
  const user = interaction.options.getUser("member", true);
  const days = interaction.options.getInteger("days") || 7;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoff).toISOString().split('T')[0];

  const activity = data.staff_activity?.[user.id];

  if (!activity) {
    const embed = addLogo(
      new EmbedBuilder()
        .setDescription(`❌ No activity data found for ${user}.`)
        .setColor(0xED4245),
      config
    );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  let messageCount = 0;
  let activeDays = 0;
  const dailyActivity = [];

  // Calculate stats for the period
  for (const [date, count] of Object.entries(activity.daily || {})) {
    if (date >= cutoffDate) {
      messageCount += count;
      activeDays++;
      dailyActivity.push({ date, count });
    }
  }

  dailyActivity.sort((a, b) => b.date.localeCompare(a.date));

  const embed = new EmbedBuilder()
    .setTitle(`Staff Statistics - ${user.tag}`)
    .setDescription(`Activity overview for the last **${days} days**`)
    .setColor(0x5865F2)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setTimestamp();

  // Calculate ticket performance
  const performance = calculateStaffPerformance(activity);

  // Overall stats with streaks
  embed.addFields(
    {
      name: "Overall Activity",
      value:
        `**Total Messages:** ${messageCount}\n` +
        `**Active Days:** ${activeDays}/${days}\n` +
        `**Average/Day:** ${(messageCount / days).toFixed(1)}\n` +
        `**Activity Rate:** ${((activeDays / days) * 100).toFixed(1)}%`,
      inline: true
    },
    {
      name: "Streaks & Records",
      value:
        `**Current Streak:** ${activity.streak || 0} days\n` +
        `**Longest Streak:** ${activity.longest_streak || 0} days\n` +
        `**Total Lifetime:** ${activity.messages.toLocaleString()} msgs\n` +
        `**Achievements:** ${activity.achievements?.length || 0}`,
      inline: true
    },
    {
      name: "Timestamps",
      value:
        `**First Tracked:** <t:${Math.floor(Date.parse(activity.first_tracked) / 1000)}:R>\n` +
        `**Last Active:** <t:${Math.floor(Date.parse(activity.last_active) / 1000)}:R>`,
      inline: true
    }
  );

  // Add ticket performance if available
  if (performance) {
    const performanceBar = generatePerformanceBar(parseFloat(performance.percentage));
    const color = getPerformanceColor(parseFloat(performance.percentage));

    embed.addFields({
      name: "Ticket Performance",
      value:
        `**Performance Rating:** ${performanceBar} **${performance.percentage}%**\n` +
        `**Average Rating:** ${performance.avgRating}/5.00 ⭐\n` +
        `**Tickets Handled:** ${performance.ticketsHandled}\n` +
        `**Total Ratings:** ${performance.totalRatings}`,
      inline: false
    });
  } else if (activity.tickets_handled > 0) {
    embed.addFields({
      name: "Ticket Performance",
      value: `**Tickets Handled:** ${activity.tickets_handled}\n**Ratings:** No ratings yet`,
      inline: false
    });
  }

  // Show achievements if any
  if (activity.achievements && activity.achievements.length > 0) {
    embed.addFields({
      name: "Achievements Unlocked",
      value: activity.achievements.join("\n") || "None yet",
      inline: false
    });
  }

  // Show recent milestones
  if (activity.milestones && activity.milestones.length > 0) {
    const recentMilestones = activity.milestones.slice(-3).reverse();
    const milestoneText = recentMilestones.map(m =>
      `${m.title} - <t:${Math.floor(Date.parse(m.date) / 1000)}:R>`
    ).join("\n");

    embed.addFields({
      name: "Recent Milestones",
      value: milestoneText,
      inline: false
    });
  }

  // Recent daily breakdown (last 7 days)
  if (dailyActivity.length > 0) {
    const recentDays = dailyActivity.slice(0, 7);
    let breakdown = "";

    for (const day of recentDays) {
      const date = new Date(day.date);
      const dateStr = `<t:${Math.floor(date.getTime() / 1000)}:D>`;
      const bar = "█".repeat(Math.min(Math.floor(day.count / 10), 20));
      breakdown += `${dateStr}: \`${bar}\` ${day.count}\n`;
    }

    embed.addFields({
      name: "Recent Daily Activity",
      value: breakdown || "No recent activity",
      inline: false
    });
  }

  // Calculate rank
  const allStats = [];
  for (const [userId, act] of Object.entries(data.staff_activity || {})) {
    let msgs = 0;
    for (const [date, count] of Object.entries(act.daily || {})) {
      if (date >= cutoffDate) msgs += count;
    }
    if (msgs > 0) allStats.push({ userId, msgs });
  }
  allStats.sort((a, b) => b.msgs - a.msgs);
  const rank = allStats.findIndex(s => s.userId === user.id) + 1;

  embed.setFooter({ text: `Rank: #${rank} of ${allStats.length} active staff` });

  await interaction.reply({ embeds: [embed] });
}

// Auto-generate weekly staff reports
async function generateWeeklyReport(client, config, data, dataPath) {
  if (!config.staff_report_channel_id) return;

  const channel = client.channels.cache.get(config.staff_report_channel_id);
  if (!channel) return;

  const days = 7;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoff).toISOString().split('T')[0];

  const staffStats = [];

  for (const [userId, activity] of Object.entries(data.staff_activity || {})) {
    let messageCount = 0;
    for (const [date, count] of Object.entries(activity.daily || {})) {
      if (date >= cutoffDate) messageCount += count;
    }
    if (messageCount > 0) {
      staffStats.push({ userId, messages: messageCount });
    }
  }

  staffStats.sort((a, b) => b.messages - a.messages);

  const embed = new EmbedBuilder()
    .setTitle(`Weekly Staff Report`)
    .setDescription(`Automated weekly activity report`)
    .setColor(0x5865F2)
    .setTimestamp();

  addLogo(embed, config);

  let leaderboard = "";
  for (let i = 0; i < Math.min(staffStats.length, 10); i++) {
    const stat = staffStats[i];
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    leaderboard += `${medal} <@${stat.userId}> - **${stat.messages}** messages\n`;
  }

  embed.setDescription(
    `**Week of:** <t:${Math.floor(cutoff / 1000)}:D> - <t:${Math.floor(Date.now() / 1000)}:D>\n\n` +
    leaderboard
  );

  await channel.send({ embeds: [embed] });
}

module.exports = {
  incStaffActivity,
  showStaffReport,
  showStaffStats,
  generateWeeklyReport,
};
