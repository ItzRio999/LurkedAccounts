const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { saveJson } = require("../utils/fileManager");

// Blocked words list (severe slurs and cheating terms only)
const DEFAULT_BLOCKED_WORDS = [
  // Severe racial slurs - N-word variations
  "nigger", "nigga", "n1gger", "n1gga", "nigg3r", "nigg4", "n!gger", "n!gga",
  "nig", "niqqer", "niqqa", "nibba", "negr0", "n3gr0", "ngr",

  // Other severe slurs
  "chink", "ch1nk", "gook", "g00k", "kike", "k1ke", "coon", "c00n",

  // Cheating/hacking terms
  "spoofer", "sp00fer", "spo0fer", "sp0ofer", "hwid spoof",
  "cheat", "che4t", "ch3at", "cheats", "cheater", "che4ter",
  "hack", "h4ck", "hacks", "hacker", "h4cker", "hax", "haxxor",
  "aimbot", "a1mbot", "wallhack", "wall hack", "esp hack", "radar hack",
  "triggerbot", "bhop hack", "no recoil", "norecoil",
  "inject", "1nject", "injector", "dll inject", "external cheat",
  "undetected", "ud cheat", "private cheat", "sellix", "cracked"
];

// Default automod configuration
const DEFAULT_AUTOMOD_CONFIG = {
  enabled: true,
  spam: {
    enabled: true,
    message_limit: 5, // messages
    time_window: 10000, // ms (10 seconds)
    action: "timeout", // timeout, kick, ban
    timeout_duration: 300000, // 5 minutes
    ignore_roles: []
  },
  caps: {
    enabled: false, // Disabled - only spam protection needed
    percentage: 70, // % of message that is caps
    min_length: 10, // minimum message length to check
    action: "delete",
    ignore_roles: []
  },
  links: {
    enabled: true,
    block_invites: true,
    whitelist: [], // allowed domains
    action: "delete",
    ignore_roles: []
  },
  badwords: {
    enabled: true, // Now enabled by default
    words: DEFAULT_BLOCKED_WORDS,
    action: "strike", // Use strike system
    ignore_roles: [],
    use_strike_system: true // Enable progressive punishment
  },
  strikes: {
    // Progressive punishment system
    // Strike 1: Warning + 5 min timeout
    // Strike 2: 24 hour timeout
    // Strike 3: Permanent ban
    strike_1_action: "timeout",
    strike_1_duration: 300000, // 5 minutes
    strike_2_action: "timeout",
    strike_2_duration: 86400000, // 24 hours
    strike_3_action: "ban"
  },
  log_channel_id: null,
  immune_roles: [] // roles immune to all automod
};

// Message tracking for spam detection
const messageCache = new Map(); // userId -> [timestamps]

// Get automod config or create default
function getAutomodConfig(config) {
  if (!config.automod) {
    config.automod = DEFAULT_AUTOMOD_CONFIG;
  }
  return config.automod;
}

// Check if user has immune role
function hasImmuneRole(member, automodConfig) {
  if (!member || !member.roles) return false;
  return automodConfig.immune_roles.some(roleId => member.roles.cache.has(roleId));
}

// Check spam
function checkSpam(message, automodConfig) {
  if (!automodConfig.spam.enabled) return null;

  const userId = message.author.id;
  const now = Date.now();

  // Get user's recent messages
  if (!messageCache.has(userId)) {
    messageCache.set(userId, []);
  }

  const timestamps = messageCache.get(userId);

  // Remove old timestamps
  const validTimestamps = timestamps.filter(t => now - t < automodConfig.spam.time_window);
  validTimestamps.push(now);
  messageCache.set(userId, validTimestamps);

  // Clean up cache periodically
  if (messageCache.size > 1000) {
    const entries = Array.from(messageCache.entries());
    for (const [uid, times] of entries) {
      if (times.length === 0 || now - times[times.length - 1] > 60000) {
        messageCache.delete(uid);
      }
    }
  }

  // Check if spam threshold exceeded
  if (validTimestamps.length >= automodConfig.spam.message_limit) {
    return {
      type: "spam",
      reason: `Sent ${validTimestamps.length} messages in ${automodConfig.spam.time_window / 1000} seconds`,
      action: automodConfig.spam.action
    };
  }

  return null;
}

// Check caps
function checkCaps(message, automodConfig) {
  if (!automodConfig.caps.enabled) return null;
  if (message.content.length < automodConfig.caps.min_length) return null;

  const letters = message.content.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return null;

  const upperCount = (message.content.match(/[A-Z]/g) || []).length;
  const capsPercentage = (upperCount / letters.length) * 100;

  if (capsPercentage >= automodConfig.caps.percentage) {
    return {
      type: "caps",
      reason: `${Math.round(capsPercentage)}% caps (limit: ${automodConfig.caps.percentage}%)`,
      action: automodConfig.caps.action
    };
  }

  return null;
}

// Check links
function checkLinks(message, automodConfig) {
  if (!automodConfig.links.enabled) return null;

  const content = message.content.toLowerCase();

  // Check for Discord invites
  if (automodConfig.links.block_invites) {
    const inviteRegex = /(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9]+/gi;
    if (inviteRegex.test(content)) {
      return {
        type: "invite",
        reason: "Discord invite link detected",
        action: automodConfig.links.action
      };
    }
  }

  // Check for links
  const linkRegex = /https?:\/\/[^\s]+/gi;
  const links = content.match(linkRegex);

  if (links && links.length > 0) {
    // Check whitelist
    if (automodConfig.links.whitelist.length > 0) {
      // Whitelist exists - check if link is allowed
      const allowed = links.every(link => {
        return automodConfig.links.whitelist.some(domain => link.includes(domain.toLowerCase()));
      });

      if (!allowed) {
        return {
          type: "link",
          reason: "Link not in whitelist",
          action: automodConfig.links.action
        };
      }
    } else {
      // No whitelist - block all links
      return {
        type: "link",
        reason: "Links are not allowed in this channel",
        action: automodConfig.links.action
      };
    }
  }

  return null;
}

// Escape regex special characters to prevent ReDoS attacks
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Check bad words with enhanced detection
function checkBadWords(message, automodConfig) {
  if (!automodConfig.badwords.enabled || automodConfig.badwords.words.length === 0) return null;

  let content = message.content.toLowerCase();

  // Leet speak normalization
  const leetNormalized = content
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a')
    .replace(/!/g, 'i');

  for (const word of automodConfig.badwords.words) {
    const escapedWord = escapeRegex(word.toLowerCase());

    // Check word boundaries in original content (most accurate)
    const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');
    if (regex.test(content) || regex.test(leetNormalized)) {
      return {
        type: "badword",
        reason: `Contains prohibited content`,
        action: automodConfig.badwords.action,
        matchedWord: word
      };
    }

    // Only check for obfuscation with separators (not complete space removal)
    // This prevents false positives like "channels names" being flagged
    const obfuscatedPatterns = [
      content.replace(/[_\-.|]+/g, ''),  // Remove only separators, keep spaces
      content.replace(/\s*[_\-.|]+\s*/g, ''), // Remove separators with optional spaces
    ];

    for (const pattern of obfuscatedPatterns) {
      // Use word boundaries to ensure we're matching the actual word
      const obfuscatedRegex = new RegExp(`\\b${escapedWord}\\b`, 'i');
      if (obfuscatedRegex.test(pattern)) {
        return {
          type: "badword",
          reason: `Contains prohibited content (obfuscated)`,
          action: automodConfig.badwords.action,
          matchedWord: word
        };
      }
    }
  }

  return null;
}

// Add or update user strike
function addStrike(userId, reason, automodConfig, data, dataPath) {
  if (!data.automod_strikes) {
    data.automod_strikes = {};
  }

  if (!data.automod_strikes[userId]) {
    data.automod_strikes[userId] = {
      strikes: 0,
      violations: []
    };
  }

  const userData = data.automod_strikes[userId];
  userData.strikes += 1;
  userData.violations.push({
    timestamp: new Date().toISOString(),
    reason: reason
  });

  // Clean old strikes after 30 days
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  userData.violations = userData.violations.filter(v =>
    new Date(v.timestamp).getTime() > thirtyDaysAgo
  );
  userData.strikes = userData.violations.length;

  data.automod_strikes[userId] = userData;

  // Clean up old users periodically
  const userIds = Object.keys(data.automod_strikes);
  if (userIds.length > 1000) {
    for (const uid of userIds) {
      if (data.automod_strikes[uid].violations.length === 0) {
        delete data.automod_strikes[uid];
      }
    }
  }

  const { saveJson } = require("../utils/fileManager");
  saveJson(dataPath, data);

  return userData;
}

// Get user strikes
function getUserStrikes(userId, data) {
  if (!data.automod_strikes) {
    data.automod_strikes = {};
  }
  return data.automod_strikes[userId] || { strikes: 0, violations: [] };
}

// Execute strike-based action
async function executeStrikeAction(message, violation, automodConfig, data, dataPath) {
  const member = message.member;
  if (!member) return false;

  // Add strike
  const userData = addStrike(message.author.id, violation.reason, automodConfig, data, dataPath);
  const strikes = userData.strikes;

  let action = "delete";
  let duration = 0;
  let actionDescription = "";

  // Determine action based on strike count
  if (strikes === 1) {
    action = automodConfig.strikes.strike_1_action;
    duration = automodConfig.strikes.strike_1_duration;
    actionDescription = `⚠️ **WARNING** - 5 minute timeout`;
  } else if (strikes === 2) {
    action = automodConfig.strikes.strike_2_action;
    duration = automodConfig.strikes.strike_2_duration;
    actionDescription = `🚨 **STRIKE 2** - 24 hour timeout`;
  } else if (strikes >= 3) {
    action = automodConfig.strikes.strike_3_action;
    actionDescription = `🔨 **STRIKE 3** - Permanent ban`;
  }

  try {
    // Always delete the message
    await message.delete().catch(() => {});

    // Execute progressive punishment
    if (action === "timeout" && member) {
      await member.timeout(duration, `Automod Strike ${strikes}: ${violation.reason}`);
    } else if (action === "ban" && member) {
      await member.ban({
        reason: `Automod Strike ${strikes}: ${violation.reason}`,
        deleteMessageSeconds: 604800 // 7 days
      });
    }

    // Try to DM the user
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle("⚠️ Auto-Moderation Action")
        .setDescription(
          `You have received a strike in **${message.guild.name}**\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .addFields(
          { name: "📊 Strike Count", value: `${strikes}/3`, inline: true },
          { name: "⚡ Action Taken", value: actionDescription, inline: true },
          { name: "📝 Reason", value: violation.reason, inline: false },
          { name: "⏰ Progressive Punishment", value:
            `• Strike 1: Warning + 5 min timeout\n` +
            `• Strike 2: 24 hour timeout\n` +
            `• Strike 3: Permanent ban`,
            inline: false
          }
        )
        .setColor(strikes === 1 ? 0xFEE75C : strikes === 2 ? 0xF26522 : 0xED4245)
        .setFooter({ text: "Strikes reset after 30 days" })
        .setTimestamp();

      await message.author.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch (error) {
      // Ignore DM errors
    }

    // Log to channel
    if (automodConfig.log_channel_id) {
      const logChannel = message.guild.channels.cache.get(automodConfig.log_channel_id);
      if (logChannel) {
        // Different GIF for each strike level
        const strikeGifs = {
          1: "https://media.giphy.com/media/7T2R1eAIKnEJnAf5U8/giphy.gif", // Warning
          2: "https://media.giphy.com/media/6ra84Uso2hoir3YCgb/giphy.gif", // Strike 2
          3: "https://media.giphy.com/media/H99r2HtnYs492/giphy.gif"  // Ban hammer
        };

        const embed = new EmbedBuilder()
          .setTitle(`🚨 Auto-Moderation Strike System`)
          .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━`)
          .addFields(
            { name: "👤 User", value: `${message.author} (${message.author.tag})`, inline: true },
            { name: "📊 Strikes", value: `${strikes}/3`, inline: true },
            { name: "⚡ Action", value: actionDescription, inline: true },
            { name: "📝 Violation", value: violation.type.toUpperCase(), inline: true },
            { name: "📍 Channel", value: `${message.channel}`, inline: true },
            { name: "\u200b", value: "\u200b", inline: true },
            { name: "❓ Reason", value: violation.reason, inline: false }
          )
          .setColor(strikes === 1 ? 0xFEE75C : strikes === 2 ? 0xF26522 : 0xED4245)
          .setImage(strikeGifs[strikes] || strikeGifs[3])
          .setAuthor({ name: "Strike System", iconURL: "https://cdn-icons-png.flaticon.com/512/6195/6195699.png" })
          .setFooter({ text: `User ID: ${message.author.id} • Strikes reset after 30 days` })
          .setTimestamp();

        if (message.content && message.content.length > 0) {
          // Censor the bad word in logs
          let censoredContent = message.content;
          if (violation.matchedWord) {
            const regex = new RegExp(escapeRegex(violation.matchedWord), 'gi');
            censoredContent = censoredContent.replace(regex, '[CENSORED]');
          }
          embed.addFields({
            name: "💬 Message Content",
            value: censoredContent.substring(0, 1000),
            inline: false
          });
        }

        await logChannel.send({ embeds: [embed] });
      }
    }

    return true;
  } catch (error) {
    console.error("Error executing strike action:", error);
    return false;
  }
}

// Execute moderation action
async function executeAction(message, violation, automodConfig) {
  const action = violation.action;
  const member = message.member;

  try {
    // Delete message if needed
    if (action === "delete" || action === "timeout" || action === "kick" || action === "ban") {
      await message.delete().catch(() => {});
    }

    // Take action on member
    if (action === "timeout" && member) {
      await member.timeout(automodConfig.spam.timeout_duration, `Automod: ${violation.reason}`);
    } else if (action === "kick" && member) {
      await member.kick(`Automod: ${violation.reason}`);
    } else if (action === "ban" && member) {
      await member.ban({ reason: `Automod: ${violation.reason}`, deleteMessageSeconds: 86400 });
    }

    // Log to channel
    if (automodConfig.log_channel_id) {
      const logChannel = message.guild.channels.cache.get(automodConfig.log_channel_id);
      if (logChannel) {
        const actionEmojis = {
          delete: "🗑️",
          timeout: "⏰",
          kick: "👢",
          ban: "🔨"
        };

        const embed = new EmbedBuilder()
          .setTitle(`${actionEmojis[action] || "⚠️"} Auto-Moderation Action`)
          .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━`)
          .addFields(
            { name: "👤 User", value: `${message.author} (${message.author.tag})`, inline: true },
            { name: "📝 Violation", value: violation.type.toUpperCase(), inline: true },
            { name: "⚡ Action", value: action.toUpperCase(), inline: true },
            { name: "📍 Channel", value: `${message.channel}`, inline: true },
            { name: "❓ Reason", value: violation.reason, inline: true },
            { name: "\u200b", value: "\u200b", inline: true }
          )
          .setColor(action === "delete" ? 0xFEE75C : 0xED4245)
          .setAuthor({ name: "Auto-Moderation System", iconURL: "https://cdn-icons-png.flaticon.com/512/6195/6195699.png" })
          .setTimestamp();

        if (message.content) {
          embed.addFields({
            name: "💬 Message Content",
            value: message.content.substring(0, 1000),
            inline: false
          });
        }

        await logChannel.send({ embeds: [embed] });
      }
    }

    return true;
  } catch (error) {
    console.error("Error executing automod action:", error);
    return false;
  }
}

// Check if channel is a ticket channel
function isTicketChannel(channelId, data) {
  return data.tickets && data.tickets[channelId] && !data.tickets[channelId].closed;
}

// Process message through automod
async function processMessage(message, config, configPath, data) {
  // Ignore bots and DMs
  if (message.author.bot || !message.guild) return;

  const automodConfig = getAutomodConfig(config);
  if (!automodConfig.enabled) return;

  // Check if user is immune
  if (hasImmuneRole(message.member, automodConfig)) return;

  // Check permissions
  if (message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

  // Check if this is a ticket channel - exempt from caps and links
  const isTicket = data && isTicketChannel(message.channel.id, data);

  // Run all checks (skip caps and links in tickets)
  const checks = [
    checkSpam(message, automodConfig),
    isTicket ? null : checkCaps(message, automodConfig),
    isTicket ? null : checkLinks(message, automodConfig),
    checkBadWords(message, automodConfig)
  ].filter(Boolean);

  for (const violation of checks) {
    if (violation) {
      // Check specific ignore roles
      const specificConfig = automodConfig[violation.type === "invite" ? "links" : violation.type === "badword" ? "badwords" : violation.type];
      if (specificConfig?.ignore_roles?.some(roleId => message.member?.roles.cache.has(roleId))) {
        continue;
      }

      // Use strike system for bad words if enabled
      if (violation.action === "strike" && automodConfig.badwords.use_strike_system) {
        await executeStrikeAction(message, violation, automodConfig, data, configPath);
      } else {
        await executeAction(message, violation, automodConfig);
      }
      break; // Only execute first violation
    }
  }
}

// Configure automod
async function configureAutomod(interaction, config, configPath) {
  const subcommand = interaction.options.getSubcommand();
  const automodConfig = getAutomodConfig(config);

  if (subcommand === "enable") {
    automodConfig.enabled = true;
    config.automod = automodConfig;
    saveJson(configPath, config);

    const embed = new EmbedBuilder()
      .setDescription("✅ Auto-moderation enabled!")
      .setColor(0x57F287);
    return interaction.reply({ embeds: [embed] });
  }

  if (subcommand === "disable") {
    automodConfig.enabled = false;
    config.automod = automodConfig;
    saveJson(configPath, config);

    const embed = new EmbedBuilder()
      .setDescription("❌ Auto-moderation disabled!")
      .setColor(0xED4245);
    return interaction.reply({ embeds: [embed] });
  }

  if (subcommand === "spam") {
    const enabled = interaction.options.getBoolean("enabled") ?? automodConfig.spam.enabled;
    const messageLimit = interaction.options.getInteger("messages") ?? automodConfig.spam.message_limit;
    const timeWindow = interaction.options.getInteger("seconds") ?? (automodConfig.spam.time_window / 1000);
    const action = interaction.options.getString("action") ?? automodConfig.spam.action;

    automodConfig.spam.enabled = enabled;
    automodConfig.spam.message_limit = messageLimit;
    automodConfig.spam.time_window = timeWindow * 1000;
    automodConfig.spam.action = action;

    config.automod = automodConfig;
    saveJson(configPath, config);

    const embed = new EmbedBuilder()
      .setTitle("Spam Filter Configured")
      .setDescription("━━━━━━━━━━━━━━━━━━━━━━━━━")
      .addFields(
        { name: "Status", value: enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
        { name: "Trigger", value: `${messageLimit} messages in ${timeWindow}s`, inline: true },
        { name: "Action", value: action.toUpperCase(), inline: true }
      )
      .setColor(0x57F287)
      .setAuthor({ name: "Auto-Moderation", iconURL: "https://cdn-icons-png.flaticon.com/512/6195/6195699.png" })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  if (subcommand === "caps") {
    const enabled = interaction.options.getBoolean("enabled") ?? automodConfig.caps.enabled;
    const percentage = interaction.options.getInteger("percentage") ?? automodConfig.caps.percentage;
    const action = interaction.options.getString("action") ?? automodConfig.caps.action;

    automodConfig.caps.enabled = enabled;
    automodConfig.caps.percentage = percentage;
    automodConfig.caps.action = action;

    config.automod = automodConfig;
    saveJson(configPath, config);

    const embed = new EmbedBuilder()
      .setTitle("Caps Filter Configured")
      .setDescription("━━━━━━━━━━━━━━━━━━━━━━━━━")
      .addFields(
        { name: "Status", value: enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
        { name: "Threshold", value: `${percentage}% caps`, inline: true },
        { name: "Action", value: action.toUpperCase(), inline: true }
      )
      .setColor(0x57F287)
      .setAuthor({ name: "Auto-Moderation", iconURL: "https://cdn-icons-png.flaticon.com/512/6195/6195699.png" })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  if (subcommand === "links") {
    const enabled = interaction.options.getBoolean("enabled") ?? automodConfig.links.enabled;
    const blockInvites = interaction.options.getBoolean("block_invites") ?? automodConfig.links.block_invites;
    const action = interaction.options.getString("action") ?? automodConfig.links.action;

    automodConfig.links.enabled = enabled;
    automodConfig.links.block_invites = blockInvites;
    automodConfig.links.action = action;

    config.automod = automodConfig;
    saveJson(configPath, config);

    const embed = new EmbedBuilder()
      .setTitle("Link Filter Configured")
      .setDescription("━━━━━━━━━━━━━━━━━━━━━━━━━")
      .addFields(
        { name: "Status", value: enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
        { name: "Block Invites", value: blockInvites ? "✅ Yes" : "❌ No", inline: true },
        { name: "Action", value: action.toUpperCase(), inline: true }
      )
      .setColor(0x57F287)
      .setAuthor({ name: "Auto-Moderation", iconURL: "https://cdn-icons-png.flaticon.com/512/6195/6195699.png" })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  if (subcommand === "badwords") {
    const word = interaction.options.getString("word");
    const remove = interaction.options.getBoolean("remove") || false;

    if (remove) {
      automodConfig.badwords.words = automodConfig.badwords.words.filter(w => w.toLowerCase() !== word.toLowerCase());
      config.automod = automodConfig;
      saveJson(configPath, config);

      const embed = new EmbedBuilder()
        .setDescription(`✅ Removed \`${word}\` from bad words list`)
        .setColor(0x57F287);
      return interaction.reply({ embeds: [embed], flags: 64 });
    } else {
      if (!automodConfig.badwords.words.includes(word.toLowerCase())) {
        automodConfig.badwords.words.push(word.toLowerCase());
        automodConfig.badwords.enabled = true;
      }

      config.automod = automodConfig;
      saveJson(configPath, config);

      const embed = new EmbedBuilder()
        .setDescription(`✅ Added \`${word}\` to bad words list\n\n**Total words:** ${automodConfig.badwords.words.length}`)
        .setColor(0x57F287);
      return interaction.reply({ embeds: [embed], flags: 64 });
    }
  }

  if (subcommand === "whitelist") {
    const domain = interaction.options.getString("domain");
    const remove = interaction.options.getBoolean("remove") || false;

    if (remove) {
      automodConfig.links.whitelist = automodConfig.links.whitelist.filter(d => d.toLowerCase() !== domain.toLowerCase());
    } else {
      if (!automodConfig.links.whitelist.includes(domain.toLowerCase())) {
        automodConfig.links.whitelist.push(domain.toLowerCase());
      }
    }

    config.automod = automodConfig;
    saveJson(configPath, config);

    const embed = new EmbedBuilder()
      .setDescription(`✅ ${remove ? "Removed" : "Added"} \`${domain}\` ${remove ? "from" : "to"} whitelist\n\n**Whitelisted domains:** ${automodConfig.links.whitelist.length}`)
      .setColor(0x57F287);
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (subcommand === "logchannel") {
    const channel = interaction.options.getChannel("channel", true);

    automodConfig.log_channel_id = channel.id;
    config.automod = automodConfig;
    saveJson(configPath, config);

    const embed = new EmbedBuilder()
      .setDescription(`✅ Auto-mod log channel set to ${channel}`)
      .setColor(0x57F287);
    return interaction.reply({ embeds: [embed] });
  }

  if (subcommand === "immune") {
    const role = interaction.options.getRole("role", true);
    const remove = interaction.options.getBoolean("remove") || false;

    if (remove) {
      automodConfig.immune_roles = automodConfig.immune_roles.filter(r => r !== role.id);
    } else {
      if (!automodConfig.immune_roles.includes(role.id)) {
        automodConfig.immune_roles.push(role.id);
      }
    }

    config.automod = automodConfig;
    saveJson(configPath, config);

    const embed = new EmbedBuilder()
      .setDescription(`✅ ${remove ? "Removed" : "Added"} ${role} ${remove ? "from" : "to"} immune roles`)
      .setColor(0x57F287);
    return interaction.reply({ embeds: [embed] });
  }

  if (subcommand === "status") {
    const embed = new EmbedBuilder()
      .setTitle("Auto-Moderation Status")
      .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━\n**System:** ${automodConfig.enabled ? "✅ Enabled" : "❌ Disabled"}`)
      .addFields(
        {
          name: "🚫 Spam Filter",
          value: `${automodConfig.spam.enabled ? "✅" : "❌"} ${automodConfig.spam.message_limit} msgs/${automodConfig.spam.time_window / 1000}s → ${automodConfig.spam.action}`,
          inline: true
        },
        {
          name: "📢 Caps Filter",
          value: `${automodConfig.caps.enabled ? "✅" : "❌"} ${automodConfig.caps.percentage}% → ${automodConfig.caps.action}`,
          inline: true
        },
        {
          name: "🔗 Link Filter",
          value: `${automodConfig.links.enabled ? "✅" : "❌"} ${automodConfig.links.block_invites ? "Block invites" : "Allow invites"}\n→ ${automodConfig.links.action}`,
          inline: true
        },
        {
          name: "💬 Bad Words",
          value: `${automodConfig.badwords.enabled ? "✅" : "❌"} ${automodConfig.badwords.words.length} words → ${automodConfig.badwords.action}`,
          inline: true
        },
        {
          name: "📝 Log Channel",
          value: automodConfig.log_channel_id ? `<#${automodConfig.log_channel_id}>` : "Not set",
          inline: true
        },
        {
          name: "🛡️ Immune Roles",
          value: automodConfig.immune_roles.length > 0 ? automodConfig.immune_roles.map(r => `<@&${r}>`).join(", ") : "None",
          inline: true
        }
      )
      .setColor(0x5865F2)
      .setAuthor({ name: "Auto-Moderation System", iconURL: "https://cdn-icons-png.flaticon.com/512/6195/6195699.png" })
      .setFooter({ text: "Use /automod <feature> to configure" })
      .setTimestamp();

    if (automodConfig.links.whitelist.length > 0) {
      embed.addFields({
        name: "✅ Whitelisted Domains",
        value: automodConfig.links.whitelist.join(", "),
        inline: false
      });
    }

    return interaction.reply({ embeds: [embed] });
  }
}

// Remove strikes from a user
function removeUserStrikes(userId, data, dataPath) {
  if (!data.automod_strikes) {
    data.automod_strikes = {};
  }

  if (data.automod_strikes[userId]) {
    delete data.automod_strikes[userId];
    const { saveJson } = require("../utils/fileManager");
    saveJson(dataPath, data);
    return true;
  }

  return false;
}

// Remove all strikes from all users (mass removal)
function removeAllStrikes(data, dataPath) {
  if (!data.automod_strikes) {
    return 0;
  }

  const count = Object.keys(data.automod_strikes).length;
  data.automod_strikes = {};

  const { saveJson } = require("../utils/fileManager");
  saveJson(dataPath, data);

  return count;
}

module.exports = {
  processMessage,
  configureAutomod,
  getAutomodConfig,
  getUserStrikes,
  removeUserStrikes,
  removeAllStrikes,
  DEFAULT_AUTOMOD_CONFIG,
  DEFAULT_BLOCKED_WORDS
};
