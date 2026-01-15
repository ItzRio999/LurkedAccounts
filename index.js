// Load environment variables first
require("dotenv").config();

const { Client, GatewayIntentBits, Partials, REST, Routes, ActivityType } = require("discord.js");
const { loadJson, CONFIG_PATH, DATA_PATH } = require("./utils/fileManager");
const { hasStaffRole } = require("./utils/permissions");
const { handleInteraction } = require("./handlers/interactions");
const commands = require("./handlers/commands");
const ApiServer = require("./api/server");

// Lazy-load feature modules (loaded on-demand for better memory efficiency on Pi)
let levelingModule, ticketsModule, staffTrackingModule, boostTrackingModule;
let welcomeModule, auditLogsModule, pollsModule, giveawaysModule, automodModule, ticketEnhancementsModule;

// Load configuration and data
const config = loadJson(CONFIG_PATH, null);
if (!config) {
  throw new Error("Missing config.json. Copy config.example.json to config.json and edit it.");
}

// Override token with environment variable if available
if (process.env.DISCORD_TOKEN) {
  config.token = process.env.DISCORD_TOKEN;
}

// Validate token
if (!config.token) {
  throw new Error("Missing Discord token! Set DISCORD_TOKEN in .env file or add token to config.json");
}

const data = loadJson(DATA_PATH, {
  staff_activity: {},
  boost_log: [],
  levels: {},
  tickets: {},
  ticket_counter: 0,
  closed_tickets: [],
  polls: {},
  message_cache: {},
  automod_strikes: {},
  giveaways: {}
});

// Initialize Discord client with optimizations for Raspberry Pi
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences, // For member status tracking
  ],
  partials: [
    Partials.GuildMember,
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
  ],
  // Optimize sweepers for low-memory devices (Pi 3B+)
  sweepers: {
    // Sweep caches periodically to free memory
    messages: {
      interval: 300, // Every 5 minutes
      lifetime: 900, // Messages older than 15 minutes
    },
    users: {
      interval: 3600, // Every hour
      filter: () => user => user.bot && user.id !== client.user?.id,
    },
  },
});

// Register slash commands
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(config.token);

  try {
    console.log("Started refreshing application (/) commands.");

    // Support both guild_ids array and legacy guild_id
    const guildIds = config.guild_ids || (config.guild_id ? [config.guild_id] : []);

    if (guildIds.length > 0) {
      // Register to multiple guilds
      for (const guildId of guildIds) {
        await rest.put(Routes.applicationGuildCommands(config.client_id, guildId), {
          body: commands,
        });
        console.log(`✅ Successfully registered commands to guild: ${guildId}`);
      }
    } else {
      // Register globally if no guilds specified
      await rest.put(Routes.applicationCommands(config.client_id), { body: commands });
      console.log("✅ Successfully registered global slash commands.");
    }
  } catch (error) {
    console.error("❌ Error registering commands:", error);
  }
}

// ============== EVENT HANDLERS ==============

// Initialize API Server
let apiServer = null;

client.on("clientReady", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📊 Serving ${client.guilds.cache.size} guild(s)`);

  // Fetch all guild members for team showcase feature
  try {
    for (const guild of client.guilds.cache.values()) {
      await guild.members.fetch();
      console.log(`👥 Cached ${guild.memberCount} members from ${guild.name}`);
    }
  } catch (error) {
    console.error('⚠️ Error fetching guild members:', error);
  }

  // Start API server after bot is ready
  apiServer = new ApiServer(client);
  const apiPort = process.env.API_PORT || 3001;
  apiServer.start(apiPort);

  // Enhanced rotating status messages with Rich Presence
  const statuses = [
    { name: "your support tickets 🎫", type: ActivityType.Watching, state: "Managing Tickets" },
    { name: "Lurked Accounts 🔐", type: ActivityType.Playing, state: "Premium Service" },
    { name: "with premium services 💎", type: ActivityType.Playing, state: "Elite Access" },
    { name: "staff performance 📊", type: ActivityType.Watching, state: "Tracking Activity" },
    { name: "to /help commands ❓", type: ActivityType.Listening, state: "Ready to Assist" },
    { name: `${client.guilds.cache.size} server${client.guilds.cache.size !== 1 ? 's' : ''} 🌐`, type: ActivityType.Watching, state: "Multi-Server" },
    { name: "for bad words 🛡️", type: ActivityType.Watching, state: "Auto-Moderation" },
    { name: "leveling system 🎮", type: ActivityType.Competing, state: "Rank Up!" },
  ];

  let currentStatus = 0;

  // Set initial status with Rich Presence
  client.user.setPresence({
    activities: [{
      name: statuses[0].name,
      type: statuses[0].type,
      state: statuses[0].state
    }],
    status: 'online'
  });

  // Rotate status every 45 seconds for more dynamic presence
  setInterval(() => {
    currentStatus = (currentStatus + 1) % statuses.length;
    client.user.setPresence({
      activities: [{
        name: statuses[currentStatus].name,
        type: statuses[currentStatus].type,
        state: statuses[currentStatus].state
      }],
      status: 'online'
    });
  }, 45000);

  // Resume active polls on bot restart (lazy load)
  pollsModule = require("./features/polls");
  for (const [messageId, poll] of Object.entries(data.polls || {})) {
    if (poll.active && poll.end_time > Date.now()) {
      const remaining = poll.end_time - Date.now();
      const guild = client.guilds.cache.first();
      if (guild) {
        setTimeout(() => pollsModule.endPoll(messageId, guild, data, DATA_PATH), remaining);
      }
    }
  }

  // Check for expired giveaways every 60 seconds (reduced from 30s for Pi)
  giveawaysModule = require("./features/giveaways");
  setInterval(() => {
    giveawaysModule.checkGiveaways(client, data, DATA_PATH);
  }, 60000);

  // Initial giveaway check
  giveawaysModule.checkGiveaways(client, data, DATA_PATH);

  // Check for inactive tickets every 2 hours (reduced from 1h for Pi)
  ticketEnhancementsModule = require("./features/ticketEnhancements");
  setInterval(() => {
    ticketEnhancementsModule.checkInactiveTickets(client, data, DATA_PATH, config);
  }, 2 * 60 * 60 * 1000);

  // Initial inactive ticket check
  ticketEnhancementsModule.checkInactiveTickets(client, data, DATA_PATH, config);
});

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;

  // Lazy load modules on first use
  if (!automodModule) automodModule = require("./features/automod");
  if (!ticketEnhancementsModule) ticketEnhancementsModule = require("./features/ticketEnhancements");
  if (!levelingModule) levelingModule = require("./features/leveling");
  if (!ticketsModule) ticketsModule = require("./features/tickets_v2");
  if (!staffTrackingModule) staffTrackingModule = require("./features/staffTracking_v2");
  if (!auditLogsModule) auditLogsModule = require("./features/auditLogs");

  // Auto-moderation processing (runs first to catch violations)
  await automodModule.processMessage(message, config, CONFIG_PATH, data);

  // Update ticket activity tracking
  ticketEnhancementsModule.updateTicketActivity(message.channel.id, data, DATA_PATH);

  // Track staff activity
  if (message.member && hasStaffRole(message.member, config)) {
    staffTrackingModule.incStaffActivity(message.author.id, data, DATA_PATH);
  }

  // Add XP for leveling system
  const result = levelingModule.addXp(message.author.id, data, DATA_PATH);
  if (result && result.leveledUp) {
    await levelingModule.handleLevelUp(message, result.newLevel, config, data);
  }

  // Log messages in tickets for transcripts
  ticketsModule.logTicketMessage(message, data, DATA_PATH);

  // Cache message for audit logging (only if enabled)
  if (config.audit_log_channel_id) {
    auditLogsModule.cacheMessage(message, data, DATA_PATH);
  }
});

// Welcome messages
client.on("guildMemberAdd", async (member) => {
  if (!welcomeModule) welcomeModule = require("./features/welcome");
  if (!auditLogsModule) auditLogsModule = require("./features/auditLogs");

  await welcomeModule.sendWelcomeMessage(member, config);
  await auditLogsModule.logMemberJoin(member, config);
});

// Leave messages
client.on("guildMemberRemove", async (member) => {
  if (!welcomeModule) welcomeModule = require("./features/welcome");
  if (!auditLogsModule) auditLogsModule = require("./features/auditLogs");

  await welcomeModule.sendLeaveMessage(member, config);
  await auditLogsModule.logMemberLeave(member, config);
});

// Member updates (boost tracking and role changes)
client.on("guildMemberUpdate", async (before, after) => {
  if (!boostTrackingModule) boostTrackingModule = require("./features/boostTracking");
  if (!auditLogsModule) auditLogsModule = require("./features/auditLogs");

  // Boost tracking
  const boosterRoleId = config.booster_role_id;
  const boosterRole = boosterRoleId ? after.guild.roles.cache.get(boosterRoleId) : null;

  const beforeBoost = Boolean(before.premiumSince);
  const afterBoost = Boolean(after.premiumSince);

  if (!beforeBoost && afterBoost) {
    boostTrackingModule.addBoostLog(after.id, "boost_start", data, DATA_PATH);
    if (boosterRole && !after.roles.cache.has(boosterRoleId)) {
      await after.roles.add(boosterRole, "Auto-manage boost role (gained)").catch(console.error);
    }
  } else if (beforeBoost && !afterBoost) {
    boostTrackingModule.addBoostLog(after.id, "boost_end", data, DATA_PATH);
    if (boosterRole && after.roles.cache.has(boosterRoleId)) {
      await after.roles.remove(boosterRole, "Auto-manage boost role (lost)").catch(console.error);
    }
  }

  // Log role changes
  await auditLogsModule.logRoleUpdate(before, after, config);
});

// Message delete logging (only if enabled)
client.on("messageDelete", async (message) => {
  if (config.audit_log_channel_id) {
    if (!auditLogsModule) auditLogsModule = require("./features/auditLogs");
    await auditLogsModule.logMessageDelete(message, config, data);
  }
});

// Message edit logging (only if enabled)
client.on("messageUpdate", async (before, after) => {
  if (config.audit_log_channel_id) {
    if (!auditLogsModule) auditLogsModule = require("./features/auditLogs");
    await auditLogsModule.logMessageEdit(before, after, config);
  }
});

// Interaction handler
client.on("interactionCreate", async (interaction) => {
  try {
    await handleInteraction(interaction, config, data, CONFIG_PATH, DATA_PATH);
  } catch (error) {
    console.error("Error handling interaction:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while processing your command.",
        ephemeral: true,
      }).catch(console.error);
    }
  }
});

// Handle errors
client.on("error", (error) => {
  console.error("Discord client error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  if (apiServer) {
    apiServer.stop();
  }
  client.destroy();
  process.exit(0);
});

// Start the bot
(async () => {
  try {
    await registerCommands();
    await client.login(config.token);
  } catch (error) {
    console.error("Failed to start bot:", error);
    process.exit(1);
  }
})();
